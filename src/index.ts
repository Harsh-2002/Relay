import { initClient, shutdownServer } from "./client.js";
import { createBot } from "./bot.js";

async function main() {
  const botToken = process.env.BOT_TOKEN;
  if (!botToken) {
    console.error("BOT_TOKEN environment variable is required.");
    process.exit(1);
  }

  console.log("Initializing OpenCode client...");
  await initClient();
  console.log("OpenCode client ready.");

  const bot = createBot(botToken);

  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    bot.stop();
    shutdownServer();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    bot.stop();
    shutdownServer();
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
