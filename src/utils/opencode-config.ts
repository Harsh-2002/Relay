import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

/** Idempotently add or update an MCP in OpenCode's config */
function ensureMcp(name: string, mcpConfig: object): void {
  const config = readOpenCodeConfig();
  if (!config.mcp) config.mcp = {};

  // Compare existing config — skip write if identical
  const existing = config.mcp[name];
  if (existing && JSON.stringify(existing) === JSON.stringify(mcpConfig)) return;

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

/** Idempotently add a file path to OpenCode's `instructions` array */
export function ensureInstructions(filePath: string): void {
  const absPath = resolve(filePath);
  const config = readOpenCodeConfig();
  if (!config.instructions) config.instructions = [];
  if (!Array.isArray(config.instructions)) config.instructions = [config.instructions];
  if (config.instructions.includes(absPath)) return;
  config.instructions.push(absPath);
  if (!config.$schema) config.$schema = "https://opencode.ai/config.json";
  writeOpenCodeConfig(config);
}

/** Remove Relay's instructions path from OpenCode's config */
export function removeInstructions(filePath: string): void {
  const absPath = resolve(filePath);
  const config = readOpenCodeConfig();
  if (!Array.isArray(config.instructions)) return;
  const idx = config.instructions.indexOf(absPath);
  if (idx === -1) return;
  config.instructions.splice(idx, 1);
  if (config.instructions.length === 0) delete config.instructions;
  writeOpenCodeConfig(config);
}

export function ensureRelayMcp(port: number, token: string): void {
  const serverPath = resolve(__dirname, "..", "mcp", "relay-server.js");
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
