#!/usr/bin/env node
/**
 * Relay MCP Server — exposes Relay bot management tools to the AI agent via MCP.
 *
 * This is a standalone stdio process spawned by OpenCode. It communicates with
 * Relay's internal HTTP API on localhost using a shared auth token.
 *
 * Environment variables (set by OpenCode when spawning):
 *   RELAY_API_PORT  — port of the Relay internal API (localhost-only, no auth needed)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";

const API_PORT = process.env.RELAY_API_PORT;

if (!API_PORT) {
  process.stderr.write("Missing RELAY_API_PORT environment variable\n");
  process.exit(1);
}

const BASE_URL = `http://127.0.0.1:${API_PORT}`;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

// --- HTTP helper with retry ---

async function apiCall(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const url = `${BASE_URL}${path}`;
      const opts: RequestInit = {
        method,
        headers: {
          "Content-Type": "application/json",
        },
      };
      if (body !== undefined) {
        opts.body = JSON.stringify(body);
      }

      const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(10_000) });
      const data = await res.json();
      return { status: res.status, data };
    } catch (err: any) {
      lastError = err;
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
      }
    }
  }

  throw lastError ?? new Error("API call failed after retries");
}

function formatError(data: unknown): string {
  if (typeof data === "object" && data !== null && "error" in data) {
    return String((data as any).error);
  }
  return JSON.stringify(data);
}

// --- MCP Server setup ---

const server = new McpServer(
  { name: "relay", version: "1.0.0" },
  {
    capabilities: { tools: {} },
    instructions:
      "Relay MCP server — manage the Relay Telegram bot: scheduled tasks (cron), notifications, and health checks.",
  },
);

// --- Tool: cron_list ---

server.registerTool("cron_list", {
  title: "List Cron Jobs",
  description: "List all scheduled cron jobs with their status, schedule, and next run time. All times are shown in the user's configured timezone.",
}, async () => {
  const { status, data } = await apiCall("GET", "/cron/jobs");
  if (status !== 200) {
    return { content: [{ type: "text", text: `Error: ${formatError(data)}` }], isError: true };
  }
  const d = data as any;
  const jobs = d.jobs;
  if (!jobs || jobs.length === 0) {
    return { content: [{ type: "text", text: "No scheduled jobs." }] };
  }
  const header = d.timezone ? `Timezone: ${d.timezone}\n\n` : "";
  const lines = jobs.map((j: any) =>
    `• [${j.enabled ? "ON" : "OFF"}] ${j.name} (${j.id})\n  Schedule: ${j.schedule}\n  Next run: ${j.nextRunAt}\n  Last run: ${j.lastRunAt ?? "never"} (${j.lastRunOk === null ? "n/a" : j.lastRunOk ? "ok" : "failed"})\n  Runs: ${j.runCount}\n  Prompt: ${j.prompt}`,
  );
  return { content: [{ type: "text", text: header + lines.join("\n\n") }] };
});

// --- Tool: cron_add ---

server.registerTool("cron_add", {
  title: "Create Cron Job",
  description:
    "Create a new scheduled cron job. IMPORTANT: hour and minute are in the user's LOCAL timezone — the system handles UTC conversion internally. Do NOT pre-convert to UTC.",
  inputSchema: {
    name: z.string().describe("Short descriptive name for the job"),
    prompt: z.string().describe("The full instruction sent to the AI when the job runs"),
    type: z.enum(["interval", "daily", "weekly", "once"]).describe("Schedule type"),
    interval_minutes: z.number().optional().describe("Minutes between runs (for interval type, minimum 1)"),
    hour: z.number().optional().describe("Hour 0-23 in user's LOCAL timezone. Pass the user's stated time directly. If user specifies a different timezone, convert to their local timezone first. Never pass UTC values."),
    minute: z.number().optional().describe("Minute of hour 0-59 (for daily/weekly/once)"),
    days: z.array(z.number()).optional().describe("Days of week 0=Sun..6=Sat (for weekly type)"),
  },
}, async (args) => {
  const { status, data } = await apiCall("POST", "/cron/jobs", {
    name: args.name,
    prompt: args.prompt,
    type: args.type,
    interval_minutes: args.interval_minutes,
    hour: args.hour,
    minute: args.minute,
    days: args.days,
  });
  if (status === 201) {
    const d = data as any;
    return {
      content: [{
        type: "text",
        text: `Created cron job "${d.name}" (${d.id})\nSchedule: ${d.schedule}\nNext run: ${d.nextRunAt}`,
      }],
    };
  }
  return { content: [{ type: "text", text: `Error: ${formatError(data)}` }], isError: true };
});

// --- Tool: cron_update ---

server.registerTool("cron_update", {
  title: "Update Cron Job",
  description:
    "Update an existing cron job. Only provided fields are changed; omitted fields stay the same. To change schedule, provide type and its associated fields. IMPORTANT: hour and minute are in the user's LOCAL timezone — the system handles UTC conversion internally. Do NOT pre-convert to UTC.",
  inputSchema: {
    id: z.string().describe("The job ID to update"),
    name: z.string().optional().describe("New name for the job"),
    prompt: z.string().optional().describe("New prompt for the job"),
    type: z.enum(["interval", "daily", "weekly", "once"]).optional().describe("New schedule type (also provide associated fields)"),
    interval_minutes: z.number().optional().describe("Minutes between runs (for interval type, minimum 1)"),
    hour: z.number().optional().describe("Hour 0-23 in user's LOCAL timezone. Pass the user's stated time directly. If user specifies a different timezone, convert to their local timezone first. Never pass UTC values."),
    minute: z.number().optional().describe("Minute of hour 0-59 (for daily/weekly/once)"),
    days: z.array(z.number()).optional().describe("Days of week 0=Sun..6=Sat (for weekly type)"),
  },
}, async (args) => {
  const body: Record<string, unknown> = {};
  if (args.name !== undefined) body.name = args.name;
  if (args.prompt !== undefined) body.prompt = args.prompt;
  if (args.type !== undefined) body.type = args.type;
  if (args.interval_minutes !== undefined) body.interval_minutes = args.interval_minutes;
  if (args.hour !== undefined) body.hour = args.hour;
  if (args.minute !== undefined) body.minute = args.minute;
  if (args.days !== undefined) body.days = args.days;

  const { status, data } = await apiCall("PATCH", `/cron/jobs/${encodeURIComponent(args.id)}`, body);
  if (status === 200) {
    const d = data as any;
    return {
      content: [{
        type: "text",
        text: `Updated job "${d.name}" (${d.id})\nSchedule: ${d.schedule}\nNext run: ${d.nextRunAt}`,
      }],
    };
  }
  return { content: [{ type: "text", text: `Error: ${formatError(data)}` }], isError: true };
});

// --- Tool: cron_remove ---

server.registerTool("cron_remove", {
  title: "Remove Cron Job",
  description: "Delete a scheduled cron job by ID.",
  inputSchema: {
    id: z.string().describe("The job ID to remove"),
  },
}, async (args) => {
  const { status, data } = await apiCall("DELETE", `/cron/jobs/${encodeURIComponent(args.id)}`);
  if (status === 200) {
    return { content: [{ type: "text", text: `Job ${args.id} removed.` }] };
  }
  return { content: [{ type: "text", text: `Error: ${formatError(data)}` }], isError: true };
});

// --- Tool: cron_toggle ---

server.registerTool("cron_toggle", {
  title: "Toggle Cron Job",
  description: "Enable or disable a cron job without deleting it.",
  inputSchema: {
    id: z.string().describe("The job ID to toggle"),
  },
}, async (args) => {
  const { status, data } = await apiCall("POST", `/cron/jobs/${encodeURIComponent(args.id)}/toggle`);
  if (status === 200) {
    const d = data as any;
    return {
      content: [{
        type: "text",
        text: `Job ${d.id} is now ${d.enabled ? "enabled" : "disabled"}.${d.enabled ? `\nNext run: ${d.nextRunAt}` : ""}`,
      }],
    };
  }
  return { content: [{ type: "text", text: `Error: ${formatError(data)}` }], isError: true };
});

// --- Tool: cron_run ---

server.registerTool("cron_run", {
  title: "Run Cron Job Now",
  description: "Trigger a cron job to run immediately, outside its regular schedule.",
  inputSchema: {
    id: z.string().describe("The job ID to run"),
  },
}, async (args) => {
  const { status, data } = await apiCall("POST", `/cron/jobs/${encodeURIComponent(args.id)}/run`);
  if (status === 200) {
    return { content: [{ type: "text", text: `Job ${args.id} triggered. It will run shortly.` }] };
  }
  return { content: [{ type: "text", text: `Error: ${formatError(data)}` }], isError: true };
});

// --- Tool: notify ---

server.registerTool("notify", {
  title: "Send Notification",
  description: "Send a notification message to the user on Telegram. Use sparingly — only for important alerts or when the user explicitly asks to be notified.",
  inputSchema: {
    message: z.string().describe("The notification message to send (plain text, keep concise)"),
  },
}, async (args) => {
  const { status, data } = await apiCall("POST", "/notify", { message: args.message });
  if (status === 200) {
    return { content: [{ type: "text", text: "Notification sent." }] };
  }
  return { content: [{ type: "text", text: `Error: ${formatError(data)}` }], isError: true };
});

// --- Tool: health ---

server.registerTool("health", {
  title: "Health Check",
  description: "Check the health status of Relay bot and OpenCode server.",
}, async () => {
  const { status, data } = await apiCall("GET", "/health");
  if (status === 200) {
    const d = data as any;
    const lines = [
      `Relay: ${d.relay}`,
      `Server down: ${d.serverDown ? "yes" : "no"}`,
    ];
    if (d.provider) {
      lines.push(`Provider: ${d.provider.provider ?? "unknown"}`);
      lines.push(`Status: ${d.provider.status ?? "unknown"}`);
      if (d.provider.model) lines.push(`Model: ${d.provider.model}`);
      if (d.provider.project) lines.push(`Project: ${d.provider.project}`);
      if (d.provider.branch) lines.push(`Branch: ${d.provider.branch}`);
    }
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
  return { content: [{ type: "text", text: `Error: ${formatError(data)}` }], isError: true };
});

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Relay MCP server error: ${err?.message ?? err}\n`);
  process.exit(1);
});
