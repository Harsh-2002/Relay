import type { Bot } from "grammy";
import { getProvider } from "../providers/index.js";
import { getOrCreateSession } from "../session.js";
import { chunkMessage } from "../utils/chunker.js";
import { formatCatchError } from "../utils/errors.js";
import { escapeHtml } from "../utils/html.js";

export function registerShellCommands(bot: Bot): void {
  bot.command("shell", async (ctx) => {
    const command = ctx.match?.trim();
    if (!command) {
      await ctx.reply("Usage: <code>/shell &lt;command&gt;</code>", { parse_mode: "HTML" });
      return;
    }

    try {
      await ctx.replyWithChatAction("typing");
      const sessionId = await getOrCreateSession();
      const provider = getProvider();

      const result = await provider.shell(sessionId, command);

      if (result === null) {
        await ctx.reply("Shell command returned no output.", { parse_mode: "HTML" });
        return;
      }

      const formatted = `<b>$ ${escapeHtml(command)}</b>\n\n<pre>${escapeHtml(result)}</pre>`;
      const chunks = chunkMessage(formatted);
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: "HTML" });
      }
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "running shell command"), { parse_mode: "HTML" });
    }
  });

  bot.command("cmd", async (ctx) => {
    const input = ctx.match?.trim();
    if (!input) {
      await ctx.reply("Usage: <code>/cmd &lt;command&gt; [arguments]</code>", { parse_mode: "HTML" });
      return;
    }

    const spaceIdx = input.indexOf(" ");
    const command = spaceIdx === -1 ? input : input.slice(0, spaceIdx);
    const args = spaceIdx === -1 ? "" : input.slice(spaceIdx + 1);

    try {
      await ctx.replyWithChatAction("typing");
      const sessionId = await getOrCreateSession();
      const provider = getProvider();

      const result = await provider.runCommand(sessionId, command, args);

      if (result === null) {
        await ctx.reply("Command returned no output.", { parse_mode: "HTML" });
        return;
      }

      const formatted = `<pre>${escapeHtml(result.text)}</pre>`;
      const chunks = chunkMessage(formatted);
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: "HTML" });
      }
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "running command"), { parse_mode: "HTML" });
    }
  });

  bot.command("commands", async (ctx) => {
    try {
      const provider = getProvider();
      const commands = await provider.getCommands();

      if (!commands || commands.length === 0) {
        await ctx.reply("No commands available.", { parse_mode: "HTML" });
        return;
      }

      const text =
        `<b>Commands</b>  (${commands.length})\n` +
        `<i>Use with /cmd &lt;command&gt;</i>\n\n` +
        commands
          .map((c) => {
            const desc = c.description ? ` — ${escapeHtml(c.description)}` : "";
            return `<code>${escapeHtml(c.name)}</code>${desc}`;
          })
          .join("\n");

      const chunks = chunkMessage(text);
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: "HTML" });
      }
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "listing commands"), { parse_mode: "HTML" });
    }
  });
}
