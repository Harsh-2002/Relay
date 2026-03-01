import { existsSync, mkdirSync, writeFileSync, renameSync } from "fs";
import { join } from "path";
import type { RelayConfig } from "./schema.js";
import { CONFIG_DEFAULTS } from "./schema.js";

async function validateSttApiKey(
  provider: "groq" | "openai" | "assemblyai" | "sarvam",
  key: string,
): Promise<{ valid: boolean; error?: string }> {
  const endpoints: Record<string, { url: string; method: string; headers: Record<string, string> }> = {
    groq: {
      url: "https://api.groq.com/openai/v1/models",
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
    },
    openai: {
      url: "https://api.openai.com/v1/models",
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
    },
    assemblyai: {
      url: "https://api.assemblyai.com/v2/transcript?limit=1",
      method: "GET",
      headers: { authorization: key },
    },
    sarvam: {
      url: "https://api.sarvam.ai/speech-to-text",
      method: "POST",
      headers: { "api-subscription-key": key, "Content-Type": "application/json" },
    },
  };

  const { url, method, headers } = endpoints[provider];
  try {
    const res = await fetch(url, {
      method,
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return { valid: true };
    if (provider === "sarvam" && (res.status === 400 || res.status === 422)) {
      return { valid: true };
    }
    if (res.status === 401 || res.status === 403) {
      return { valid: false, error: "Invalid API key (authentication failed)" };
    }
    return { valid: false, error: `Unexpected response: ${res.status} ${res.statusText}` };
  } catch (err: any) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return { valid: false, error: "Request timed out — check your network connection" };
    }
    return { valid: false, error: `Connection error: ${err.message}` };
  }
}

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

  // 3. Provider settings (OpenCode)
  const config: RelayConfig = {
    ...CONFIG_DEFAULTS,
    botToken,
    allowedUserId,
    dataDir,
  };

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

  // 5. STT (optional)
  const configureStt = await confirm({
    message: "Configure voice transcription (STT)?",
    default: false,
  });

  if (configureStt) {
    const sttProvider = await select({
      message: "Which STT provider?",
      choices: [
        { value: "groq" as const, name: "Groq (fastest, recommended)" },
        { value: "openai" as const, name: "OpenAI" },
        { value: "assemblyai" as const, name: "AssemblyAI" },
        { value: "sarvam" as const, name: "Sarvam AI (Transcribe)" },
        { value: "sarvam-translate" as const, name: "Sarvam AI (Translate to English)" },
      ],
    });

    const providerLabels: Record<string, string> = {
      groq: "Groq",
      openai: "OpenAI",
      assemblyai: "AssemblyAI",
      sarvam: "Sarvam AI",
      "sarvam-translate": "Sarvam AI",
    };
    const validationProvider = sttProvider === "sarvam-translate" ? "sarvam" as const : sttProvider;

    let validated = false;
    while (!validated) {
      const apiKey = await password({
        message: `${providerLabels[sttProvider]} API key:`,
        validate: (v) => (v.length > 0 ? true : "API key is required"),
      });

      console.log("  Validating API key...");
      const result = await validateSttApiKey(validationProvider, apiKey);

      if (result.valid) {
        config.sttProvider = sttProvider;
        if (sttProvider === "groq") config.groqApiKey = apiKey;
        else if (sttProvider === "openai") config.openaiSttApiKey = apiKey;
        else if (sttProvider === "sarvam" || sttProvider === "sarvam-translate") config.sarvamApiKey = apiKey;
        else config.assemblyaiApiKey = apiKey;
        console.log("  API key validated successfully.\n");
        validated = true;
      } else {
        console.log(`  Error: ${result.error}\n`);
      }
    }
  }

  // 6. Streaming
  config.streamingEnabled = await confirm({
    message: "Enable streaming responses?",
    default: false,
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
      if (key === "botToken" || key === "allowedUserId") {
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

  const filePath = join(dataDir, "config.json");
  const tmp = filePath + ".tmp";
  writeFileSync(tmp, JSON.stringify(toSave, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, filePath);
}
