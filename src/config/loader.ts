import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { parseArgs } from "util";
import type { RelayConfig } from "./schema.js";
import { CONFIG_DEFAULTS } from "./schema.js";

const CONFIG_FILENAME = "config.json";

/** Resolve the data directory (bootstrap — no config dependency). */
function resolveDataDir(cliDataDir?: string): string {
  return cliDataDir || join(process.cwd(), ".relay");
}

/** Parse CLI args into a partial config. */
function parseCli(): { flags: Partial<RelayConfig>; showHelp: boolean; showVersion: boolean } {
  try {
    const { values } = parseArgs({
      strict: false,
      options: {
        help: { type: "boolean", short: "h", default: false },
        version: { type: "boolean", short: "v", default: false },
        "bot-token": { type: "string" },
        "allowed-user-id": { type: "string" },
        provider: { type: "string" },
        "bot-mode": { type: "string" },
        "webhook-url": { type: "string" },
        "webhook-port": { type: "string" },
        "webhook-secret": { type: "string" },
        "opencode-mode": { type: "string" },
        "opencode-url": { type: "string" },
        "opencode-hostname": { type: "string" },
        "opencode-port": { type: "string" },
        "opencode-model": { type: "string" },
        "stt-provider": { type: "string" },
        "groq-api-key": { type: "string" },
        "openai-stt-api-key": { type: "string" },
        "assemblyai-api-key": { type: "string" },
        "streaming-enabled": { type: "string" },
        "stream-edit-interval-ms": { type: "string" },
        "prompt-timeout-ms": { type: "string" },
        "log-level": { type: "string" },
        "data-dir": { type: "string" },
        "system-prompt-file": { type: "string" },
      },
    });

    const flags: Partial<RelayConfig> = {};
    if (values["bot-token"]) flags.botToken = values["bot-token"] as string;
    if (values["allowed-user-id"]) flags.allowedUserId = Number(values["allowed-user-id"]);
    if (values["provider"]) flags.provider = values["provider"] as RelayConfig["provider"];
    if (values["bot-mode"]) flags.botMode = values["bot-mode"] as RelayConfig["botMode"];
    if (values["webhook-url"]) flags.webhookUrl = values["webhook-url"] as string;
    if (values["webhook-port"]) flags.webhookPort = Number(values["webhook-port"]);
    if (values["webhook-secret"]) flags.webhookSecret = values["webhook-secret"] as string;
    if (values["opencode-mode"]) flags.opencodeMode = values["opencode-mode"] as RelayConfig["opencodeMode"];
    if (values["opencode-url"]) flags.opencodeUrl = values["opencode-url"] as string;
    if (values["opencode-hostname"]) flags.opencodeHostname = values["opencode-hostname"] as string;
    if (values["opencode-port"]) flags.opencodePort = Number(values["opencode-port"]);
    if (values["opencode-model"]) flags.opencodeModel = values["opencode-model"] as string;
    if (values["stt-provider"]) flags.sttProvider = values["stt-provider"] as RelayConfig["sttProvider"];
    if (values["groq-api-key"]) flags.groqApiKey = values["groq-api-key"] as string;
    if (values["openai-stt-api-key"]) flags.openaiSttApiKey = values["openai-stt-api-key"] as string;
    if (values["assemblyai-api-key"]) flags.assemblyaiApiKey = values["assemblyai-api-key"] as string;
    if (values["streaming-enabled"]) flags.streamingEnabled = values["streaming-enabled"] === "true";
    if (values["stream-edit-interval-ms"]) flags.streamEditIntervalMs = Number(values["stream-edit-interval-ms"]);
    if (values["prompt-timeout-ms"]) flags.promptTimeoutMs = Number(values["prompt-timeout-ms"]);
    if (values["log-level"]) flags.logLevel = values["log-level"] as string;
    if (values["data-dir"]) flags.dataDir = values["data-dir"] as string;
    if (values["system-prompt-file"]) flags.systemPromptFile = values["system-prompt-file"] as string;

    return {
      flags,
      showHelp: !!values["help"],
      showVersion: !!values["version"],
    };
  } catch {
    return { flags: {}, showHelp: false, showVersion: false };
  }
}

/** Read config.json from the data directory. */
function readConfigFile(dataDir: string): Partial<RelayConfig> {
  const filePath = join(dataDir, CONFIG_FILENAME);
  if (!existsSync(filePath)) return {};
  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as Partial<RelayConfig>;
  } catch {
    console.warn(`\n  Warning: Failed to parse ${filePath}, using defaults.\n`);
    return {};
  }
}

export interface LoadResult {
  config: RelayConfig;
  showHelp: boolean;
  showVersion: boolean;
  needsSetup: boolean;
}

/**
 * Load config with resolution order: CLI flags > config file > defaults.
 */
export function loadConfig(): LoadResult {
  const cli = parseCli();
  const dataDir = resolveDataDir(cli.flags.dataDir);
  const fileConfig = readConfigFile(dataDir);

  // Merge: CLI > file > defaults
  const config: RelayConfig = { ...CONFIG_DEFAULTS };

  // Apply file config
  for (const [key, value] of Object.entries(fileConfig)) {
    if (value !== undefined && value !== "") {
      (config as any)[key] = value;
    }
  }

  // Apply CLI flags (highest priority)
  for (const [key, value] of Object.entries(cli.flags)) {
    if (value !== undefined && value !== "") {
      (config as any)[key] = value;
    }
  }

  // Resolve data dir
  if (!config.dataDir) {
    config.dataDir = dataDir;
  }

  // Detect if setup is needed (no bot token means we can't run)
  const needsSetup = !config.botToken;

  return {
    config,
    showHelp: cli.showHelp,
    showVersion: cli.showVersion,
    needsSetup,
  };
}
