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

const MAX_ERROR_LEN = 500; // Truncate error messages

// --- Data Model ---

export interface CronSchedule {
  type: "interval" | "daily" | "weekly";
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

// --- Schedule Math ---

export function computeNextRun(schedule: CronSchedule, afterMs: number): number {
  const after = new Date(afterMs);

  if (schedule.type === "interval") {
    const mins = schedule.intervalMinutes ?? 60;
    return afterMs + mins * 60_000;
  }

  if (schedule.type === "daily") {
    const h = schedule.hour ?? 9;
    const m = schedule.minute ?? 0;
    // Start from the day of `after`, set time
    const candidate = new Date(after);
    candidate.setHours(h, m, 0, 0);
    // If already past today, move to tomorrow
    if (candidate.getTime() <= afterMs) {
      candidate.setDate(candidate.getDate() + 1);
    }
    return candidate.getTime();
  }

  if (schedule.type === "weekly") {
    const h = schedule.hour ?? 9;
    const m = schedule.minute ?? 0;
    const days = schedule.days ?? [1]; // Default Monday
    if (days.length === 0) return afterMs + 7 * 24 * 60 * 60_000;

    // Check next 8 days to find the closest matching day
    for (let offset = 0; offset <= 7; offset++) {
      const candidate = new Date(after);
      candidate.setDate(candidate.getDate() + offset);
      candidate.setHours(h, m, 0, 0);
      if (candidate.getTime() <= afterMs) continue;
      if (days.includes(candidate.getDay())) {
        return candidate.getTime();
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
  const hh = String(s.hour ?? 9).padStart(2, "0");
  const mm = String(s.minute ?? 0).padStart(2, "0");
  if (s.type === "daily") return `daily ${hh}:${mm}`;
  if (s.type === "weekly") {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const days = (s.days ?? [1]).map(d => dayNames[d]).join(",");
    return `${days} ${hh}:${mm}`;
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
    cronLogger.info({ jobId: job.id, err: err?.message }, "Cron job error");
    const errText = (err?.message ?? "unknown").slice(0, MAX_ERROR_LEN);
    try {
      await api.editMessageText(chatId, msgId!, `${header}\n\n<i>Error: ${escapeHtml(errText)}</i>`, { parse_mode: "HTML" });
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
