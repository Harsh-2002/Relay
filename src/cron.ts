import { InputFile, type Api, type RawApi } from "grammy";
import { getProvider } from "./providers/index.js";
import { getOrCreateSession, getSelectedModel, getSelectedAgent, withPromptQueue } from "./session.js";
import { getSystemPrompt } from "./utils/system-prompt.js";
import { markdownToHtml } from "./utils/markdown.js";
import { chunkMessage } from "./utils/chunker.js";
import { escapeHtml } from "./utils/html.js";
import type { ResponseFile } from "./utils/files.js";
import { JsonStore } from "./utils/store.js";
import { cronLogger } from "./utils/logger.js";
import { ensureServerAlive } from "./lifecycle.js";
import { clearActiveSession } from "./session.js";
import { getConfig } from "./config/index.js";

const MAX_ERROR_LEN = 500; // Truncate error messages

// --- Data Model ---

export interface CronSchedule {
  type: "interval" | "daily" | "weekly" | "once";
  intervalMinutes?: number;
  hour?: number;
  minute?: number;
  days?: number[]; // 0=Sun..6=Sat
}

export interface CronJob {
  id: string;
  name: string;
  prompt: string;
  schedule: CronSchedule;
  enabled: boolean;
  createdAt: number;
  lastRunAt: number | null;
  lastRunOk: boolean | null;
  nextRunAt: number;
  runCount: number;
}

interface CronState {
  jobs: CronJob[];
}

// --- Storage ---

const store = new JsonStore<CronState>("cron.json", { jobs: [] });
let jobs: CronJob[] = store.load().jobs;

function persist(): void {
  store.save({ jobs });
}

// --- ID Generation ---

function generateId(): string {
  return "k_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// --- Timezone Helpers ---

/** Get the configured timezone, falling back to UTC. */
function getTimezone(): string {
  try {
    return getConfig().timezone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Get date/time parts in a specific timezone.
 * Returns { year, month (1-based), day, hour, minute, weekday (0=Sun) }.
 */
function getPartsInTz(utcMs: number, tz: string): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(new Date(utcMs));
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: parseInt(get("year")),
    month: parseInt(get("month")),
    day: parseInt(get("day")),
    hour: parseInt(get("hour")) % 24, // Intl may return 24 for midnight in some locales
    minute: parseInt(get("minute")),
    weekday: weekdayMap[get("weekday")] ?? 0,
  };
}

/**
 * Convert a date + time in a specific timezone to UTC milliseconds.
 * Uses a binary-search approach to find the exact UTC instant.
 */
function tzDateToUtcMs(year: number, month: number, day: number, hour: number, minute: number, tz: string): number {
  // Start with a UTC guess
  const guessUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  // Get what that UTC instant looks like in the target timezone
  const parts = getPartsInTz(guessUtc, tz);
  // Calculate the offset: how far off we are
  const guessLocalMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0);
  const offsetMs = guessLocalMs - guessUtc;
  // Adjust: subtract the offset to get the true UTC time
  // Note: DST spring-forward gaps (e.g. 2:30 AM doesn't exist) may produce ±1h drift — acceptable
  return guessUtc - offsetMs;
}

/**
 * Format a UTC timestamp in the user's timezone.
 * Returns e.g. "14:30" or "2026-03-05 14:30".
 */
export function formatInTimezone(utcMs: number, tz: string, style: "time" | "datetime" = "time"): string {
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  if (style === "datetime") {
    opts.year = "numeric";
    opts.month = "2-digit";
    opts.day = "2-digit";
  }
  return new Intl.DateTimeFormat("en-GB", opts).format(new Date(utcMs));
}

/**
 * Get the short timezone abbreviation (e.g. "IST", "EST", "UTC").
 */
export function getTimezoneAbbr(tz: string): string {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" });
    const parts = fmt.formatToParts(new Date());
    return parts.find(p => p.type === "timeZoneName")?.value ?? tz;
  } catch {
    return tz;
  }
}

// --- Schedule Math ---

export function computeNextRun(schedule: CronSchedule, afterMs: number): number {
  if (schedule.type === "interval") {
    const mins = schedule.intervalMinutes ?? 60;
    return afterMs + mins * 60_000;
  }

  const tz = getTimezone();
  const h = schedule.hour ?? 9;
  const m = schedule.minute ?? 0;

  if (schedule.type === "daily" || schedule.type === "once") {
    // Get "today" in user's timezone
    const local = getPartsInTz(afterMs, tz);
    // Try today at h:m
    let candidate = tzDateToUtcMs(local.year, local.month, local.day, h, m, tz);
    if (candidate <= afterMs) {
      // Move to tomorrow
      const tomorrow = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
      candidate = tzDateToUtcMs(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate(), h, m, tz);
    }
    return candidate;
  }

  if (schedule.type === "weekly") {
    const days = schedule.days ?? [1]; // Default Monday
    if (days.length === 0) return afterMs + 7 * 24 * 60 * 60_000;

    const local = getPartsInTz(afterMs, tz);
    // Check next 8 days to find the closest matching day
    for (let offset = 0; offset <= 7; offset++) {
      const d = new Date(Date.UTC(local.year, local.month - 1, local.day + offset));
      const candidate = tzDateToUtcMs(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), h, m, tz);
      if (candidate <= afterMs) continue;
      // Check what day of week this is in the user's timezone
      const candidateParts = getPartsInTz(candidate, tz);
      if (days.includes(candidateParts.weekday)) {
        return candidate;
      }
    }
    // Fallback: 7 days out
    return afterMs + 7 * 24 * 60 * 60_000;
  }

  return afterMs + 60 * 60_000;
}

export function formatSchedule(s: CronSchedule): string {
  if (s.type === "interval") {
    const mins = s.intervalMinutes ?? 60;
    if (mins >= 60 && mins % 60 === 0) return `every ${mins / 60}h`;
    return `every ${mins}m`;
  }
  const tz = getTimezone();
  const abbr = getTimezoneAbbr(tz);
  const hh = String(s.hour ?? 9).padStart(2, "0");
  const mm = String(s.minute ?? 0).padStart(2, "0");
  if (s.type === "once") return `once ${hh}:${mm} ${abbr}`;
  if (s.type === "daily") return `daily ${hh}:${mm} ${abbr}`;
  if (s.type === "weekly") {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const days = (s.days ?? [1]).map(d => dayNames[d]).join(",");
    return `${days} ${hh}:${mm} ${abbr}`;
  }
  return "unknown";
}

// --- CRUD ---

export function listJobs(): CronJob[] {
  return jobs;
}

export function getJob(id: string): CronJob | undefined {
  return jobs.find(j => j.id === id);
}

export function addJob(name: string, prompt: string, schedule: CronSchedule): CronJob {
  // Enforce minimum 1-minute interval to prevent runaway jobs
  if (schedule.type === "interval" && (schedule.intervalMinutes ?? 0) < 1) {
    schedule = { ...schedule, intervalMinutes: 1 };
  }
  const now = Date.now();
  const job: CronJob = {
    id: generateId(),
    name,
    prompt,
    schedule,
    enabled: true,
    createdAt: now,
    lastRunAt: null,
    lastRunOk: null,
    nextRunAt: computeNextRun(schedule, now),
    runCount: 0,
  };
  jobs.push(job);
  persist();
  cronLogger.info({ jobId: job.id, name, schedule: formatSchedule(schedule) }, "Job created");
  return job;
}

export function removeJob(id: string): boolean {
  const idx = jobs.findIndex(j => j.id === id);
  if (idx === -1) return false;
  const [removed] = jobs.splice(idx, 1);
  persist();
  cronLogger.info({ jobId: id, name: removed.name }, "Job removed");
  return true;
}

export function toggleJob(id: string): CronJob | null {
  const job = jobs.find(j => j.id === id);
  if (!job) return null;
  job.enabled = !job.enabled;
  if (job.enabled) {
    // Recompute next run from now
    job.nextRunAt = computeNextRun(job.schedule, Date.now());
  }
  persist();
  cronLogger.info({ jobId: id, enabled: job.enabled }, "Job toggled");
  return job;
}

export function updateJob(id: string, updates: { name?: string; prompt?: string; schedule?: CronSchedule }): CronJob | null {
  const job = jobs.find(j => j.id === id);
  if (!job) return null;
  if (updates.name !== undefined) job.name = updates.name;
  if (updates.prompt !== undefined) job.prompt = updates.prompt;
  if (updates.schedule !== undefined) {
    // Enforce minimum 1-minute interval
    if (updates.schedule.type === "interval" && (updates.schedule.intervalMinutes ?? 0) < 1) {
      updates.schedule = { ...updates.schedule, intervalMinutes: 1 };
    }
    job.schedule = updates.schedule;
    job.nextRunAt = computeNextRun(job.schedule, Date.now());
  }
  persist();
  cronLogger.info({ jobId: id, name: job.name }, "Job updated");
  return job;
}

// --- Scheduler Engine ---

let tickTimer: ReturnType<typeof setInterval> | null = null;
let schedulerApi: Api<RawApi> | null = null;
let schedulerChatId: number | null = null;

export function startCronScheduler(api: Api<RawApi>, chatId: number): void {
  schedulerApi = api;
  schedulerChatId = chatId;

  // Startup recovery: advance stale nextRunAt for all enabled jobs
  const now = Date.now();
  let recovered = 0;
  for (const job of jobs) {
    if (job.enabled && job.nextRunAt <= now) {
      job.nextRunAt = computeNextRun(job.schedule, now);
      recovered++;
    }
  }
  if (recovered > 0) {
    persist();
    cronLogger.info({ recovered }, "Advanced stale job schedules on startup");
  }

  cronLogger.info({ jobCount: jobs.length }, "Cron scheduler started (30s tick)");
  tickTimer = setInterval(() => tick(), 30_000);
}

export function stopCronScheduler(): void {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  cronLogger.info("Cron scheduler stopped");
}

function tick(): void {
  const now = Date.now();
  for (const job of jobs) {
    if (!job.enabled) continue;
    if (job.nextRunAt > now) continue;

    // Advance nextRunAt immediately to prevent double-fire
    job.nextRunAt = computeNextRun(job.schedule, now);

    // One-time jobs auto-disable after firing (preserves history, prevents re-fire)
    if (job.schedule.type === "once") {
      job.enabled = false;
      cronLogger.info({ jobId: job.id, name: job.name }, "One-time job fired, auto-disabled");
    }

    persist();

    cronLogger.info({ jobId: job.id, name: job.name }, "Firing cron job");
    executeJob(job).catch(err => {
      cronLogger.info({ jobId: job.id, err: err?.message }, "Job execution failed");
    });
  }
}

async function executeJob(job: CronJob): Promise<void> {
  if (!schedulerApi || !schedulerChatId) return;

  const api = schedulerApi;
  const chatId = schedulerChatId;

  // Pre-flight: ensure the OpenCode server is alive before running the job
  try {
    await ensureServerAlive();
  } catch (err: any) {
    cronLogger.info({ jobId: job.id, name: job.name, err: err?.message }, "Cron skipped: server down");
    try {
      await api.sendMessage(
        chatId,
        `<b>Cron: ${escapeHtml(job.name)}</b>\n\n` +
        `<b>Skipped — server unreachable</b>\n` +
        `Automatic recovery failed. Job will retry on next schedule.`,
        { parse_mode: "HTML" },
      );
    } catch {}
    job.lastRunAt = Date.now();
    job.lastRunOk = false;
    job.runCount++;
    persist();
    return;
  }

  // Send header message
  let msgId: number | null = null;
  try {
    const msg = await api.sendMessage(chatId, `<b>Cron: ${escapeHtml(job.name)}</b>\n\nRunning...`, { parse_mode: "HTML" });
    msgId = msg.message_id;
  } catch (err: any) {
    cronLogger.info({ jobId: job.id, err: err?.message }, "Failed to send cron header");
    return;
  }

  const header = `<b>Cron: ${escapeHtml(job.name.slice(0, 100))}</b>`;
  let ok = false;

  // Animated dots while running (same pattern as chat "Thinking.")
  let dotPhase = 0;
  const dotTimer = setInterval(() => {
    if (!msgId) return;
    dotPhase = (dotPhase % 3) + 1;
    api.editMessageText(chatId, msgId, `${header}\n\nRunning${".".repeat(dotPhase)}`, { parse_mode: "HTML" })
      .catch(() => {});
  }, 500);

  try {
    const { text: result, files: collectedFiles } = await withPromptQueue(async () => {
      const provider = getProvider();
      const sessionId = await getOrCreateSession();
      const model = getSelectedModel();
      const agent = getSelectedAgent();
      const system = getSystemPrompt();

      let accumulated = "";
      const files: ResponseFile[] = [];
      const stream = provider.promptStream(sessionId, job.prompt, {
        parts: [{ type: "text" as const, text: job.prompt }],
        ...(model && { model }),
        ...(system && { system }),
        ...(agent && { agent }),
      });

      for await (const chunk of stream) {
        if (chunk.type === "text") {
          accumulated += chunk.content;
        } else if (chunk.type === "file" && chunk.file) {
          files.push(chunk.file as ResponseFile);
        } else if (chunk.type === "done") {
          break;
        }
      }

      return { text: accumulated, files };
    });

    clearInterval(dotTimer);

    if (result && result.trim()) {
      const html = markdownToHtml(result);
      const chunks = chunkMessage(html);
      // Edit first chunk into the header message (check combined length)
      const firstWithHeader = `${header}\n\n${chunks[0]}`;
      if (firstWithHeader.length <= 4096) {
        try {
          await api.editMessageText(chatId, msgId, firstWithHeader, { parse_mode: "HTML" });
        } catch {
          try { await api.sendMessage(chatId, chunks[0], { parse_mode: "HTML" }); } catch {}
        }
      } else {
        // Header + first chunk too long — edit header only, send chunk separately
        try { await api.editMessageText(chatId, msgId, header, { parse_mode: "HTML" }); } catch {}
        try { await api.sendMessage(chatId, chunks[0], { parse_mode: "HTML" }); } catch {}
      }
      // Send remaining chunks as new messages
      for (let i = 1; i < chunks.length; i++) {
        try { await api.sendMessage(chatId, chunks[i], { parse_mode: "HTML" }); } catch {}
      }
      ok = true;
    } else {
      try {
        await api.editMessageText(chatId, msgId, `${header}\n\n<i>No response</i>`, { parse_mode: "HTML" });
      } catch {}
    }

    // Send file attachments (tool screenshots, etc.)
    for (const f of collectedFiles) {
      try {
        const buf = await resolveFileUrl(f.url);
        const input = new InputFile(buf, f.filename);
        if (f.mime?.startsWith("image/")) {
          await api.sendPhoto(chatId, input);
        } else {
          await api.sendDocument(chatId, input);
        }
      } catch (err: any) {
        cronLogger.info({ jobId: job.id, err: err?.message }, "Failed to send cron file attachment");
      }
    }
  } catch (err: any) {
    clearInterval(dotTimer);
    cronLogger.info({ jobId: job.id, err: err?.message }, "Cron job error");

    // Clear stale session on session-related errors so the next run gets a fresh one
    const errMsg = (err?.message ?? "").toLowerCase();
    if (errMsg.includes("session") && (errMsg.includes("not found") || errMsg.includes("404"))) {
      clearActiveSession();
      cronLogger.info({ jobId: job.id }, "Cleared stale session after cron error");
    }

    const errText = (err?.message ?? "unknown").slice(0, MAX_ERROR_LEN);
    const isServerError = ["econnrefused", "econnreset", "enotfound", "fetch failed", "server is down"]
      .some(p => errMsg.includes(p));
    const alertText = isServerError
      ? `${header}\n\n<b>Failed — server unreachable</b>\nThe AI server stopped responding during this job.`
      : `${header}\n\n<i>Error: ${escapeHtml(errText)}</i>`;
    try {
      await api.editMessageText(chatId, msgId!, alertText, { parse_mode: "HTML" });
    } catch {}
  }

  // Update job stats
  job.lastRunAt = Date.now();
  job.lastRunOk = ok;
  job.runCount++;
  persist();

  cronLogger.info({ jobId: job.id, ok, runCount: job.runCount }, "Cron job completed");
}

async function resolveFileUrl(url: string): Promise<Buffer> {
  if (url.startsWith("data:")) {
    const commaIdx = url.indexOf(",");
    if (commaIdx === -1) throw new Error("Invalid data URL");
    const data = url.slice(commaIdx + 1);
    const isBase64 = url.slice(0, commaIdx).includes(";base64");
    return Buffer.from(data, isBase64 ? "base64" : "utf-8");
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function runJobNow(id: string): Promise<"ok" | "not_found" | "no_scheduler"> {
  const job = jobs.find(j => j.id === id);
  if (!job) return "not_found";
  if (!schedulerApi || !schedulerChatId) return "no_scheduler";
  cronLogger.info({ jobId: id, name: job.name }, "Manual job run");
  executeJob(job).catch(err => {
    cronLogger.info({ jobId: id, err: err?.message }, "Manual job execution failed");
  });
  return "ok";
}
