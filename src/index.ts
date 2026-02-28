import { initProvider, shutdownProvider, getProviderName } from "./providers/index.js";
import { createBot } from "./bot.js";
import { isAuthConfigured } from "./auth.js";
import { startUploadCleanup, stopUploadCleanup } from "./utils/media.js";
import { unwatchSystemPrompt } from "./utils/system-prompt.js";

async function main() {
  const botToken = process.env.BOT_TOKEN;
  if (!botToken) {
    console.error("BOT_TOKEN environment variable is required.");
    process.exit(1);
  }

  if (!isAuthConfigured()) {
    console.error("ALLOWED_USER_ID environment variable is required (must be a valid Telegram user ID).");
    process.exit(1);
  }

  const providerName = getProviderName();
  console.log(`Initializing ${providerName} provider...`);
  await initProvider();
  console.log(`${providerName} provider ready.`);

  // Clean up old uploads every 30 minutes
  startUploadCleanup();

  const bot = createBot(botToken);

  const botMode = (process.env.BOT_MODE ?? "polling").toLowerCase();
  let httpServer: import("http").Server | null = null;

  async function gracefulShutdown(signal: string) {
    console.log(`\n${signal} received. Shutting down...`);
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
    const webhookUrl = process.env.WEBHOOK_URL;
    if (!webhookUrl) {
      console.error("WEBHOOK_URL is required when BOT_MODE=webhook.");
      process.exit(1);
    }

    const webhookPort = Number(process.env.WEBHOOK_PORT ?? "3000");
    const webhookSecret = process.env.WEBHOOK_SECRET;

    const { createServer } = await import("http");
    const { webhookCallback } = await import("grammy");

    await bot.api.setWebhook(webhookUrl, {
      ...(webhookSecret && { secret_token: webhookSecret }),
    });

    const handler = webhookCallback(bot, "http", {
      ...(webhookSecret && { secretToken: webhookSecret }),
    });

    httpServer = createServer(handler);
    httpServer.listen(webhookPort, () => {
      console.log(`Webhook server listening on port ${webhookPort}`);
      console.log(`Webhook URL: ${webhookUrl}`);
    });
  } else {
    // Clear any stale webhook before starting long-polling
    try { await bot.api.deleteWebhook(); } catch {}

    console.log("Starting Telegram bot (long polling)...");
    await bot.start({
      onStart: (info) => console.log(`Bot @${info.username} is running!`),
    });
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
