import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { parseArgs } from "util";
import type { RelayConfig } from "./schema.js";
import { CONFIG_DEFAULTS } from "./schema.js";
import { configLogger } from "../utils/logger.js";

const CONFIG_FILENAME = "config.json";

/** Resolve the data directory (bootstrap — no config dependency). */
function resolveDataDir(cliDataDir?: string): string {
  return cliDataDir || process.env.RELAY_DATA_DIR || join(process.cwd(), ".relay");
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
        "claude-model": { type: "string" },
        "claude-permission-mode": { type: "string" },
        "claude-cwd": { type: "string" },
        "codex-model": { type: "string" },
        "codex-cwd": { type: "string" },
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
    if (values["claude-model"]) flags.claudeModel = values["claude-model"] as string;
    if (values["claude-permission-mode"]) flags.claudePermissionMode = values["claude-permission-mode"] as string;
    if (values["claude-cwd"]) flags.claudeCwd = values["claude-cwd"] as string;
    if (values["codex-model"]) flags.codexModel = values["codex-model"] as string;
    if (values["codex-cwd"]) flags.codexCwd = values["codex-cwd"] as string;
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
    configLogger.warn({ filePath }, "Failed to parse config file, using defaults");
    return {};
  }
}

/** Map old env vars to config fields for backward compatibility. */
function readEnvFallback(): Partial<RelayConfig> {
  const env: Partial<RelayConfig> = {};

  if (process.env.BOT_TOKEN) env.botToken = process.env.BOT_TOKEN;
  if (process.env.ALLOWED_USER_ID) env.allowedUserId = Number(process.env.ALLOWED_USER_ID);
  if (process.env.PROVIDER) env.provider = process.env.PROVIDER.toLowerCase() as RelayConfig["provider"];
  if (process.env.BOT_MODE) env.botMode = process.env.BOT_MODE.toLowerCase() as RelayConfig["botMode"];
  if (process.env.WEBHOOK_URL) env.webhookUrl = process.env.WEBHOOK_URL;
  if (process.env.WEBHOOK_PORT) env.webhookPort = Number(process.env.WEBHOOK_PORT);
  if (process.env.WEBHOOK_SECRET) env.webhookSecret = process.env.WEBHOOK_SECRET;

  if (process.env.OPENCODE_MODE) env.opencodeMode = process.env.OPENCODE_MODE as RelayConfig["opencodeMode"];
  if (process.env.OPENCODE_URL) env.opencodeUrl = process.env.OPENCODE_URL;
  if (process.env.OPENCODE_HOSTNAME) env.opencodeHostname = process.env.OPENCODE_HOSTNAME;
  if (process.env.OPENCODE_PORT) env.opencodePort = Number(process.env.OPENCODE_PORT);
  if (process.env.OPENCODE_MODEL) env.opencodeModel = process.env.OPENCODE_MODEL;

  if (process.env.CLAUDE_MODEL) env.claudeModel = process.env.CLAUDE_MODEL;
  if (process.env.CLAUDE_PERMISSION_MODE) env.claudePermissionMode = process.env.CLAUDE_PERMISSION_MODE;
  if (process.env.CLAUDE_CWD) env.claudeCwd = process.env.CLAUDE_CWD;

  if (process.env.CODEX_MODEL) env.codexModel = process.env.CODEX_MODEL;
  if (process.env.CODEX_CWD) env.codexCwd = process.env.CODEX_CWD;

  if (process.env.STT_PROVIDER) env.sttProvider = process.env.STT_PROVIDER as RelayConfig["sttProvider"];
  if (process.env.GROQ_API_KEY) env.groqApiKey = process.env.GROQ_API_KEY;
  if (process.env.OPENAI_API_KEY) env.openaiSttApiKey = process.env.OPENAI_API_KEY;
  if (process.env.ASSEMBLYAI_API_KEY) env.assemblyaiApiKey = process.env.ASSEMBLYAI_API_KEY;
  if (process.env.GROQ_STT_MODEL) env.groqSttModel = process.env.GROQ_STT_MODEL;
  if (process.env.OPENAI_STT_MODEL) env.openaiSttModel = process.env.OPENAI_STT_MODEL;

  if (process.env.STREAMING_ENABLED) env.streamingEnabled = process.env.STREAMING_ENABLED === "true";
  if (process.env.STREAM_EDIT_INTERVAL_MS) env.streamEditIntervalMs = Number(process.env.STREAM_EDIT_INTERVAL_MS);
  if (process.env.PROMPT_TIMEOUT_MS) env.promptTimeoutMs = Number(process.env.PROMPT_TIMEOUT_MS);
  if (process.env.LOG_LEVEL) env.logLevel = process.env.LOG_LEVEL;
  if (process.env.RELAY_DATA_DIR) env.dataDir = process.env.RELAY_DATA_DIR;
  if (process.env.SYSTEM_PROMPT_FILE) env.systemPromptFile = process.env.SYSTEM_PROMPT_FILE;

  return env;
}

export interface LoadResult {
  config: RelayConfig;
  showHelp: boolean;
  showVersion: boolean;
  needsSetup: boolean;
}

/**
 * Load config with resolution order: CLI args > config file > env vars > defaults.
 */
export function loadConfig(): LoadResult {
  const cli = parseCli();
  const dataDir = resolveDataDir(cli.flags.dataDir);
  const fileConfig = readConfigFile(dataDir);
  const envConfig = readEnvFallback();

  // Merge: CLI > file > env > defaults
  const config: RelayConfig = { ...CONFIG_DEFAULTS };

  // Apply env fallback first
  for (const [key, value] of Object.entries(envConfig)) {
    if (value !== undefined && value !== "") {
      (config as any)[key] = value;
    }
  }

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

  // Detect if setup is needed (no config file and no bot token from any source)
  const hasConfigFile = Object.keys(fileConfig).length > 0;
  const needsSetup = !hasConfigFile && !config.botToken;

  if (Object.keys(envConfig).length > 0 && !hasConfigFile) {
    console.warn("\n  Note: Using environment variables for config. Run 'relay onboard' to create a config file.\n");
  }

  return {
    config,
    showHelp: cli.showHelp,
    showVersion: cli.showVersion,
    needsSetup,
  };
}
