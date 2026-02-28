import { initProvider, shutdownProvider, getProviderName } from "./providers/index.js";
import { createBot } from "./bot.js";
import { isAuthConfigured } from "./auth.js";
import { startUploadCleanup } from "./utils/media.js";

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

  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    bot.stop();
    shutdownProvider();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    bot.stop();
    shutdownProvider();
    process.exit(0);
  });

  console.log("Starting Telegram bot (long polling)...");
  await bot.start({
    onStart: (info) => console.log(`Bot @${info.username} is running!`),
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
