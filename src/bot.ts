import { Bot } from "grammy";
import { authMiddleware } from "./auth.js";
import { registerCommands } from "./commands/index.js";

export function createBot(token: string): Bot {
  const bot = new Bot(token);

  bot.use(authMiddleware);
  registerCommands(bot);

  bot.catch((err) => {
    const e = err.error;
    console.error("Bot error:", e instanceof Error ? e.message : String(e));
  });

  return bot;
}
