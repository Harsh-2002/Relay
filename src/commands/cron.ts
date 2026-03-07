import type { Bot, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import {
  listJobs, addJob, removeJob, toggleJob, runJobNow,
  formatSchedule, formatInTimezone, getTimezoneAbbr, getPartsInTz,
  type CronSchedule,
} from "../cron.js";
import { escapeHtml } from "../utils/html.js";
import { promptForInput } from "../utils/input.js";
import { getConfig } from "../config/index.js";

const MAX_JOBS_DISPLAY = 30; // Cap keyboard buttons (30 jobs × 3 buttons + 1 = 91 < 100 limit)
const MAX_NAME_DISPLAY = 40; // Truncate job names in list

// --- Build UI ---

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

function formatNextRun(nextRunAt: number, tz: string): string {
  const now = Date.now();
  const nowParts = getPartsInTz(now, tz);
  const nextParts = getPartsInTz(nextRunAt, tz);
  const time = formatInTimezone(nextRunAt, tz);

  // Same day
  if (nowParts.year === nextParts.year && nowParts.month === nextParts.month && nowParts.day === nextParts.day) {
    return `today ${time}`;
  }

  // Tomorrow
  const tomorrowMs = now + 86400_000;
  const tomParts = getPartsInTz(tomorrowMs, tz);
  if (tomParts.year === nextParts.year && tomParts.month === nextParts.month && tomParts.day === nextParts.day) {
    return `tomorrow ${time}`;
  }

  // Within 7 days — show day name
  if (nextRunAt - now < 7 * 86400_000) {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return `${dayNames[nextParts.weekday]} ${time}`;
  }

  // Farther out — show date
  return formatInTimezone(nextRunAt, tz, "datetime");
}

function buildCronList(): { text: string; keyboard: InlineKeyboard } {
  const allJobs = listJobs();
  const kb = new InlineKeyboard();

  if (allJobs.length === 0) {
    kb.row().text("+ Add Job", "cron_add");
    return {
      text: "<b>Cron Jobs</b>\n\nNo scheduled jobs yet.",
      keyboard: kb,
    };
  }

  // Cap displayed jobs to stay under Telegram's 100-button keyboard limit
  const displayJobs = allJobs.slice(0, MAX_JOBS_DISPLAY);
  const overflow = allJobs.length > MAX_JOBS_DISPLAY;

  const tz = getConfig().timezone || "UTC";
  const tzAbbr = getTimezoneAbbr(tz);
  let text = `<b>Cron Jobs (${allJobs.length})</b>  \u00b7  ${escapeHtml(tzAbbr)}\n`;
  for (let i = 0; i < displayJobs.length; i++) {
    const j = displayJobs[i];
    const num = i + 1;
    const status = j.enabled ? "[ON]" : "[OFF]";
    const name = j.name.length > MAX_NAME_DISPLAY ? j.name.slice(0, MAX_NAME_DISPLAY) + "..." : j.name;
    text += `\n<b>${num}. ${escapeHtml(name)}</b>  ${status}\n`;
    text += `   ${escapeHtml(formatSchedule(j.schedule))}`;
    if (j.enabled) {
      text += ` \u2014 next: ${formatNextRun(j.nextRunAt, tz)}`;
    }
    text += `\n`;
    if (j.lastRunAt) {
      const okStr = j.lastRunOk ? "(ok)" : "(failed)";
      text += `   Last: ${relativeTime(j.lastRunAt)} ${okStr}  \u00b7  ${j.runCount} runs\n`;
    }
  }
  if (overflow) {
    text += `\n<i>...and ${allJobs.length - MAX_JOBS_DISPLAY} more</i>\n`;
  }

  kb.row().text("+ Add Job", "cron_add");

  for (let i = 0; i < displayJobs.length; i++) {
    const j = displayJobs[i];
    const num = i + 1;
    kb.row();
    if (j.enabled) {
      kb.text(`${num} \u23f8 Disable`, `cron_tog:${j.id}`);
    } else {
      kb.text(`${num} \u25b6 Enable`, `cron_tog:${j.id}`);
    }
    kb.text(`${num} \u25b6 Run`, `cron_run:${j.id}`);
    kb.text(`${num} \ud83d\uddd1`, `cron_del:${j.id}`);
  }

  return { text, keyboard: kb };
}

// --- Add Parser ---
// /cron add daily 9:00 Title: prompt
// /cron add every 30m Title: prompt
// /cron add weekly mon,wed 14:30 Title: prompt
// /cron add once 14:30 Title: prompt

function parseDirectAdd(input: string): { schedule: CronSchedule; name: string; prompt: string } | null {
  const parts = input.trim().split(/\s+/);
  if (parts.length < 3) return null;

  const type = parts[0].toLowerCase();

  if (type === "every") {
    const intervalStr = parts[1];
    const match = intervalStr.match(/^(\d+)(m|h)$/);
    if (!match) return null;
    const mins = match[2] === "h" ? parseInt(match[1]) * 60 : parseInt(match[1]);
    if (mins < 1) return null;
    const rest = parts.slice(2).join(" ");
    const { name, prompt } = parseNamePrompt(rest);
    if (!name || !prompt) return null;
    return { schedule: { type: "interval", intervalMinutes: mins }, name, prompt };
  }

  if (type === "daily") {
    const timeStr = parts[1];
    const { hour, minute } = parseTime(timeStr);
    if (hour === null) return null;
    const rest = parts.slice(2).join(" ");
    const { name, prompt } = parseNamePrompt(rest);
    if (!name || !prompt) return null;
    return { schedule: { type: "daily", hour, minute }, name, prompt };
  }

  if (type === "once") {
    const timeStr = parts[1];
    const { hour, minute } = parseTime(timeStr);
    if (hour === null) return null;
    const rest = parts.slice(2).join(" ");
    const { name, prompt } = parseNamePrompt(rest);
    if (!name || !prompt) return null;
    return { schedule: { type: "once", hour, minute }, name, prompt };
  }

  if (type === "weekly") {
    if (parts.length < 4) return null;
    const daysStr = parts[1];
    const timeStr = parts[2];
    const days = parseDays(daysStr);
    if (!days.length) return null;
    const { hour, minute } = parseTime(timeStr);
    if (hour === null) return null;
    const rest = parts.slice(3).join(" ");
    const { name, prompt } = parseNamePrompt(rest);
    if (!name || !prompt) return null;
    return { schedule: { type: "weekly", hour, minute, days }, name, prompt };
  }

  return null;
}

function parseTime(s: string): { hour: number | null; minute: number } {
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return { hour: null, minute: 0 };
  const hour = parseInt(m[1]);
  const minute = parseInt(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return { hour: null, minute: 0 };
  return { hour, minute };
}

function parseDays(s: string): number[] {
  const dayMap: Record<string, number> = {
    sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
  };
  return s.toLowerCase().split(",").map(d => dayMap[d.trim()]).filter(d => d !== undefined);
}

function parseNamePrompt(s: string): { name: string; prompt: string } {
  const colonIdx = s.indexOf(":");
  if (colonIdx === -1) return { name: "", prompt: "" };
  const name = s.slice(0, colonIdx).trim();
  const prompt = s.slice(colonIdx + 1).trim();
  return { name, prompt };
}

// --- Inline keyboard step state (per-chat) ---

interface AddFlowState {
  type?: "interval" | "daily" | "weekly" | "once";
  intervalMinutes?: number;
  hour?: number;
  minute?: number;
  days?: number[];
  schedule?: CronSchedule;
  name?: string;
}

const addFlows = new Map<number, AddFlowState>();

function getFlow(chatId: number): AddFlowState {
  let f = addFlows.get(chatId);
  if (!f) { f = {}; addFlows.set(chatId, f); }
  return f;
}

function clearFlow(chatId: number): void {
  addFlows.delete(chatId);
}

/** Start interactive title+prompt collection after schedule is picked. */
async function startTextCollection(ctx: Context, schedule: CronSchedule): Promise<void> {
  const chatId = ctx.chat!.id;
  const flow = getFlow(chatId);
  flow.schedule = schedule;

  await promptForInput(ctx, `<b>Schedule:</b>  ${escapeHtml(formatSchedule(schedule))}\n\nType the job title:`, async (title, titleCtx) => {
    flow.name = title.trim();
    await promptForInput(titleCtx, "Type the prompt (what the AI should do):", async (prompt, promptCtx) => {
      const job = addJob(flow.name!, prompt.trim(), flow.schedule!);
      clearFlow(chatId);
      const tz = getConfig().timezone || "UTC";
      const nextRunStr = formatInTimezone(job.nextRunAt, tz);
      const tzAbbr = getTimezoneAbbr(tz);
      await promptCtx.reply(
        `<b>Job created!</b>\n\n` +
        `<b>Name:</b>  ${escapeHtml(job.name)}\n` +
        `<b>Schedule:</b>  ${escapeHtml(formatSchedule(job.schedule))}\n` +
        `<b>Next run:</b>  ${nextRunStr} ${tzAbbr}\n\n` +
        `<b>Prompt:</b>\n<code>${escapeHtml(job.prompt)}</code>`,
        { parse_mode: "HTML" },
      );
    });
  });
}

/** Safe edit: swallows "not modified" and "message not found" errors. */
async function safeEdit(ctx: Context, text: string, opts?: object): Promise<boolean> {
  try {
    await ctx.editMessageText(text, { parse_mode: "HTML" as const, ...opts });
    return true;
  } catch (err: any) {
    const desc = err?.description ?? err?.message ?? "";
    if (desc.includes("message is not modified") || desc.includes("not found") || desc.includes("MESSAGE_ID_INVALID")) {
      return false;
    }
    return false;
  }
}

const USAGE_TEXT =
  `<b>Usage:</b>  <code>/cron add &lt;schedule&gt; Title: prompt</code>\n\n` +
  `<b>Formats:</b>\n` +
  `<code>/cron add daily 9:00 Title: prompt</code>\n` +
  `<code>/cron add every 30m Title: prompt</code>\n` +
  `<code>/cron add weekly mon,wed 14:30 Title: prompt</code>\n` +
  `<code>/cron add once 14:30 Title: prompt</code>\n\n` +
  `<b>Example:</b>\n` +
  `<code>/cron add daily 9:00 Git summary: Summarize recent git commits</code>`;

// --- Registration ---

export function registerCronCommands(bot: Bot): void {
  // /cron command
  bot.command("cron", async (ctx) => {
    const input = ctx.match?.trim();

    // /cron add <schedule> Title: prompt
    if (input?.toLowerCase().startsWith("add ")) {
      const rest = input.slice(4);
      const parsed = parseDirectAdd(rest);
      if (!parsed) {
        await ctx.reply(USAGE_TEXT, { parse_mode: "HTML" });
        return;
      }
      const job = addJob(parsed.name, parsed.prompt, parsed.schedule);
      const tz = getConfig().timezone || "UTC";
      const nextRunStr = formatInTimezone(job.nextRunAt, tz);
      const tzAbbr = getTimezoneAbbr(tz);
      await ctx.reply(
        `<b>Job created!</b>\n\n` +
        `<b>Name:</b>  ${escapeHtml(job.name)}\n` +
        `<b>Schedule:</b>  ${escapeHtml(formatSchedule(job.schedule))}\n` +
        `<b>Next run:</b>  ${nextRunStr} ${tzAbbr}\n\n` +
        `<b>Prompt:</b>\n<code>${escapeHtml(job.prompt)}</code>`,
        { parse_mode: "HTML" },
      );
      return;
    }

    // Default: show job list
    const { text, keyboard } = buildCronList();
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
  });

  // --- Add flow callbacks (schedule picker → shows /cron add command) ---

  // Step 1: Pick type
  bot.callbackQuery("cron_add", async (ctx) => {
    clearFlow(ctx.chat!.id);
    const kb = new InlineKeyboard()
      .text("Every N min", "cron_typ:interval").row()
      .text("Daily", "cron_typ:daily").row()
      .text("Weekly", "cron_typ:weekly").row()
      .text("Once", "cron_typ:once").row()
      .text("Cancel", "cron_cancel");

    await safeEdit(ctx, "<b>New Cron Job</b>\n\nSelect schedule type:", { reply_markup: kb });
    await ctx.answerCallbackQuery();
  });

  // Step 2a: Interval — pick duration
  bot.callbackQuery("cron_typ:interval", async (ctx) => {
    const flow = getFlow(ctx.chat!.id);
    flow.type = "interval";

    const kb = new InlineKeyboard()
      .text("1m", "cron_int:1").text("5m", "cron_int:5").text("10m", "cron_int:10").row()
      .text("15m", "cron_int:15").text("30m", "cron_int:30").text("1h", "cron_int:60").row()
      .text("2h", "cron_int:120").text("4h", "cron_int:240").text("6h", "cron_int:360").row()
      .text("12h", "cron_int:720").text("24h", "cron_int:1440").row()
      .text("Cancel", "cron_cancel");

    await safeEdit(ctx, "<b>New Cron Job</b>\n\nSelect interval:", { reply_markup: kb });
    await ctx.answerCallbackQuery();
  });

  // Step 2b: Daily/Weekly/Once — pick hour
  bot.callbackQuery(/^cron_typ:(daily|weekly|once)$/, async (ctx) => {
    const type = ctx.match[1] as "daily" | "weekly" | "once";
    const flow = getFlow(ctx.chat!.id);
    flow.type = type;

    const kb = new InlineKeyboard();
    for (let row = 0; row < 6; row++) {
      kb.row();
      for (let col = 0; col < 4; col++) {
        const h = row * 4 + col;
        kb.text(String(h).padStart(2, "0"), `cron_hr:${h}`);
      }
    }
    kb.row().text("Cancel", "cron_cancel");

    await safeEdit(ctx, "<b>New Cron Job</b>\n\nSelect hour:", { reply_markup: kb });
    await ctx.answerCallbackQuery();
  });

  // Step 3: Interval selected → collect title and prompt
  bot.callbackQuery(/^cron_int:(\d+)$/, async (ctx) => {
    const mins = parseInt(ctx.match[1]);
    const schedule: CronSchedule = { type: "interval", intervalMinutes: mins };

    await safeEdit(ctx, `<b>New Cron Job</b>\n\nInterval: every ${mins >= 60 && mins % 60 === 0 ? `${mins / 60}h` : `${mins}m`}`);
    await ctx.answerCallbackQuery();
    await startTextCollection(ctx, schedule);
  });

  // Step 4: Hour selected — pick minute
  bot.callbackQuery(/^cron_hr:(\d+)$/, async (ctx) => {
    const hour = parseInt(ctx.match[1]);
    const flow = getFlow(ctx.chat!.id);
    flow.hour = hour;

    const kb = new InlineKeyboard()
      .text(":00", "cron_min:0").text(":15", "cron_min:15")
      .text(":30", "cron_min:30").text(":45", "cron_min:45")
      .row().text("Cancel", "cron_cancel");

    await safeEdit(ctx,
      `<b>New Cron Job</b>\n\n` +
      `<b>Hour:</b>  ${String(hour).padStart(2, "0")}\n` +
      `Select minute:`,
      { reply_markup: kb },
    );
    await ctx.answerCallbackQuery();
  });

  // Step 5: Minute selected — if weekly go to day picker, else show command
  bot.callbackQuery(/^cron_min:(\d+)$/, async (ctx) => {
    const minute = parseInt(ctx.match[1]);
    const flow = getFlow(ctx.chat!.id);
    flow.minute = minute;

    if (flow.type === "weekly") {
      flow.days = [];
      const kb = buildDayPicker(flow.days);
      const hh = String(flow.hour ?? 0).padStart(2, "0");
      const mm = String(minute).padStart(2, "0");
      await safeEdit(ctx,
        `<b>New Cron Job</b>\n\n` +
        `<b>Time:</b>  ${hh}:${mm}\n` +
        `Toggle days, then press Done:`,
        { reply_markup: kb },
      );
      await ctx.answerCallbackQuery();
      return;
    }

    // Daily/Once → collect title and prompt
    const schedType = flow.type === "once" ? "once" as const : "daily" as const;
    const schedule: CronSchedule = { type: schedType, hour: flow.hour, minute };
    const hh = String(flow.hour ?? 0).padStart(2, "0");
    const mm = String(minute).padStart(2, "0");

    await safeEdit(ctx, `<b>New Cron Job</b>\n\n${schedType === "once" ? "Once" : "Daily"} at ${hh}:${mm}`);
    await ctx.answerCallbackQuery();
    await startTextCollection(ctx, schedule);
  });

  // Day toggling
  bot.callbackQuery(/^cron_day:(\d)$/, async (ctx) => {
    const day = parseInt(ctx.match[1]);
    const flow = getFlow(ctx.chat!.id);
    if (!flow.days) flow.days = [];

    const idx = flow.days.indexOf(day);
    if (idx >= 0) {
      flow.days.splice(idx, 1);
    } else {
      flow.days.push(day);
      flow.days.sort();
    }

    const kb = buildDayPicker(flow.days);
    const hh = String(flow.hour ?? 0).padStart(2, "0");
    const mm = String(flow.minute ?? 0).padStart(2, "0");
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const selected = flow.days.map(d => dayNames[d]).join(", ") || "none";

    await safeEdit(ctx,
      `<b>New Cron Job</b>\n\n` +
      `<b>Time:</b>  ${hh}:${mm}\n` +
      `<b>Days:</b>  ${selected}\n` +
      `Toggle days, then press Done:`,
      { reply_markup: kb },
    );
    await ctx.answerCallbackQuery();
  });

  // Days done → show /cron add command
  bot.callbackQuery("cron_days_ok", async (ctx) => {
    const flow = getFlow(ctx.chat!.id);
    if (!flow.days || flow.days.length === 0) {
      await ctx.answerCallbackQuery({ text: "Select at least one day" });
      return;
    }

    const schedule: CronSchedule = {
      type: "weekly",
      hour: flow.hour,
      minute: flow.minute,
      days: flow.days,
    };

    await safeEdit(ctx, `<b>New Cron Job</b>\n\n${escapeHtml(formatSchedule(schedule))}`);
    await ctx.answerCallbackQuery();
    await startTextCollection(ctx, schedule);
  });

  // --- Action callbacks ---

  bot.callbackQuery(/^cron_tog:(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    const job = toggleJob(id);
    if (!job) {
      await ctx.answerCallbackQuery({ text: "Job not found" });
      return;
    }

    const { text, keyboard } = buildCronList();
    await safeEdit(ctx, text, { reply_markup: keyboard });
    await ctx.answerCallbackQuery({ text: job.enabled ? "Enabled" : "Disabled" });
  });

  bot.callbackQuery(/^cron_run:(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    const result = await runJobNow(id);
    const msg = result === "ok" ? "Running..." : result === "no_scheduler" ? "Scheduler not started" : "Job not found";
    await ctx.answerCallbackQuery({ text: msg });
  });

  bot.callbackQuery(/^cron_del:(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    const removed = removeJob(id);
    if (!removed) {
      await ctx.answerCallbackQuery({ text: "Job not found" });
      return;
    }

    const { text, keyboard } = buildCronList();
    await safeEdit(ctx, text, { reply_markup: keyboard });
    await ctx.answerCallbackQuery({ text: "Deleted" });
  });

  // Cancel
  bot.callbackQuery("cron_cancel", async (ctx) => {
    clearFlow(ctx.chat!.id);

    const { text, keyboard } = buildCronList();
    await safeEdit(ctx, text, { reply_markup: keyboard });
    await ctx.answerCallbackQuery({ text: "Cancelled" });
  });
}

function buildDayPicker(selected: number[]): InlineKeyboard {
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const kb = new InlineKeyboard();

  // First row: Mon-Thu
  kb.row();
  for (let d = 1; d <= 4; d++) {
    const label = selected.includes(d) ? `\u2713 ${dayNames[d]}` : dayNames[d];
    kb.text(label, `cron_day:${d}`);
  }
  // Second row: Fri-Sun
  kb.row();
  for (const d of [5, 6, 0]) {
    const label = selected.includes(d) ? `\u2713 ${dayNames[d]}` : dayNames[d];
    kb.text(label, `cron_day:${d}`);
  }
  kb.row().text("Done", "cron_days_ok").text("Cancel", "cron_cancel");
  return kb;
}
