import { join } from "path";
import { homedir } from "os";
import { getConfig } from "./config/index.js";
import { initProvider, shutdownProvider, getProviderName } from "./providers/index.js";
import { createBot } from "./bot.js";
import { getBotCommands } from "./commands/index.js";
import { initAuth } from "./auth.js";
import { startUploadCleanup, stopUploadCleanup } from "./utils/media.js";
import { startCronScheduler, stopCronScheduler } from "./cron.js";
import { unwatchSystemPrompt } from "./utils/system-prompt.js";
import { startLifecycleMonitor, stopLifecycleMonitor } from "./lifecycle.js";
import { ensurePlaywrightMcp, ensureFetchMcp, ensureMemoryMcp, ensureFilesystemMcp, ensureRelayMcp } from "./utils/opencode-config.js";
import { startRelayApi, stopRelayApi } from "./relay-api.js";
import { setDataDir } from "./utils/store.js";
import logger from "./utils/logger.js";

function die(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

async function main() {
  const config = getConfig();
  if (config.dataDir) setDataDir(config.dataDir);

  if (!config.botToken) {
    die("Bot token is required. Run 'relay onboard' to configure.");
  }

  if (!initAuth(config.allowedUserId)) {
    die("Allowed user ID is required (must be a valid Telegram user ID). Run 'relay onboard' to configure.");
  }

  // Configure MCP tools in OpenCode before starting the server
  const mcpSetup: Array<{ name: string; enabled: boolean; setup: () => void }> = [
    { name: "Playwright", enabled: config.browserEnabled, setup: ensurePlaywrightMcp },
    { name: "Fetch", enabled: config.fetchEnabled, setup: ensureFetchMcp },
    { name: "Memory", enabled: config.memoryEnabled, setup: () => ensureMemoryMcp(config.dataDir || join(homedir(), ".relay")) },
    {
      name: "Filesystem",
      enabled: config.filesystemEnabled && config.filesystemPaths.length > 0,
      setup: () => ensureFilesystemMcp(config.filesystemPaths),
    },
  ];

  for (const mcp of mcpSetup) {
    if (mcp.enabled) {
      try {
        mcp.setup();
        logger.info(`${mcp.name} MCP configured in OpenCode config`);
      } catch (err: any) {
        logger.info({ err: err?.message }, `Failed to write ${mcp.name} MCP config`);
      }
    }
  }

  const providerName = getProviderName();
  try {
    await initProvider();
  } catch (err: any) {
    die(err?.message ?? `Failed to initialize provider "${providerName}".`);
  }
  logger.info({ provider: providerName }, "Provider ready");

  // Clean up old uploads every 30 minutes
  startUploadCleanup();

  const bot = createBot(config.botToken);

  // Register commands with Telegram for autocomplete menu
  await bot.api.setMyCommands(getBotCommands());

  // Start Relay MCP (internal API + register in OpenCode)
  if (config.relayMcpEnabled !== false) {
    try {
      const { port, token } = await startRelayApi(bot.api, config.allowedUserId, config.relayMcpPort);
      ensureRelayMcp(port, token);
      logger.info({ port }, "Relay MCP configured in OpenCode config");
    } catch (err: any) {
      logger.info({ err: err?.message }, "Failed to start Relay MCP API");
    }
  }

  const botMode = config.botMode;
  let httpServer: import("http").Server | null = null;
  let shuttingDown = false;

  async function gracefulShutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutting down...");
    if (httpServer) {
      httpServer.close();
      try { await bot.api.deleteWebhook(); } catch {}
    } else {
      bot.stop();
    }
    stopRelayApi();
    stopLifecycleMonitor();
    shutdownProvider();
    stopCronScheduler();
    stopUploadCleanup();
    unwatchSystemPrompt();
    process.exit(0);
  }

  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  // Windows: SIGTERM doesn't fire. Use 'message' from pm2 for graceful shutdown.
  if (process.platform === "win32") {
    process.on("message", (msg) => {
      if (msg === "shutdown") gracefulShutdown("shutdown");
    });
  }

  if (botMode === "webhook") {
    if (!config.webhookUrl) {
      die("webhookUrl is required when botMode=webhook. Run 'relay onboard' to configure.");
    }

    const { createServer } = await import("http");
    const { webhookCallback } = await import("grammy");

    await bot.api.setWebhook(config.webhookUrl, {
      ...(config.webhookSecret && { secret_token: config.webhookSecret }),
    });

    const handler = webhookCallback(bot, "http", {
      ...(config.webhookSecret && { secretToken: config.webhookSecret }),
    });

    httpServer = createServer(handler);
    httpServer.listen(config.webhookPort, () => {
      logger.info({ port: config.webhookPort, url: config.webhookUrl }, "Webhook server listening");
      startCronScheduler(bot.api, config.allowedUserId);
      startLifecycleMonitor();
    });
  } else {
    // Clear any stale webhook before starting long-polling
    try { await bot.api.deleteWebhook(); } catch {}

    logger.info("Starting Telegram bot (long polling)...");
    await bot.start({
      onStart: (info) => {
        logger.info({ username: info.username }, "Bot is running");
        startCronScheduler(bot.api, config.allowedUserId);
        startLifecycleMonitor();
      },
    });
  }
}

main().catch((err) => {
  console.error(`\n  Fatal: ${err?.message ?? err}\n`);
  process.exit(1);
});
