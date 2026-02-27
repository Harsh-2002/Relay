import type { Bot } from "grammy";
import { registerSessionCommands } from "./session.js";
import { registerFileCommands } from "./files.js";
import { registerShellCommands } from "./shell.js";
import { registerAdminCommands } from "./admin.js";
import { registerHistoryCommands } from "./history.js";
import { registerMediaHandlers } from "./media.js";
import { registerChat } from "./chat.js";

export function registerCommands(bot: Bot): void {
  registerAdminCommands(bot);
  registerSessionCommands(bot);
  registerFileCommands(bot);
  registerShellCommands(bot);
  registerHistoryCommands(bot);
  registerMediaHandlers(bot);
  registerChat(bot);
}
