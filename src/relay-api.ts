import { createServer, type Server, type IncomingMessage, type ServerResponse } from "http";
import type { Api, RawApi } from "grammy";
import { listJobs, addJob, removeJob, toggleJob, updateJob, runJobNow, formatSchedule, formatInTimezone, getTimezoneAbbr, type CronSchedule } from "./cron.js";
import { listWatches, addWatch, removeWatch, toggleWatch, updateWatch, runWatchNow, validateWatchUrl, type WatchJob } from "./watch.js";
import { isServerDown } from "./lifecycle.js";
import { getProvider } from "./providers/index.js";
import { relayApiLogger } from "./utils/logger.js";
import { getConfig } from "./config/index.js";

let server: Server | null = null;
let botApi: Api<RawApi> | null = null;
let chatId: number | null = null;

// --- Helpers ---

function getTzInfo(): { tz: string; abbr: string } {
  const tz = getConfig().timezone || "UTC";
  return { tz, abbr: getTimezoneAbbr(tz) };
}

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body);
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractId(url: string, prefix: string): string | null {
  // e.g. "/cron/jobs/k_abc123/toggle" → "k_abc123"
  const after = url.slice(prefix.length);
  const slash = after.indexOf("/");
  return slash === -1 ? after : after.slice(0, slash);
}

// --- Route handler ---

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? "GET";
  const url = req.url ?? "/";

  relayApiLogger.info({ method, url }, "Relay API request");

  try {
    // --- Cron routes ---
    if (url === "/cron/jobs" && method === "GET") {
      const { tz, abbr } = getTzInfo();
      const jobs = listJobs().map((j) => ({
        id: j.id,
        name: j.name,
        prompt: j.prompt,
        schedule: formatSchedule(j.schedule),
        enabled: j.enabled,
        lastRunAt: j.lastRunAt ? `${formatInTimezone(j.lastRunAt, tz, "datetime")} ${abbr}` : null,
        lastRunOk: j.lastRunOk,
        nextRunAt: `${formatInTimezone(j.nextRunAt, tz, "datetime")} ${abbr}`,
        runCount: j.runCount,
      }));
      json(res, 200, { timezone: tz, jobs });
      return;
    }

    if (url === "/cron/jobs" && method === "POST") {
      const body = parseJson(await readBody(req)) as any;
      if (!body?.name || !body?.prompt || !body?.type) {
        json(res, 400, { error: "Missing required fields: name, prompt, type" });
        return;
      }

      const schedule: CronSchedule = { type: body.type };
      if (body.type === "interval") {
        const mins = body.interval_minutes ?? 60;
        if (typeof mins !== "number" || mins < 1) {
          json(res, 400, { error: "interval_minutes must be >= 1" });
          return;
        }
        schedule.intervalMinutes = mins;
      } else if (body.type === "daily") {
        const h = body.hour ?? 9;
        const m = body.minute ?? 0;
        if (typeof h !== "number" || h < 0 || h > 23) {
          json(res, 400, { error: "hour must be 0-23" });
          return;
        }
        if (typeof m !== "number" || m < 0 || m > 59) {
          json(res, 400, { error: "minute must be 0-59" });
          return;
        }
        schedule.hour = h;
        schedule.minute = m;
      } else if (body.type === "weekly") {
        const h = body.hour ?? 9;
        const m = body.minute ?? 0;
        const days = body.days ?? [1];
        if (typeof h !== "number" || h < 0 || h > 23) {
          json(res, 400, { error: "hour must be 0-23" });
          return;
        }
        if (typeof m !== "number" || m < 0 || m > 59) {
          json(res, 400, { error: "minute must be 0-59" });
          return;
        }
        if (!Array.isArray(days) || days.some((d: unknown) => typeof d !== "number" || d < 0 || d > 6)) {
          json(res, 400, { error: "days must be an array of numbers 0-6 (Sun-Sat)" });
          return;
        }
        schedule.hour = h;
        schedule.minute = m;
        schedule.days = days;
      } else if (body.type === "once") {
        const h = body.hour ?? 9;
        const m = body.minute ?? 0;
        if (typeof h !== "number" || h < 0 || h > 23) {
          json(res, 400, { error: "hour must be 0-23" });
          return;
        }
        if (typeof m !== "number" || m < 0 || m > 59) {
          json(res, 400, { error: "minute must be 0-59" });
          return;
        }
        schedule.hour = h;
        schedule.minute = m;
      } else {
        json(res, 400, { error: `Invalid schedule type: ${body.type}. Must be interval, daily, weekly, or once.` });
        return;
      }

      const job = addJob(body.name, body.prompt, schedule);
      const { tz, abbr } = getTzInfo();
      json(res, 201, {
        id: job.id,
        name: job.name,
        schedule: formatSchedule(job.schedule),
        nextRunAt: `${formatInTimezone(job.nextRunAt, tz, "datetime")} ${abbr}`,
      });
      return;
    }

    if (url.startsWith("/cron/jobs/") && !url.includes("/toggle") && !url.includes("/run") && method === "PATCH") {
      const id = extractId(url, "/cron/jobs/");
      if (!id) { json(res, 400, { error: "Missing job ID" }); return; }
      const body = parseJson(await readBody(req)) as any;
      if (!body || typeof body !== "object") {
        json(res, 400, { error: "Invalid request body" });
        return;
      }

      const updates: { name?: string; prompt?: string; schedule?: CronSchedule } = {};
      if (body.name !== undefined) updates.name = String(body.name);
      if (body.prompt !== undefined) updates.prompt = String(body.prompt);

      // Build schedule if any schedule fields provided
      if (body.type !== undefined) {
        const schedule: CronSchedule = { type: body.type };
        if (body.type === "interval") {
          const mins = body.interval_minutes ?? 60;
          if (typeof mins !== "number" || mins < 1) {
            json(res, 400, { error: "interval_minutes must be >= 1" });
            return;
          }
          schedule.intervalMinutes = mins;
        } else if (body.type === "daily") {
          const h = body.hour ?? 9;
          const m = body.minute ?? 0;
          if (typeof h !== "number" || h < 0 || h > 23) {
            json(res, 400, { error: "hour must be 0-23" });
            return;
          }
          if (typeof m !== "number" || m < 0 || m > 59) {
            json(res, 400, { error: "minute must be 0-59" });
            return;
          }
          schedule.hour = h;
          schedule.minute = m;
        } else if (body.type === "weekly") {
          const h = body.hour ?? 9;
          const m = body.minute ?? 0;
          const days = body.days ?? [1];
          if (typeof h !== "number" || h < 0 || h > 23) {
            json(res, 400, { error: "hour must be 0-23" });
            return;
          }
          if (typeof m !== "number" || m < 0 || m > 59) {
            json(res, 400, { error: "minute must be 0-59" });
            return;
          }
          if (!Array.isArray(days) || days.some((d: unknown) => typeof d !== "number" || d < 0 || d > 6)) {
            json(res, 400, { error: "days must be an array of numbers 0-6 (Sun-Sat)" });
            return;
          }
          schedule.hour = h;
          schedule.minute = m;
          schedule.days = days;
        } else if (body.type === "once") {
          const h = body.hour ?? 9;
          const m = body.minute ?? 0;
          if (typeof h !== "number" || h < 0 || h > 23) {
            json(res, 400, { error: "hour must be 0-23" });
            return;
          }
          if (typeof m !== "number" || m < 0 || m > 59) {
            json(res, 400, { error: "minute must be 0-59" });
            return;
          }
          schedule.hour = h;
          schedule.minute = m;
        } else {
          json(res, 400, { error: `Invalid schedule type: ${body.type}. Must be interval, daily, weekly, or once.` });
          return;
        }
        updates.schedule = schedule;
      }

      const job = updateJob(id, updates);
      if (!job) { json(res, 404, { error: "Job not found" }); return; }
      const { tz, abbr } = getTzInfo();
      json(res, 200, {
        id: job.id,
        name: job.name,
        prompt: job.prompt,
        schedule: formatSchedule(job.schedule),
        enabled: job.enabled,
        nextRunAt: `${formatInTimezone(job.nextRunAt, tz, "datetime")} ${abbr}`,
      });
      return;
    }

    if (url.startsWith("/cron/jobs/") && method === "DELETE") {
      const id = extractId(url, "/cron/jobs/");
      if (!id) { json(res, 400, { error: "Missing job ID" }); return; }
      const ok = removeJob(id);
      json(res, ok ? 200 : 404, ok ? { removed: true } : { error: "Job not found" });
      return;
    }

    if (url.startsWith("/cron/jobs/") && url.endsWith("/toggle") && method === "POST") {
      const id = extractId(url, "/cron/jobs/");
      if (!id) { json(res, 400, { error: "Missing job ID" }); return; }
      const job = toggleJob(id);
      if (!job) { json(res, 404, { error: "Job not found" }); return; }
      const { tz, abbr } = getTzInfo();
      json(res, 200, { id: job.id, enabled: job.enabled, nextRunAt: `${formatInTimezone(job.nextRunAt, tz, "datetime")} ${abbr}` });
      return;
    }

    if (url.startsWith("/cron/jobs/") && url.endsWith("/run") && method === "POST") {
      const id = extractId(url, "/cron/jobs/");
      if (!id) { json(res, 400, { error: "Missing job ID" }); return; }
      const result = await runJobNow(id);
      if (result === "not_found") { json(res, 404, { error: "Job not found" }); return; }
      if (result === "no_scheduler") { json(res, 503, { error: "Cron scheduler not running" }); return; }
      json(res, 200, { triggered: true });
      return;
    }

    // --- Watch routes ---
    if (url === "/watch/jobs" && method === "GET") {
      const { tz, abbr } = getTzInfo();
      const jobs = listWatches().map((w) => ({
        id: w.id,
        name: w.name,
        url: w.url,
        task: w.task,
        intervalMinutes: w.intervalMinutes,
        enabled: w.enabled,
        lastCheckAt: w.lastCheckAt ? `${formatInTimezone(w.lastCheckAt, tz, "datetime")} ${abbr}` : null,
        lastCheckOk: w.lastCheckOk,
        lastChangedAt: w.lastChangedAt ? `${formatInTimezone(w.lastChangedAt, tz, "datetime")} ${abbr}` : null,
        nextCheckAt: `${formatInTimezone(w.nextCheckAt, tz, "datetime")} ${abbr}`,
        checkCount: w.checkCount,
        changeCount: w.changeCount,
        consecutiveErrors: w.consecutiveErrors,
      }));
      json(res, 200, { timezone: tz, watches: jobs });
      return;
    }

    if (url === "/watch/jobs" && method === "POST") {
      const body = parseJson(await readBody(req)) as any;
      if (!body?.name || !body?.url || !body?.task) {
        json(res, 400, { error: "Missing required fields: name, url, task" });
        return;
      }
      const intervalMinutes = body.interval_minutes ?? 30;
      if (typeof intervalMinutes !== "number" || intervalMinutes < 5) {
        json(res, 400, { error: "interval_minutes must be >= 5" });
        return;
      }
      const validation = await validateWatchUrl(body.url);
      if (!validation.ok) {
        json(res, 400, { error: `Cannot fetch URL: ${validation.error}` });
        return;
      }

      const watch = addWatch(body.name, body.url, body.task, intervalMinutes, validation.snapshot);
      const { tz, abbr } = getTzInfo();
      json(res, 201, {
        id: watch.id,
        name: watch.name,
        url: watch.url,
        task: watch.task,
        intervalMinutes: watch.intervalMinutes,
        nextCheckAt: `${formatInTimezone(watch.nextCheckAt, tz, "datetime")} ${abbr}`,
        baseline: { wordCount: validation.wordCount, warning: validation.warning ?? null },
      });
      return;
    }

    if (url.startsWith("/watch/jobs/") && !url.includes("/toggle") && !url.includes("/run") && method === "PATCH") {
      const id = extractId(url, "/watch/jobs/");
      if (!id) { json(res, 400, { error: "Missing watch ID" }); return; }
      const body = parseJson(await readBody(req)) as any;
      if (!body || typeof body !== "object") {
        json(res, 400, { error: "Invalid request body" });
        return;
      }
      const updates: { name?: string; url?: string; task?: string; intervalMinutes?: number } = {};
      if (body.name !== undefined) updates.name = String(body.name);
      if (body.url !== undefined) updates.url = String(body.url);
      if (body.task !== undefined) updates.task = String(body.task);
      if (body.interval_minutes !== undefined) {
        if (typeof body.interval_minutes !== "number" || body.interval_minutes < 5) {
          json(res, 400, { error: "interval_minutes must be >= 5" });
          return;
        }
        updates.intervalMinutes = body.interval_minutes;
      }
      const watch = updateWatch(id, updates);
      if (!watch) { json(res, 404, { error: "Watch not found" }); return; }
      const { tz, abbr } = getTzInfo();
      json(res, 200, {
        id: watch.id,
        name: watch.name,
        url: watch.url,
        task: watch.task,
        intervalMinutes: watch.intervalMinutes,
        enabled: watch.enabled,
        nextCheckAt: `${formatInTimezone(watch.nextCheckAt, tz, "datetime")} ${abbr}`,
      });
      return;
    }

    if (url.startsWith("/watch/jobs/") && method === "DELETE") {
      const id = extractId(url, "/watch/jobs/");
      if (!id) { json(res, 400, { error: "Missing watch ID" }); return; }
      const ok = removeWatch(id);
      json(res, ok ? 200 : 404, ok ? { removed: true } : { error: "Watch not found" });
      return;
    }

    if (url.startsWith("/watch/jobs/") && url.endsWith("/toggle") && method === "POST") {
      const id = extractId(url, "/watch/jobs/");
      if (!id) { json(res, 400, { error: "Missing watch ID" }); return; }
      const watch = toggleWatch(id);
      if (!watch) { json(res, 404, { error: "Watch not found" }); return; }
      const { tz, abbr } = getTzInfo();
      json(res, 200, { id: watch.id, enabled: watch.enabled, nextCheckAt: `${formatInTimezone(watch.nextCheckAt, tz, "datetime")} ${abbr}` });
      return;
    }

    if (url.startsWith("/watch/jobs/") && url.endsWith("/run") && method === "POST") {
      const id = extractId(url, "/watch/jobs/");
      if (!id) { json(res, 400, { error: "Missing watch ID" }); return; }
      const result = await runWatchNow(id);
      if (result === "not_found") { json(res, 404, { error: "Watch not found" }); return; }
      if (result === "no_scheduler") { json(res, 503, { error: "Watch scheduler not running" }); return; }
      json(res, 200, { triggered: true });
      return;
    }

    // --- Notify route ---
    if (url === "/notify" && method === "POST") {
      if (!botApi || !chatId) {
        json(res, 503, { error: "Bot not ready" });
        return;
      }
      const body = parseJson(await readBody(req)) as any;
      if (!body?.message) {
        json(res, 400, { error: "Missing required field: message" });
        return;
      }
      const text = String(body.message).slice(0, 4096);
      await botApi.sendMessage(chatId, text);
      json(res, 200, { sent: true });
      return;
    }

    // --- Health route ---
    if (url === "/health" && method === "GET") {
      const serverDown = isServerDown();
      let providerHealth = null;
      try {
        const provider = getProvider();
        providerHealth = await provider.getHealth();
      } catch {}
      json(res, 200, {
        relay: serverDown ? "degraded" : "ok",
        serverDown,
        provider: providerHealth,
      });
      return;
    }

    // --- 404 ---
    json(res, 404, { error: "Not found" });
  } catch (err: any) {
    const msg = err?.message ?? "Internal server error";
    if (msg === "Request body too large") {
      json(res, 413, { error: "Request body too large" });
      return;
    }
    relayApiLogger.info({ err: msg, url, method }, "Relay API error");
    json(res, 500, { error: msg });
  }
}

// --- Public API ---

export async function startRelayApi(
  api: Api<RawApi>,
  userId: number,
  port: number,
): Promise<{ port: number }> {
  botApi = api;
  chatId = userId;

  return new Promise((resolve, reject) => {
    server = createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        relayApiLogger.info({ err: err?.message }, "Unhandled request error");
        if (!res.headersSent) json(res, 500, { error: "Internal error" });
      });
    });

    server.listen(port, "127.0.0.1", () => {
      const addr = server!.address();
      const listenPort = typeof addr === "object" && addr ? addr.port : 0;
      relayApiLogger.info({ port: listenPort }, "Relay API listening");
      resolve({ port: listenPort });
    });

    server.on("error", (err) => {
      relayApiLogger.info({ err: err?.message }, "Relay API server error");
      reject(err);
    });
  });
}

export function stopRelayApi(): void {
  if (server) {
    server.close();
    server = null;
    relayApiLogger.info("Relay API stopped");
  }
}
