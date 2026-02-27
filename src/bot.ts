import { Bot } from "grammy";
import { authMiddleware } from "./auth.js";
import { registerCommands } from "./commands/index.js";

export function createBot(token: string): Bot {
  const bot = new Bot(token);

  bot.use(authMiddleware);
  registerCommands(bot);

  bot.catch((err) => {
    console.error("Bot error:", err.message);
  });

  return bot;
}
