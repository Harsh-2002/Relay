import { existsSync, mkdirSync, writeFileSync, renameSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";
import * as p from "@clack/prompts";
import type { RelayConfig } from "./schema.js";
import { CONFIG_DEFAULTS } from "./schema.js";
import { homedir } from "os";
import {
  ensurePlaywrightMcp, removePlaywrightMcp,
  ensureFetchMcp, removeFetchMcp,
  ensureMemoryMcp, removeMemoryMcp,
  ensureFilesystemMcp, removeFilesystemMcp,
} from "../utils/opencode-config.js";

function handleCancel(value: unknown): void {
  if (p.isCancel(value)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }
}

/** Run a shell command and return trimmed stdout, or null on failure */
function checkCommand(cmd: string): string | null {
  try {
    return execSync(cmd, { timeout: 5000, stdio: ["pipe", "pipe", "pipe"] }).toString().trim();
  } catch {
    return null;
  }
}

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

const isWindows = process.platform === "win32";

const RELAY_BANNER = `
    ____       __
   / __ \\___  / /___ ___  __
  / /_/ / _ \\/ / __ \`/ / / /
 / _, _/  __/ / /_/ / /_/ /
/_/ |_|\\___/_/\\__,_/\\__, /
                   /____/
`;

export async function runSetupWizard(dataDir: string, existing?: RelayConfig): Promise<RelayConfig> {
  const isUpdate = !!(existing?.botToken);
  const config: RelayConfig = existing ? { ...existing } : { ...CONFIG_DEFAULTS, dataDir };

  console.log(RELAY_BANNER);
  p.intro("Your AI coding agent, always on — always in Telegram.");

  if (isUpdate) {
    p.log.info("Update mode — press Enter to keep existing values.");
  }

  const s = p.spinner();

  // ── Step 1: OpenCode ──
  p.log.step("Step 1/5 — OpenCode");

  const opencodeVersion = checkCommand("opencode --version");

  if (opencodeVersion) {
    p.log.success(`OpenCode found — v${opencodeVersion}`);
  } else {
    p.log.warn("OpenCode not found in PATH.");
    p.note(
      "Relay requires OpenCode as its AI backend.\n" +
      "Install it with:\n\n" +
      "  npm i -g opencode-ai@latest",
      "Install OpenCode"
    );

    const installChoice = await p.select({
      message: "How would you like to proceed?",
      options: [
        { value: "npm" as const, label: "Install now (npm)", hint: "npm i -g opencode-ai@latest" },
        { value: "skip" as const, label: "Skip — I'll install it manually" },
      ],
    });
    handleCancel(installChoice);

    if (installChoice === "npm") {
      s.start("Installing OpenCode via npm...");
      try {
        execSync("npm i -g opencode-ai@latest", { timeout: 120_000, stdio: ["pipe", "pipe", "pipe"] });
        const ver = checkCommand("opencode --version");
        s.stop(ver ? `OpenCode installed — v${ver}` : "OpenCode installed.");
      } catch (err: any) {
        s.stop("Installation failed.");
        const msg = err?.message ?? "";
        if (msg.includes("EACCES") || msg.includes("EPERM")) {
          p.log.error(isWindows
            ? "Permission denied — try running the terminal as Administrator"
            : "Permission denied — try: sudo npm i -g opencode-ai@latest");
        } else {
          p.log.error(`Error: ${msg || "Unknown error"}`);
        }
        p.log.info("You can install it manually after setup and run 'relay' to start.");
      }
    } else {
      p.log.info("Install OpenCode before running Relay.");
    }
  }

  // ── Step 2: Bot Token ──
  p.log.step("Step 2/5 — Bot Token");

  if (!isUpdate) {
    p.note(
      "1. Open @BotFather → https://t.me/BotFather\n" +
      "2. Send /newbot, follow the prompts\n" +
      "3. Copy the token",
      "Setup"
    );
  } else {
    p.log.info(`Current: ${maskSecret(config.botToken)}`);
  }

  let botToken = config.botToken;
  let tokenValidated = false;
  while (!tokenValidated) {
    const entered = await p.text({
      message: "Bot token:",
      placeholder: isUpdate ? "Press Enter to keep existing" : "123456:ABC-DEF...",
      validate: (v = "") => {
        if (isUpdate && v.trim() === "") return undefined;
        return v.trim().length > 0 ? undefined : "Bot token is required";
      },
    });
    handleCancel(entered);

    const value = (entered as string).trim();
    if (isUpdate && value === "") {
      p.log.success("Kept existing bot token.");
      tokenValidated = true;
    } else {
      s.start("Validating bot token...");
      const tokenResult = await validateBotToken(value);
      if (tokenResult.valid) {
        s.stop(`Bot verified — ${tokenResult.botName}`);
        botToken = value;
        tokenValidated = true;
      } else {
        s.stop(tokenResult.error!);
        p.log.error(tokenResult.error!);
      }
    }
  }
  config.botToken = botToken;

  // ── Step 3: User ID ──
  p.log.step("Step 3/5 — Telegram User ID");

  if (!isUpdate) {
    p.note(
      "1. Open @userinfobot → https://t.me/userinfobot\n" +
      "2. Send any message\n" +
      "3. Copy your numeric ID",
      "Setup"
    );
  } else {
    p.log.info(`Current: ${config.allowedUserId}`);
  }

  const allowedUserIdStr = await p.text({
    message: "User ID:",
    placeholder: isUpdate ? "Press Enter to keep existing" : "Your numeric Telegram user ID",
    validate: (v = "") => {
      if (isUpdate && v.trim() === "") return undefined;
      const n = Number(v.trim());
      if (isNaN(n) || !Number.isInteger(n) || n <= 0) return "Must be a positive integer";
      if (n >= 10_000_000_000) return "User ID seems too large — check the value";
      return undefined;
    },
  });
  handleCancel(allowedUserIdStr);

  const parsedUserId = (allowedUserIdStr as string).trim();
  const allowedUserId = parsedUserId === "" ? config.allowedUserId : Number(parsedUserId);
  const userIdChanged = allowedUserId !== config.allowedUserId;
  config.allowedUserId = allowedUserId;

  if (userIdChanged || !isUpdate) {
    s.start("Verifying user ID...");
    const userResult = await validateUserId(config.botToken, allowedUserId);
    if (userResult.valid) {
      s.stop(`User verified — ${userResult.name}`);
    } else {
      s.stop(`${userResult.error}. Saved anyway.`);
      p.log.warn(`${userResult.error}. Saved anyway.`);
    }
  } else {
    p.log.success("Kept existing user ID.");
  }

  // ── Step 4: MCP Tools ──
  p.log.step("Step 4/5 — MCP Tools");

  if (!isUpdate) {
    p.note(
      "MCP tools extend the AI with extra capabilities.\n" +
      "Each runs as a local process managed by OpenCode.",
      "Info"
    );
  } else {
    const mcpStatus = [
      `Browser ${config.browserEnabled ? "✓" : "✗"}`,
      `Fetch ${config.fetchEnabled ? "✓" : "✗"}`,
      `Memory ${config.memoryEnabled ? "✓" : "✗"}`,
      `Filesystem ${config.filesystemEnabled ? "✓" : "✗"}`,
    ].join(", ");
    p.log.info(`Current: ${mcpStatus}`);
  }

  const currentMcps: string[] = [];
  if (config.browserEnabled) currentMcps.push("browser");
  if (config.fetchEnabled) currentMcps.push("fetch");
  if (config.memoryEnabled) currentMcps.push("memory");
  if (config.filesystemEnabled) currentMcps.push("filesystem");

  const selectedMcps = await p.multiselect({
    message: "Enable MCP tools (Space to toggle, Enter to confirm):",
    options: [
      { value: "browser", label: "Browser (Playwright)", hint: "Navigate URLs, scrape pages, take screenshots" },
      { value: "fetch", label: "Fetch", hint: "Read web pages as markdown" },
      { value: "memory", label: "Memory", hint: "Persistent knowledge graph across sessions" },
      { value: "filesystem", label: "Filesystem", hint: "Read/write files outside the project" },
    ],
    initialValues: currentMcps,
    required: false,
  });
  handleCancel(selectedMcps);

  const mcps = selectedMcps as string[];
  config.browserEnabled = mcps.includes("browser");
  config.fetchEnabled = mcps.includes("fetch");
  config.memoryEnabled = mcps.includes("memory");
  config.filesystemEnabled = mcps.includes("filesystem");

  // Fetch requires uvx (Python) — check and offer install
  if (config.fetchEnabled) {
    const hasUvx = checkCommand("uvx --version");
    if (!hasUvx) {
      const uvInstallCmd = isWindows
        ? "powershell -ExecutionPolicy ByPass -c \"irm https://astral.sh/uv/install.ps1 | iex\""
        : "curl -LsSf https://astral.sh/uv/install.sh | sh";
      const uvManualHint = isWindows
        ? "irm https://astral.sh/uv/install.ps1 | iex"
        : "curl -LsSf https://astral.sh/uv/install.sh | sh";

      p.log.warn("Fetch MCP requires uvx (Python package runner).");
      const uvxChoice = await p.select({
        message: "Install uv/uvx now?",
        options: [
          { value: "install" as const, label: "Install now", hint: uvManualHint },
          { value: "skip" as const, label: "Skip — I'll install it manually" },
        ],
      });
      handleCancel(uvxChoice);

      if (uvxChoice === "install") {
        s.start("Installing uv/uvx...");
        try {
          execSync(uvInstallCmd, { timeout: 60_000, stdio: ["pipe", "pipe", "pipe"] });
          s.stop("uv/uvx installed.");
        } catch {
          s.stop("Installation failed.");
          p.log.error(`Install manually: ${uvManualHint}`);
        }
      } else {
        p.note(
          "Install uv before starting Relay:\n\n" +
          `  ${uvManualHint}`,
          "Fetch MCP dependency"
        );
      }
    }
  }

  // Filesystem needs allowed paths
  if (config.filesystemEnabled) {
    const existingPaths = config.filesystemPaths?.length
      ? config.filesystemPaths.join(", ")
      : "";

    const pathsInput = await p.text({
      message: "Allowed directories (comma-separated):",
      placeholder: isWindows ? "~/Documents, ~/Downloads" : "~/Documents, ~/Downloads, /tmp",
      initialValue: existingPaths,
      validate: (v = "") => {
        if (v.trim().length === 0) return "At least one directory path is required";
        return undefined;
      },
    });
    handleCancel(pathsInput);

    config.filesystemPaths = (pathsInput as string)
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => p.startsWith("~") ? p.replace("~", homedir()) : p);
  }

  // Ensure/remove each MCP in OpenCode config
  const mcpActions: Array<{ name: string; enabled: boolean; ensure: () => void; remove: () => void }> = [
    { name: "Playwright", enabled: config.browserEnabled, ensure: ensurePlaywrightMcp, remove: removePlaywrightMcp },
    { name: "Fetch", enabled: config.fetchEnabled, ensure: ensureFetchMcp, remove: removeFetchMcp },
    { name: "Memory", enabled: config.memoryEnabled, ensure: () => ensureMemoryMcp(dataDir), remove: removeMemoryMcp },
    {
      name: "Filesystem",
      enabled: config.filesystemEnabled && config.filesystemPaths.length > 0,
      ensure: () => ensureFilesystemMcp(config.filesystemPaths),
      remove: removeFilesystemMcp,
    },
  ];

  for (const mcp of mcpActions) {
    try {
      if (mcp.enabled) {
        mcp.ensure();
      } else {
        mcp.remove();
      }
    } catch {
      // Will be configured on startup
    }
  }

  const enabledNames = mcpActions.filter((m) => m.enabled).map((m) => m.name);
  if (enabledNames.length > 0) {
    p.log.success(`MCP tools configured: ${enabledNames.join(", ")}`);
  } else {
    p.log.info("No MCP tools enabled.");
  }

  // ── Step 5: Voice Transcription ──
  p.log.step("Step 5/5 — Voice Transcription");

  const hasStt = isUpdate && config.sttProvider && config.sttProvider !== "auto";
  if (hasStt) {
    const activeKey = getSttKeyForProvider(config, config.sttProvider);
    const keyDisplay = activeKey ? ` — key: ${maskSecret(activeKey)}` : "";
    p.log.info(`Current: ${STT_PROVIDER_LABELS[config.sttProvider] || config.sttProvider}${keyDisplay}`);

    const sttAction = await p.select({
      message: "Voice transcription:",
      options: [
        { value: "keep" as const, label: "Keep current configuration" },
        { value: "replace" as const, label: "Add or replace provider" },
        { value: "disable" as const, label: "Disable STT" },
      ],
    });
    handleCancel(sttAction);

    if (sttAction === "replace") {
      await promptSttProvider(config);
    } else if (sttAction === "disable") {
      config.sttProvider = "auto";
      p.log.success("STT disabled.");
    } else {
      p.log.success("Kept current STT configuration.");
    }
  } else {
    if (!isUpdate) {
      p.log.info("Send voice messages to the AI. Requires an API key.");
    }

    const configureStt = await p.confirm({
      message: "Configure voice transcription (STT)?",
      initialValue: false,
    });
    handleCancel(configureStt);

    if (configureStt) {
      await promptSttProvider(config);
    }
  }

  // ── Done ──
  saveConfig(config, dataDir);
  p.outro(`Config saved to ${join(dataDir, "config.json")} — run 'relay' to start.`);

  return config;
}

async function promptSttProvider(config: RelayConfig): Promise<void> {
  const sttProvider = await p.select({
    message: "Which STT provider?",
    options: [
      { value: "groq" as const, label: "Groq (fastest, free tier available)" },
      { value: "openai" as const, label: "OpenAI (reliable, paid)" },
      { value: "assemblyai" as const, label: "AssemblyAI (accurate, free tier)" },
      { value: "sarvam" as const, label: "Sarvam AI (transcription, multilingual)" },
      { value: "sarvam-translate" as const, label: "Sarvam AI (translate to English)" },
    ],
  });
  handleCancel(sttProvider);

  const validationProvider = sttProvider === "sarvam-translate" ? "sarvam" as const : sttProvider as "groq" | "openai" | "assemblyai" | "sarvam";

  const s = p.spinner();
  let validated = false;
  while (!validated) {
    const apiKey = await p.text({
      message: `${STT_PROVIDER_LABELS[sttProvider as string]} API key:`,
      validate: (v = "") => (v.trim().length > 0 ? undefined : "API key is required"),
    });
    handleCancel(apiKey);

    const key = (apiKey as string).trim();
    s.start("Validating API key...");
    const result = await validateSttApiKey(validationProvider, key);

    if (result.valid) {
      s.stop("API key validated.");
      config.sttProvider = sttProvider as RelayConfig["sttProvider"];
      if (sttProvider === "groq") config.groqApiKey = key;
      else if (sttProvider === "openai") config.openaiSttApiKey = key;
      else if (sttProvider === "sarvam" || sttProvider === "sarvam-translate") config.sarvamApiKey = key;
      else config.assemblyaiApiKey = key;
      validated = true;
    } else {
      s.stop(result.error!);
      p.log.error(result.error!);
    }
  }
}

export function saveConfig(config: RelayConfig, dataDir: string): void {
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  }

  // Strip default values for a cleaner config file
  const toSave: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (key === "dataDir") continue; // Don't persist dataDir — it's derived
    const defaultVal = (CONFIG_DEFAULTS as any)[key];
    // Save if value differs from default (deep-compare arrays)
    if (Array.isArray(value) ? JSON.stringify(value) !== JSON.stringify(defaultVal) : value !== defaultVal) {
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
