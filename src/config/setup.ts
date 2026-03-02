import { existsSync, mkdirSync, writeFileSync, renameSync } from "fs";
import { join } from "path";
import type { RelayConfig } from "./schema.js";
import { CONFIG_DEFAULTS } from "./schema.js";
import { ensurePlaywrightMcp } from "../utils/opencode-config.js";

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

function maskSecret(value: string): string {
  if (value.length <= 6) return "****";
  return "****" + value.slice(-6);
}

function getSttKeyForProvider(config: RelayConfig, provider: string): string {
  if (provider === "groq") return config.groqApiKey;
  if (provider === "openai") return config.openaiSttApiKey;
  if (provider === "sarvam" || provider === "sarvam-translate") return config.sarvamApiKey;
  if (provider === "assemblyai") return config.assemblyaiApiKey;
  return "";
}

const STT_PROVIDER_LABELS: Record<string, string> = {
  groq: "Groq",
  openai: "OpenAI",
  assemblyai: "AssemblyAI",
  sarvam: "Sarvam AI",
  "sarvam-translate": "Sarvam AI (translate)",
  auto: "Auto",
};

const RELAY_BANNER = `
    ____       __
   / __ \\___  / /___ ___  __
  / /_/ / _ \\/ / __ \`/ / / /
 / _, _/  __/ / /_/ / /_/ /
/_/ |_|\\___/_/\\__,_/\\__, /
                   /____/
`;

const TOTAL_STEPS = 5;
const DIVIDER = "─".repeat(40);

function stepHeader(num: number, title: string): void {
  console.log(`\n  ${DIVIDER}`);
  console.log(`  [${num}/${TOTAL_STEPS}] ${title}`);
  console.log();
}

function hint(text: string): void {
  console.log(`  \x1b[2m${text}\x1b[0m`);
}

function ok(text: string): void {
  console.log(`  \x1b[32m✓\x1b[0m ${text}`);
}

function fail(text: string): void {
  console.log(`  \x1b[31m✗\x1b[0m ${text}`);
}

function warn(text: string): void {
  console.log(`  \x1b[33m⚠\x1b[0m ${text}`);
}

export async function runSetupWizard(dataDir: string, existing?: RelayConfig): Promise<RelayConfig> {
  const { input, select, confirm } = await import("@inquirer/prompts");

  const isUpdate = !!(existing?.botToken);
  const config: RelayConfig = existing ? { ...existing } : { ...CONFIG_DEFAULTS, dataDir };

  console.log(RELAY_BANNER);
  console.log("  Telegram bot for AI coding agents");
  console.log(`  ${DIVIDER}`);
  if (isUpdate) {
    hint("Update mode — press Enter to keep existing values.");
  }

  // ── Step 1: Bot Token ──
  stepHeader(1, "Bot Token");
  if (!isUpdate) {
    hint("Create a bot via @BotFather → https://t.me/BotFather");
    hint("Send /newbot, follow the prompts, copy the token.");
    console.log();
  } else {
    hint(`Current: ${maskSecret(config.botToken)}`);
    console.log();
  }

  let botToken = config.botToken;
  let tokenValidated = false;
  while (!tokenValidated) {
    const entered = (await input({
      message: "Bot token:",
      validate: (v) => {
        if (isUpdate && v.trim() === "") return true;
        return v.trim().length > 0 ? true : "Bot token is required";
      },
    })).trim();

    if (isUpdate && entered === "") {
      ok("Kept existing bot token.");
      tokenValidated = true;
    } else {
      hint("Validating...");
      const tokenResult = await validateBotToken(entered);
      if (tokenResult.valid) {
        botToken = entered;
        ok(`Bot verified — ${tokenResult.botName}`);
        tokenValidated = true;
      } else {
        fail(tokenResult.error!);
        console.log();
      }
    }
  }
  config.botToken = botToken;

  // ── Step 2: User ID ──
  stepHeader(2, "Telegram User ID");
  if (!isUpdate) {
    hint("Get your ID via @userinfobot → https://t.me/userinfobot");
    hint("Send any message — it replies with your numeric ID.");
    console.log();
  } else {
    hint(`Current: ${config.allowedUserId}`);
    console.log();
  }

  const allowedUserIdStr = (await input({
    message: "User ID:",
    validate: (v) => {
      if (isUpdate && v.trim() === "") return true;
      const n = Number(v.trim());
      if (isNaN(n) || !Number.isInteger(n) || n <= 0) return "Must be a positive integer";
      if (n >= 10_000_000_000) return "User ID seems too large — check the value";
      return true;
    },
  })).trim();

  const allowedUserId = allowedUserIdStr === "" ? config.allowedUserId : Number(allowedUserIdStr);
  const userIdChanged = allowedUserId !== config.allowedUserId;
  config.allowedUserId = allowedUserId;

  if (userIdChanged || !isUpdate) {
    hint("Verifying...");
    const userResult = await validateUserId(config.botToken, allowedUserId);
    if (userResult.valid) {
      ok(`User verified — ${userResult.name}`);
    } else {
      warn(`${userResult.error}. Saved anyway.`);
    }
  } else {
    ok("Kept existing user ID.");
  }

  // ── Step 3: OpenCode ──
  stepHeader(3, "OpenCode Connection");
  if (!isUpdate) {
    hint("\"Start\" spawns a local server. \"Connect\" uses an existing one.");
    console.log();
  } else {
    hint(`Current: ${config.opencodeMode === "start" ? "Start (local)" : "Connect (remote)"}`);
    console.log();
  }

  const opencodeMode = await select({
    message: "OpenCode mode:",
    default: config.opencodeMode,
    choices: [
      { value: "start" as const, name: "Start (spawn local server)" },
      { value: "connect" as const, name: "Connect (remote server)" },
    ],
  });
  config.opencodeMode = opencodeMode;

  if (opencodeMode === "connect") {
    const urlEntered = (await input({
      message: "OpenCode server URL:",
      default: config.opencodeUrl || "http://localhost:4096",
    })).trim();
    config.opencodeUrl = urlEntered;
  }

  // ── Step 4: Voice Transcription ──
  stepHeader(4, "Voice Transcription");

  const hasStt = isUpdate && config.sttProvider && config.sttProvider !== "auto";
  if (hasStt) {
    const activeKey = getSttKeyForProvider(config, config.sttProvider);
    const keyDisplay = activeKey ? ` — key: ${maskSecret(activeKey)}` : "";
    hint(`Current: ${STT_PROVIDER_LABELS[config.sttProvider] || config.sttProvider}${keyDisplay}`);
    console.log();

    const sttAction = await select({
      message: "Voice transcription:",
      choices: [
        { value: "keep" as const, name: "Keep current configuration" },
        { value: "replace" as const, name: "Add or replace provider" },
        { value: "disable" as const, name: "Disable STT" },
      ],
    });

    if (sttAction === "replace") {
      await promptSttProvider(input, select, config);
    } else if (sttAction === "disable") {
      config.sttProvider = "auto";
      ok("STT disabled.");
    } else {
      ok("Kept current STT configuration.");
    }
  } else {
    if (!isUpdate) {
      hint("Send voice messages to the AI. Requires an API key.");
      console.log();
    }

    const configureStt = await confirm({
      message: "Configure voice transcription (STT)?",
      default: false,
    });

    if (configureStt) {
      await promptSttProvider(input, select, config);
    }
  }

  // ── Step 5: Browser ──
  stepHeader(5, "Headless Browser");
  if (!isUpdate) {
    hint("Playwright MCP lets the AI navigate URLs, scrape pages,");
    hint("fill forms, and take screenshots via headless Chromium.");
    console.log();
  } else {
    hint(`Current: ${config.browserEnabled ? "Enabled" : "Disabled"}`);
    console.log();
  }

  const configureBrowser = await confirm({
    message: "Enable headless browser (Playwright MCP)?",
    default: config.browserEnabled,
  });

  if (configureBrowser) {
    config.browserEnabled = true;
    if (!isUpdate || !existing?.browserEnabled) {
      try {
        ensurePlaywrightMcp();
        ok("Playwright MCP written to OpenCode config.");
      } catch {
        ok("Playwright MCP will be configured on startup.");
      }
    }
  } else {
    config.browserEnabled = false;
  }

  // ── Done ──
  saveConfig(config, dataDir);

  console.log(`\n  ${DIVIDER}`);
  ok(`Config saved to ${join(dataDir, "config.json")}`);
  hint("Run 'relay' to start the bot.");
  console.log();

  return config;
}

async function promptSttProvider(
  input: typeof import("@inquirer/prompts")["input"],
  select: typeof import("@inquirer/prompts")["select"],
  config: RelayConfig,
): Promise<void> {
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

  const validationProvider = sttProvider === "sarvam-translate" ? "sarvam" as const : sttProvider;

  let validated = false;
  while (!validated) {
    const apiKey = (await input({
      message: `${STT_PROVIDER_LABELS[sttProvider]} API key:`,
      validate: (v) => (v.trim().length > 0 ? true : "API key is required"),
    })).trim();

    hint("Validating...");
    const result = await validateSttApiKey(validationProvider, apiKey);

    if (result.valid) {
      config.sttProvider = sttProvider;
      if (sttProvider === "groq") config.groqApiKey = apiKey;
      else if (sttProvider === "openai") config.openaiSttApiKey = apiKey;
      else if (sttProvider === "sarvam" || sttProvider === "sarvam-translate") config.sarvamApiKey = apiKey;
      else config.assemblyaiApiKey = apiKey;
      ok("API key validated.");
      validated = true;
    } else {
      fail(result.error!);
      console.log();
    }
  }
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
