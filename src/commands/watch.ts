import type { Bot, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { listWatches, addWatch, removeWatch, toggleWatch, runWatchNow, validateWatchUrl, retryPendingAnalysis, dismissPendingAnalysis, type WatchJob } from "../watch.js";
import { escapeHtml } from "../utils/html.js";
import { promptForInput, clearPendingInput } from "../utils/input.js";
import { getConfig } from "../config/index.js";
import { formatInTimezone, getTimezoneAbbr, getPartsInTz } from "../cron.js";

const MAX_WATCHES_DISPLAY = 30;
const MAX_NAME_DISPLAY = 40;

// --- Helpers ---

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

function formatNextCheck(nextCheckAt: number, tz: string): string {
  const now = Date.now();
  const nowParts = getPartsInTz(now, tz);
  const nextParts = getPartsInTz(nextCheckAt, tz);
  const time = formatInTimezone(nextCheckAt, tz);

  if (nowParts.year === nextParts.year && nowParts.month === nextParts.month && nowParts.day === nextParts.day) {
    return `today ${time}`;
  }

  const tomorrowMs = now + 86400_000;
  const tomParts = getPartsInTz(tomorrowMs, tz);
  if (tomParts.year === nextParts.year && tomParts.month === nextParts.month && tomParts.day === nextParts.day) {
    return `tomorrow ${time}`;
  }

  return formatInTimezone(nextCheckAt, tz, "datetime");
}

function deriveNameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function formatInterval(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) return `every ${minutes / 60}h`;
  return `every ${minutes}m`;
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

// --- Build Watch List UI ---

function buildWatchList(): { text: string; keyboard: InlineKeyboard } {
  const allWatches = listWatches();
  const kb = new InlineKeyboard();

  if (allWatches.length === 0) {
    kb.row().text("+ Add Watch", "watch_add");
    return {
      text: "<b>Web Monitors</b>\n\nNo watches yet.",
      keyboard: kb,
    };
  }

  const displayWatches = allWatches.slice(0, MAX_WATCHES_DISPLAY);
  const overflow = allWatches.length > MAX_WATCHES_DISPLAY;

  const tz = getConfig().timezone || "UTC";
  const tzAbbr = getTimezoneAbbr(tz);
  let text = `<b>Web Monitors (${allWatches.length})</b>  \u00b7  ${escapeHtml(tzAbbr)}\n`;

  for (let i = 0; i < displayWatches.length; i++) {
    const w = displayWatches[i];
    const num = i + 1;
    const status = w.enabled ? "[ON]" : "[OFF]";
    const name = w.name.length > MAX_NAME_DISPLAY ? w.name.slice(0, MAX_NAME_DISPLAY) + "..." : w.name;
    text += `\n<b>${num}. ${escapeHtml(name)}</b>  ${status}\n`;
    text += `   ${escapeHtml(w.url)}\n`;
    text += `   Task: ${escapeHtml(w.task.length > 60 ? w.task.slice(0, 60) + "..." : w.task)}\n`;
    text += `   ${formatInterval(w.intervalMinutes)}`;
    if (w.enabled) {
      text += ` \u2014 next: ${formatNextCheck(w.nextCheckAt, tz)}`;
    }
    text += `\n`;
    if (w.lastCheckAt) {
      const okStr = w.lastCheckOk ? "(ok)" : "(failed)";
      text += `   Last: ${relativeTime(w.lastCheckAt)} ${okStr}  \u00b7  ${w.checkCount} checks, ${w.changeCount} changes\n`;
    }
    if (w.pendingReanalysis) {
      const p = w.pendingReanalysis;
      text += `   \u26a0 Analysis pending (attempt ${p.attempts}): ${escapeHtml(p.lastError)}\n`;
    }
  }

  if (overflow) {
    text += `\n<i>...and ${allWatches.length - MAX_WATCHES_DISPLAY} more</i>\n`;
  }

  kb.row().text("+ Add Watch", "watch_add");

  for (let i = 0; i < displayWatches.length; i++) {
    const w = displayWatches[i];
    const num = i + 1;
    kb.row();
    if (w.enabled) {
      kb.text(`${num} \u23f8 Disable`, `watch_tog:${w.id}`);
    } else {
      kb.text(`${num} \u25b6 Enable`, `watch_tog:${w.id}`);
    }
    kb.text(`${num} \u25b6 Check`, `watch_run:${w.id}`);
    kb.text(`${num} \ud83d\uddd1`, `watch_del:${w.id}`);

    // Extra row for watches with a failed analysis waiting on manual retry.
    if (w.pendingReanalysis) {
      kb.row();
      kb.text(`${num} \u21bb Retry analysis`, `watch_retry:${w.id}`);
      kb.text(`${num} Dismiss`, `watch_dismiss:${w.id}`);
    }
  }

  return { text, keyboard: kb };
}

// --- Direct Add Parser ---
// /watch add <url> <intervalM> Name: task

function parseDirectAdd(input: string): { url: string; intervalMinutes: number; name: string; task: string } | null {
  const parts = input.trim().split(/\s+/);
  if (parts.length < 3) return null;

  const url = parts[0];
  try { new URL(url); } catch { return null; }

  const intervalStr = parts[1];
  const intervalMinutes = parseInt(intervalStr, 10);
  if (isNaN(intervalMinutes) || intervalMinutes < 5) return null;

  const rest = parts.slice(2).join(" ");
  const colonIdx = rest.indexOf(":");
  if (colonIdx === -1) return null;

  const name = rest.slice(0, colonIdx).trim();
  const task = rest.slice(colonIdx + 1).trim();
  if (!name || !task) return null;

  return { url, intervalMinutes, name, task };
}

// --- Flow State ---

interface AddFlowState {
  url?: string;
  name?: string;
  intervalMinutes?: number;
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

// --- Interval Picker ---

function buildIntervalKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("5m", "watch_int:5").text("10m", "watch_int:10").text("15m", "watch_int:15").row()
    .text("30m", "watch_int:30").text("1h", "watch_int:60").text("2h", "watch_int:120").row()
    .text("4h", "watch_int:240").text("6h", "watch_int:360").text("12h", "watch_int:720").row()
    .text("24h", "watch_int:1440").row()
    .text("Cancel", "watch_cancel");
}

// --- Create watch after validation ---

async function createWatchFromFlow(ctx: Context, flow: AddFlowState, task: string): Promise<void> {
  const chatId = ctx.chat!.id;
  const url = flow.url!;
  const name = flow.name!;
  const intervalMinutes = flow.intervalMinutes!;

  await ctx.reply("Validating URL...");

  const validation = await validateWatchUrl(url);
  clearFlow(chatId);
  clearPendingInput(chatId);

  if (!validation.ok) {
    await ctx.reply(
      `<b>Cannot create watch</b>\n\n` +
      `URL validation failed: ${escapeHtml(validation.error ?? "unknown error")}`,
      { parse_mode: "HTML" },
    );
    return;
  }

  const watch = addWatch(name, url, task, intervalMinutes, validation.snapshot);
  const tz = getConfig().timezone || "UTC";
  const tzAbbr = getTimezoneAbbr(tz);

  let msg =
    `<b>Watch created!</b>\n\n` +
    `<b>Name:</b>  ${escapeHtml(watch.name)}\n` +
    `<b>URL:</b>  ${escapeHtml(watch.url)}\n` +
    `<b>Task:</b>  ${escapeHtml(task)}\n` +
    `<b>Interval:</b>  ${formatInterval(watch.intervalMinutes)}\n`;

  if (validation.wordCount !== undefined) {
    msg += `<b>Baseline:</b>  ${validation.wordCount.toLocaleString()} words\n`;
  }
  msg += `<b>Next check:</b>  ${formatNextCheck(watch.nextCheckAt, tz)} ${tzAbbr}\n`;

  if (validation.warning) {
    msg += `\n\u26a0\ufe0f ${escapeHtml(validation.warning)}`;
  }

  await ctx.reply(msg, { parse_mode: "HTML" });
}

// --- Registration ---

export function registerWatchCommands(bot: Bot): void {
  // /watch command
  bot.command("watch", async (ctx) => {
    const input = ctx.match?.trim();

    // /watch add <url> <interval> Name: task — direct creation
    if (input?.toLowerCase().startsWith("add ")) {
      const rest = input.slice(4);
      const parsed = parseDirectAdd(rest);
      if (!parsed) {
        await ctx.reply(
          `<b>Usage:</b>  <code>/watch add &lt;url&gt; &lt;intervalM&gt; Name: task</code>\n\n` +
          `<b>Example:</b>\n` +
          `<code>/watch add https://example.com/pricing 30 Pricing: Track price changes</code>`,
          { parse_mode: "HTML" },
        );
        return;
      }

      await ctx.reply("Validating URL...");
      const validation = await validateWatchUrl(parsed.url);

      if (!validation.ok) {
        await ctx.reply(
          `<b>Cannot create watch</b>\n\n` +
          `URL validation failed: ${escapeHtml(validation.error ?? "unknown error")}`,
          { parse_mode: "HTML" },
        );
        return;
      }

      const watch = addWatch(parsed.name, parsed.url, parsed.task, parsed.intervalMinutes, validation.snapshot);
      const tz = getConfig().timezone || "UTC";
      const tzAbbr = getTimezoneAbbr(tz);

      let msg =
        `<b>Watch created!</b>\n\n` +
        `<b>Name:</b>  ${escapeHtml(watch.name)}\n` +
        `<b>URL:</b>  ${escapeHtml(watch.url)}\n` +
        `<b>Task:</b>  ${escapeHtml(parsed.task)}\n` +
        `<b>Interval:</b>  ${formatInterval(watch.intervalMinutes)}\n`;

      if (validation.wordCount !== undefined) {
        msg += `<b>Baseline:</b>  ${validation.wordCount.toLocaleString()} words\n`;
      }
      msg += `<b>Next check:</b>  ${formatNextCheck(watch.nextCheckAt, tz)} ${tzAbbr}\n`;

      if (validation.warning) {
        msg += `\n\u26a0\ufe0f ${escapeHtml(validation.warning)}`;
      }

      await ctx.reply(msg, { parse_mode: "HTML" });
      return;
    }

    // /watch <url> — start interactive flow with URL pre-filled
    if (input) {
      try {
        new URL(input);
      } catch {
        await ctx.reply("Invalid URL. Please provide a valid URL.", { parse_mode: "HTML" });
        return;
      }

      const chatId = ctx.chat!.id;
      clearFlow(chatId);
      clearPendingInput(chatId);
      const flow = getFlow(chatId);
      flow.url = input;
      flow.name = deriveNameFromUrl(input);

      const kb = buildIntervalKeyboard();
      await ctx.reply(
        `<b>New Watch</b>\n\n` +
        `<b>URL:</b>  ${escapeHtml(input)}\n\n` +
        `Select check interval:`,
        { parse_mode: "HTML", reply_markup: kb },
      );
      return;
    }

    // /watch — show watch list
    const { text, keyboard } = buildWatchList();
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
  });

  // --- Callback: Add Watch button → prompt for URL ---

  bot.callbackQuery("watch_add", async (ctx) => {
    const chatId = ctx.chat!.id;
    clearFlow(chatId);
    clearPendingInput(chatId);
    await safeEdit(ctx, "<b>New Watch</b>\n\nSend the URL to monitor:");
    await ctx.answerCallbackQuery();

    await promptForInput(ctx, "Enter the URL to monitor:", async (urlInput, urlCtx) => {
      const url = urlInput.trim();
      const cid = urlCtx.chat!.id;
      try {
        new URL(url);
      } catch {
        clearFlow(cid);
        await urlCtx.reply("Invalid URL. Please try again with /watch.");
        return;
      }

      const flow = getFlow(cid);
      flow.url = url;
      flow.name = deriveNameFromUrl(url);

      const kb = buildIntervalKeyboard();
      await urlCtx.reply(
        `<b>New Watch</b>\n\n` +
        `<b>URL:</b>  ${escapeHtml(url)}\n\n` +
        `Select check interval:`,
        { parse_mode: "HTML", reply_markup: kb },
      );
    });
  });

  // --- Callback: Interval selected → prompt for task ---

  bot.callbackQuery(/^watch_int:(\d+)$/, async (ctx) => {
    const minutes = parseInt(ctx.match[1]);
    const chatId = ctx.chat!.id;
    clearPendingInput(chatId);
    const flow = getFlow(chatId);
    flow.intervalMinutes = minutes;

    const urlDisplay = flow.url ? escapeHtml(flow.url) : "\u2014";
    await safeEdit(ctx,
      `<b>New Watch</b>\n\n` +
      `<b>URL:</b>  ${urlDisplay}\n` +
      `<b>Interval:</b>  ${formatInterval(minutes)}\n\n` +
      `Type the task description (what to watch for):`,
    );
    await ctx.answerCallbackQuery();

    await promptForInput(ctx, "Describe what to watch for:", async (task, taskCtx) => {
      await createWatchFromFlow(taskCtx, getFlow(taskCtx.chat!.id), task.trim());
    });
  });

  // --- Callback: Toggle ---

  bot.callbackQuery(/^watch_tog:(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    const watch = toggleWatch(id);
    if (!watch) {
      await ctx.answerCallbackQuery({ text: "Watch not found" });
      return;
    }

    const { text, keyboard } = buildWatchList();
    await safeEdit(ctx, text, { reply_markup: keyboard });
    await ctx.answerCallbackQuery({ text: watch.enabled ? "Enabled" : "Disabled" });
  });

  // --- Callback: Run Now ---

  bot.callbackQuery(/^watch_run:(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    const result = await runWatchNow(id);
    const msg = result === "ok" ? "Running..." : result === "no_scheduler" ? "Scheduler not started" : "Watch not found";
    await ctx.answerCallbackQuery({ text: msg });
  });

  // --- Callback: Delete ---

  bot.callbackQuery(/^watch_del:(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    const removed = removeWatch(id);
    if (!removed) {
      await ctx.answerCallbackQuery({ text: "Watch not found" });
      return;
    }

    const { text, keyboard } = buildWatchList();
    await safeEdit(ctx, text, { reply_markup: keyboard });
    await ctx.answerCallbackQuery({ text: "Deleted" });
  });

  // --- Callback: Retry pending analysis ---

  bot.callbackQuery(/^watch_retry:(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    // Ack immediately — the retry itself can take 10-120s and grammy will
    // complain if we sit on a callback query.
    await ctx.answerCallbackQuery({ text: "Retrying..." });
    const result = await retryPendingAnalysis(id);
    if (result === "not_found" || result === "nothing_pending") {
      // The failure card button was stale. Answer already sent; nothing more to do.
      return;
    }
  });

  // --- Callback: Dismiss pending analysis ---

  bot.callbackQuery(/^watch_dismiss:(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    const result = await dismissPendingAnalysis(id);
    const msg =
      result === "ok" ? "Dismissed" :
      result === "nothing_pending" ? "Nothing to dismiss" : "Watch not found";
    await ctx.answerCallbackQuery({ text: msg });

    // If the callback came from the `/watch` list message (not the failure
    // card), refresh it so the pending row re-renders without the warning /
    // retry button. dismissPendingAnalysis already handled the failure-card
    // case by editing that message to "Dismissed.".
    const currentText = ctx.msg?.text ?? "";
    if (currentText.startsWith("Web Monitors")) {
      const { text, keyboard } = buildWatchList();
      await safeEdit(ctx, text, { reply_markup: keyboard });
    }
  });

  // --- Callback: Cancel ---

  bot.callbackQuery("watch_cancel", async (ctx) => {
    clearFlow(ctx.chat!.id);
    clearPendingInput(ctx.chat!.id);

    const { text, keyboard } = buildWatchList();
    await safeEdit(ctx, text, { reply_markup: keyboard });
    await ctx.answerCallbackQuery({ text: "Cancelled" });
  });
}
