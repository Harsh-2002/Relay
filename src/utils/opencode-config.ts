import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";

const OPENCODE_CONFIG_DIR = join(homedir(), ".config", "opencode");
const OPENCODE_CONFIG_FILE = join(OPENCODE_CONFIG_DIR, "opencode.json");

const PLAYWRIGHT_MCP = {
  type: "local",
  command: ["npx", "-y", "@playwright/mcp@latest", "--headless", "--browser", "chromium"],
  timeout: 30000,
};

const FETCH_MCP = {
  type: "local",
  command: ["uvx", "mcp-server-fetch"],
  timeout: 30000,
};

// Memory MCP is built dynamically — needs MEMORY_FILE_PATH env var

function readOpenCodeConfig(): any {
  if (!existsSync(OPENCODE_CONFIG_FILE)) return {};
  try {
    return JSON.parse(readFileSync(OPENCODE_CONFIG_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeOpenCodeConfig(config: any): void {
  mkdirSync(OPENCODE_CONFIG_DIR, { recursive: true });
  writeFileSync(OPENCODE_CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
}

/** Idempotently add an MCP to OpenCode's config */
function ensureMcp(name: string, mcpConfig: object): void {
  const config = readOpenCodeConfig();
  if (!config.mcp) config.mcp = {};
  if (config.mcp[name]) return; // Already configured
  config.mcp[name] = mcpConfig;
  if (!config.$schema) config.$schema = "https://opencode.ai/config.json";
  writeOpenCodeConfig(config);
}

/** Idempotently remove an MCP from OpenCode's config */
function removeMcp(name: string): void {
  const config = readOpenCodeConfig();
  if (!config.mcp?.[name]) return;
  delete config.mcp[name];
  if (Object.keys(config.mcp).length === 0) delete config.mcp;
  writeOpenCodeConfig(config);
}

export function ensurePlaywrightMcp(): void { ensureMcp("playwright", PLAYWRIGHT_MCP); }
export function removePlaywrightMcp(): void { removeMcp("playwright"); }

export function ensureFetchMcp(): void { ensureMcp("fetch", FETCH_MCP); }
export function removeFetchMcp(): void { removeMcp("fetch"); }

export function ensureMemoryMcp(dataDir: string): void {
  ensureMcp("memory", {
    type: "local",
    command: ["npx", "-y", "@modelcontextprotocol/server-memory"],
    environment: { MEMORY_FILE_PATH: join(dataDir, "memory.jsonl") },
    timeout: 30000,
  });
}
export function removeMemoryMcp(): void { removeMcp("memory"); }

export function ensureFilesystemMcp(paths: string[]): void {
  ensureMcp("filesystem", {
    type: "local",
    command: ["npx", "-y", "@modelcontextprotocol/server-filesystem", ...paths],
    timeout: 30000,
  });
}
export function removeFilesystemMcp(): void { removeMcp("filesystem"); }

export function ensureRelayMcp(port: number, token: string): void {
  const thisDir = typeof __dirname !== "undefined"
    ? __dirname
    : fileURLToPath(new URL(".", import.meta.url));
  const serverPath = resolve(thisDir, "..", "mcp", "relay-server.js");
  ensureMcp("relay", {
    type: "local",
    command: ["node", serverPath],
    environment: {
      RELAY_API_PORT: String(port),
      RELAY_API_TOKEN: token,
    },
    timeout: 30000,
  });
}
export function removeRelayMcp(): void { removeMcp("relay"); }
