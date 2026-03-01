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

async function validateBotToken(
  token: string,
): Promise<{ valid: boolean; botName?: string; error?: string }> {
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
    return { valid: false, error: "Invalid format — token should look like 123456:ABC-DEF..." };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      return { valid: true, botName: `@${data.result.username}` };
    }
    if (res.status === 401 || res.status === 404) {
      return { valid: false, error: "Invalid bot token — check with @BotFather" };
    }
    return { valid: false, error: `Unexpected response: ${res.status} ${res.statusText}` };
  } catch (err: any) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return { valid: false, error: "Request timed out — check your network connection" };
    }
    return { valid: false, error: `Connection error: ${err.message}` };
  }
}

async function validateUserId(
  token: string,
  userId: number,
): Promise<{ valid: boolean; name?: string; error?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getChat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: userId }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      const r = data.result;
      const name = [r.first_name, r.last_name].filter(Boolean).join(" ") || String(userId);
      return { valid: true, name };
    }
    return { valid: false, error: "Chat not found — user may not have messaged the bot yet" };
  } catch (err: any) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return { valid: false, error: "Request timed out — check your network connection" };
    }
    return { valid: false, error: `Connection error: ${err.message}` };
  }
}

export async function runSetupWizard(dataDir: string): Promise<RelayConfig> {
  const { input, select, confirm } = await import("@inquirer/prompts");

  console.log("\n  Relay Setup\n");
  console.log("  Configure your Telegram bot for AI coding agents.\n");

  // Step 1: Bot token
  console.log("  Step 1: Bot Token\n");
  console.log("  Create a bot on Telegram:");
  console.log("  1. Open @BotFather → https://t.me/BotFather");
  console.log("  2. Send /newbot and follow the prompts");
  console.log("  3. Copy the token it gives you\n");

  let botToken = "";
  let tokenValidated = false;
  while (!tokenValidated) {
    botToken = (await input({
      message: "Telegram bot token:",
      validate: (v) => (v.trim().length > 0 ? true : "Bot token is required"),
    })).trim();

    console.log("  Validating bot token...");
    const tokenResult = await validateBotToken(botToken);

    if (tokenResult.valid) {
      console.log(`  ✓ Bot verified — ${tokenResult.botName}\n`);
      tokenValidated = true;
    } else {
      console.log(`  ✗ ${tokenResult.error}\n`);
    }
  }

  // Step 2: User ID
  console.log("  Step 2: Your Telegram User ID\n");
  console.log("  Find your numeric user ID:");
  console.log("  1. Open @userinfobot → https://t.me/userinfobot");
  console.log("  2. Send any message — it replies with your ID\n");

  const allowedUserIdStr = (await input({
    message: "Your Telegram user ID:",
    validate: (v) => {
      const n = Number(v.trim());
      if (isNaN(n) || !Number.isInteger(n) || n <= 0) return "Must be a positive integer";
      if (n >= 10_000_000_000) return "User ID seems too large — check the value";
      return true;
    },
  })).trim();
  const allowedUserId = Number(allowedUserIdStr);

  console.log("  Verifying user ID...");
  const userResult = await validateUserId(botToken, allowedUserId);
  if (userResult.valid) {
    console.log(`  ✓ User verified — ${userResult.name}\n`);
  } else {
    console.log(`  ⚠ ${userResult.error}. Saved anyway.\n`);
  }

  // Step 3: OpenCode
  console.log("  Step 3: OpenCode Connection\n");
  console.log("  Choose how Relay connects to OpenCode (the AI backend).");
  console.log("  \"Start\" spawns a local server. \"Connect\" uses an existing one.\n");

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
    config.opencodeUrl = (await input({
      message: "OpenCode server URL:",
      default: "http://localhost:4096",
    })).trim();
  }

  // Step 4: STT (optional)
  console.log("\n  Step 4: Voice Transcription (Optional)\n");
  console.log("  Enable speech-to-text to send voice messages to the AI agent.");
  console.log("  Requires an API key from one of the supported providers.\n");

  const configureStt = await confirm({
    message: "Configure voice transcription (STT)?",
    default: false,
  });

  if (configureStt) {
    const sttProvider = await select({
      message: "Which STT provider?",
      choices: [
        { value: "groq" as const, name: "Groq (fastest, free tier available)" },
        { value: "openai" as const, name: "OpenAI (reliable, paid)" },
        { value: "assemblyai" as const, name: "AssemblyAI (accurate, free tier)" },
        { value: "sarvam" as const, name: "Sarvam AI (transcription, multilingual)" },
        { value: "sarvam-translate" as const, name: "Sarvam AI (translate to English)" },
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
      const apiKey = (await input({
        message: `${providerLabels[sttProvider]} API key:`,
        validate: (v) => (v.trim().length > 0 ? true : "API key is required"),
      })).trim();

      console.log("  Validating API key...");
      const result = await validateSttApiKey(validationProvider, apiKey);

      if (result.valid) {
        config.sttProvider = sttProvider;
        if (sttProvider === "groq") config.groqApiKey = apiKey;
        else if (sttProvider === "openai") config.openaiSttApiKey = apiKey;
        else if (sttProvider === "sarvam" || sttProvider === "sarvam-translate") config.sarvamApiKey = apiKey;
        else config.assemblyaiApiKey = apiKey;
        console.log("  ✓ API key validated successfully.\n");
        validated = true;
      } else {
        console.log(`  ✗ ${result.error}\n`);
      }
    }
  }

  // Step 5: Streaming
  console.log("\n  Step 5: Streaming\n");
  console.log("  When enabled, AI responses stream in real-time as they generate.");
  console.log("  When disabled, the full response is sent once it's complete.\n");

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
