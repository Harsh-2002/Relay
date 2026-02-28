import { Bot } from "grammy";
import { authMiddleware } from "./auth.js";
import { registerCommands } from "./commands/index.js";
import { botLogger } from "./utils/logger.js";

export function createBot(token: string): Bot {
  const bot = new Bot(token);

  bot.use(authMiddleware);
  registerCommands(bot);

  bot.catch((err) => {
    const e = err.error;
    botLogger.error({ err: e instanceof Error ? e.message : String(e) }, "Bot error");
    err.ctx?.reply("Something went wrong. Please try again.").catch(() => {});
  });

  return bot;
}
