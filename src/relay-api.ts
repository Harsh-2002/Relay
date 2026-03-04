import { createServer, type Server, type IncomingMessage, type ServerResponse } from "http";
import { randomBytes } from "crypto";
import type { Api, RawApi } from "grammy";
import { listJobs, addJob, removeJob, toggleJob, runJobNow, formatSchedule, type CronSchedule } from "./cron.js";
import { isServerDown } from "./lifecycle.js";
import { getProvider } from "./providers/index.js";
import { chunkMessage } from "./utils/chunker.js";
import { JsonStore } from "./utils/store.js";
import { relayApiLogger } from "./utils/logger.js";

interface RelayMcpState {
  token: string;
}

const mcpStore = new JsonStore<RelayMcpState>("relay-mcp.json", { token: "" });

let server: Server | null = null;
let apiPort = 0;
let apiToken = "";
let botApi: Api<RawApi> | null = null;
let chatId: number | null = null;

// --- Helpers ---

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
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
  const auth = req.headers["authorization"];
  if (auth !== `Bearer ${apiToken}`) {
    json(res, 401, { error: "Unauthorized" });
    return;
  }

  const method = req.method ?? "GET";
  const url = req.url ?? "/";

  try {
    // --- Cron routes ---
    if (url === "/cron/jobs" && method === "GET") {
      const jobs = listJobs().map((j) => ({
        id: j.id,
        name: j.name,
        prompt: j.prompt,
        schedule: formatSchedule(j.schedule),
        enabled: j.enabled,
        lastRunAt: j.lastRunAt ? new Date(j.lastRunAt).toISOString() : null,
        lastRunOk: j.lastRunOk,
        nextRunAt: new Date(j.nextRunAt).toISOString(),
        runCount: j.runCount,
      }));
      json(res, 200, { jobs });
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
        schedule.intervalMinutes = body.interval_minutes ?? 60;
      } else if (body.type === "daily") {
        schedule.hour = body.hour ?? 9;
        schedule.minute = body.minute ?? 0;
      } else if (body.type === "weekly") {
        schedule.hour = body.hour ?? 9;
        schedule.minute = body.minute ?? 0;
        schedule.days = body.days ?? [1];
      } else {
        json(res, 400, { error: `Invalid schedule type: ${body.type}. Must be interval, daily, or weekly.` });
        return;
      }

      const job = addJob(body.name, body.prompt, schedule);
      json(res, 201, {
        id: job.id,
        name: job.name,
        schedule: formatSchedule(job.schedule),
        nextRunAt: new Date(job.nextRunAt).toISOString(),
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
      json(res, 200, { id: job.id, enabled: job.enabled, nextRunAt: new Date(job.nextRunAt).toISOString() });
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
      const chunks = chunkMessage(text);
      for (const chunk of chunks) {
        await botApi.sendMessage(chatId, chunk);
      }
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
    relayApiLogger.error({ err: err?.message, url, method }, "Relay API error");
    json(res, 500, { error: err?.message ?? "Internal server error" });
  }
}

// --- Public API ---

export async function startRelayApi(
  api: Api<RawApi>,
  userId: number,
  port: number,
): Promise<{ port: number; token: string }> {
  botApi = api;
  chatId = userId;

  // Reuse persisted token across restarts so the MCP server process
  // (spawned by OpenCode) doesn't need to be restarted when Relay restarts.
  const state = mcpStore.load();
  if (state.token) {
    apiToken = state.token;
  } else {
    apiToken = randomBytes(32).toString("hex");
    mcpStore.save({ token: apiToken });
  }

  return new Promise((resolve, reject) => {
    server = createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        relayApiLogger.error({ err: err?.message }, "Unhandled request error");
        if (!res.headersSent) json(res, 500, { error: "Internal error" });
      });
    });

    server.listen(port, "127.0.0.1", () => {
      const addr = server!.address();
      apiPort = typeof addr === "object" && addr ? addr.port : 0;
      relayApiLogger.info({ port: apiPort }, "Relay API listening");
      resolve({ port: apiPort, token: apiToken });
    });

    server.on("error", (err) => {
      relayApiLogger.error({ err: err?.message }, "Relay API server error");
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
