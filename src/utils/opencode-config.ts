import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const OPENCODE_CONFIG_DIR = join(homedir(), ".config", "opencode");
const OPENCODE_CONFIG_FILE = join(OPENCODE_CONFIG_DIR, "opencode.json");

const PLAYWRIGHT_MCP = {
  type: "local",
  command: ["npx", "-y", "@playwright/mcp@latest", "--headless", "--browser", "chromium"],
  timeout: 30000,
};

/** Ensure Playwright MCP is in OpenCode's config file so it's available on startup */
export function ensurePlaywrightMcp(): void {
  let config: any = {};

  if (existsSync(OPENCODE_CONFIG_FILE)) {
    try {
      config = JSON.parse(readFileSync(OPENCODE_CONFIG_FILE, "utf-8"));
    } catch {
      config = {};
    }
  }

  if (!config.mcp) config.mcp = {};

  // Already configured — skip
  if (config.mcp.playwright) return;

  config.mcp.playwright = PLAYWRIGHT_MCP;
  if (!config.$schema) config.$schema = "https://opencode.ai/config.json";

  mkdirSync(OPENCODE_CONFIG_DIR, { recursive: true });
  writeFileSync(OPENCODE_CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
}

/** Remove Playwright MCP from OpenCode's config file */
export function removePlaywrightMcp(): void {
  if (!existsSync(OPENCODE_CONFIG_FILE)) return;

  let config: any;
  try {
    config = JSON.parse(readFileSync(OPENCODE_CONFIG_FILE, "utf-8"));
  } catch {
    return;
  }

  if (!config.mcp?.playwright) return;

  delete config.mcp.playwright;
  if (Object.keys(config.mcp).length === 0) delete config.mcp;

  writeFileSync(OPENCODE_CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
}
