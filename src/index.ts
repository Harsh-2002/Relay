import { getConfig } from "./config/index.js";
import { initProvider, shutdownProvider, getProviderName } from "./providers/index.js";
import { createBot } from "./bot.js";
import { initAuth } from "./auth.js";
import { startUploadCleanup, stopUploadCleanup } from "./utils/media.js";
import { unwatchSystemPrompt } from "./utils/system-prompt.js";
import logger from "./utils/logger.js";

async function main() {
  const config = getConfig();

  if (!config.botToken) {
    logger.fatal("BOT_TOKEN is required. Run 'relay onboard' to configure.");
    process.exit(1);
  }

  if (!initAuth(config.allowedUserId)) {
    logger.fatal("ALLOWED_USER_ID is required (must be a valid Telegram user ID). Run 'relay onboard' to configure.");
    process.exit(1);
  }

  const providerName = getProviderName();
  logger.info({ provider: providerName }, "Initializing provider...");
  await initProvider();
  logger.info({ provider: providerName }, "Provider ready");

  // Clean up old uploads every 30 minutes
  startUploadCleanup();

  const bot = createBot(config.botToken);

  const botMode = config.botMode;
  let httpServer: import("http").Server | null = null;

  async function gracefulShutdown(signal: string) {
    logger.info({ signal }, "Shutting down...");
    if (httpServer) {
      httpServer.close();
      try { await bot.api.deleteWebhook(); } catch {}
    } else {
      bot.stop();
    }
    shutdownProvider();
    stopUploadCleanup();
    unwatchSystemPrompt();
    process.exit(0);
  }

  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

  if (botMode === "webhook") {
    if (!config.webhookUrl) {
      logger.fatal("webhookUrl is required when botMode=webhook. Run 'relay onboard' to configure.");
      process.exit(1);
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
    });
  } else {
    // Clear any stale webhook before starting long-polling
    try { await bot.api.deleteWebhook(); } catch {}

    logger.info("Starting Telegram bot (long polling)...");
    await bot.start({
      onStart: (info) => logger.info({ username: info.username }, "Bot is running"),
    });
  }
}

main().catch((err) => {
  logger.fatal({ err }, "Fatal error");
  process.exit(1);
});
