import { existsSync, mkdirSync, writeFileSync, renameSync } from "fs";
import { join } from "path";
import type { RelayConfig } from "./schema.js";
import { CONFIG_DEFAULTS } from "./schema.js";

export async function runSetupWizard(dataDir: string): Promise<RelayConfig> {
  const { input, select, confirm, password } = await import("@inquirer/prompts");

  console.log("\n  Relay Setup\n");
  console.log("  Configure your Telegram bot for AI coding agents.\n");

  // 1. Bot token
  const botToken = await password({
    message: "Telegram bot token (from @BotFather):",
    validate: (v) => (v.length > 0 ? true : "Bot token is required"),
  });

  // 2. Allowed user ID
  const allowedUserIdStr = await input({
    message: "Your Telegram user ID:",
    validate: (v) => {
      const n = Number(v);
      return !isNaN(n) && n > 0 ? true : "Must be a positive number";
    },
  });
  const allowedUserId = Number(allowedUserIdStr);

  // 3. Provider
  const provider = await select({
    message: "AI provider:",
    choices: [
      { value: "opencode" as const, name: "OpenCode (default)" },
      { value: "claude" as const, name: "Claude Code" },
      { value: "codex" as const, name: "OpenAI Codex" },
    ],
  });

  // 4. Provider-specific settings
  const config: RelayConfig = {
    ...CONFIG_DEFAULTS,
    botToken,
    allowedUserId,
    provider,
    dataDir,
  };

  if (provider === "opencode") {
    const opencodeMode = await select({
      message: "OpenCode mode:",
      choices: [
        { value: "start" as const, name: "Start (spawn local server)" },
        { value: "connect" as const, name: "Connect (remote server)" },
      ],
    });
    config.opencodeMode = opencodeMode;

    if (opencodeMode === "connect") {
      config.opencodeUrl = await input({
        message: "OpenCode server URL:",
        default: "http://localhost:4096",
      });
    }
  } else if (provider === "claude") {
    config.claudeModel = await input({
      message: "Claude model:",
      default: "sonnet",
    });
    config.claudePermissionMode = await select({
      message: "Permission mode:",
      choices: [
        { value: "acceptEdits", name: "Accept Edits — approve file writes (default)" },
        { value: "bypassPermissions", name: "Bypass Permissions — no prompts" },
        { value: "dontAsk", name: "Don't Ask — allow everything silently" },
        { value: "plan", name: "Plan — read-only, no writes" },
        { value: "default", name: "Default — prompt for all actions" },
      ],
    });
  } else if (provider === "codex") {
    config.codexModel = await input({
      message: "Codex model:",
      default: "o3",
    });
  }

  // 5. STT (optional)
  const configureStt = await confirm({
    message: "Configure voice transcription (STT)?",
    default: false,
  });

  if (configureStt) {
    const groqKey = await password({ message: "Groq API key (optional, press Enter to skip):" });
    if (groqKey) config.groqApiKey = groqKey;

    const openaiSttKey = await password({ message: "OpenAI API key for STT (optional, press Enter to skip):" });
    if (openaiSttKey) config.openaiSttApiKey = openaiSttKey;

    const assemblyaiKey = await password({ message: "AssemblyAI API key (optional, press Enter to skip):" });
    if (assemblyaiKey) config.assemblyaiApiKey = assemblyaiKey;
  }

  // 6. Streaming
  config.streamingEnabled = await confirm({
    message: "Enable streaming responses?",
    default: false,
  });

  // 7. Log level
  config.logLevel = await select({
    message: "Log level:",
    choices: [
      { value: "info", name: "Info (default)" },
      { value: "debug", name: "Debug" },
      { value: "warn", name: "Warn" },
      { value: "error", name: "Error" },
    ],
  });

  // Write config
  saveConfig(config, dataDir);

  console.log(`\n  Config saved to ${join(dataDir, "config.json")}`);
  console.log("  Run 'relay' to start the bot.\n");

  return config;
}

export function saveConfig(config: RelayConfig, dataDir: string): void {
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  }

  // Strip empty/default values for a cleaner config file
  const toSave: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (key === "dataDir") continue; // Don't persist dataDir — it's derived
    if (value === "" || value === 0 || value === false) {
      // Only include non-default falsy values for key fields
      if (key === "botToken" || key === "allowedUserId" || key === "provider") {
        toSave[key] = value;
      }
      continue;
    }
    const defaultVal = (CONFIG_DEFAULTS as any)[key];
    if (value !== defaultVal) {
      toSave[key] = value;
    }
  }

  // Always include essential fields
  toSave.botToken = config.botToken;
  toSave.allowedUserId = config.allowedUserId;
  toSave.provider = config.provider;

  const filePath = join(dataDir, "config.json");
  const tmp = filePath + ".tmp";
  writeFileSync(tmp, JSON.stringify(toSave, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, filePath);
}
