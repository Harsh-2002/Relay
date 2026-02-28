import type { Bot } from "grammy";
import { getClient } from "../client.js";
import { getOrCreateSession } from "../session.js";
import { formatParts } from "../utils/formatter.js";
import { chunkMessage } from "../utils/chunker.js";
import { formatSdkError, formatCatchError } from "../utils/errors.js";

export function registerShellCommands(bot: Bot): void {
  bot.command("shell", async (ctx) => {
    const command = ctx.match?.trim();
    if (!command) {
      await ctx.reply("Usage: /shell <command>");
      return;
    }

    try {
      await ctx.replyWithChatAction("typing");
      const sessionId = await getOrCreateSession();
      const client = getClient();

      const result = await client.session.shell({
        path: { id: sessionId },
        body: { command, agent: "default" },
      });

      if (result.error) {
        await ctx.reply(formatSdkError(result.error), { parse_mode: "HTML" });
        return;
      }

      const data = result.data as any;
      const text = data?.modelID
        ? `Shell command completed (model: ${data.modelID}).`
        : "Shell command completed.";
      await ctx.reply(text);
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "running shell command"), { parse_mode: "HTML" });
    }
  });

  bot.command("cmd", async (ctx) => {
    const input = ctx.match?.trim();
    if (!input) {
      await ctx.reply("Usage: /cmd <command> [arguments]");
      return;
    }

    const spaceIdx = input.indexOf(" ");
    const command = spaceIdx === -1 ? input : input.slice(0, spaceIdx);
    const args = spaceIdx === -1 ? "" : input.slice(spaceIdx + 1);

    try {
      await ctx.replyWithChatAction("typing");
      const sessionId = await getOrCreateSession();
      const client = getClient();

      const result = await client.session.command({
        path: { id: sessionId },
        body: { command, arguments: args, agent: "build" },
      });

      if (result.error) {
        await ctx.reply(formatSdkError(result.error), { parse_mode: "HTML" });
        return;
      }

      const response = formatParts(result.data?.parts ?? []);
      const chunks = chunkMessage(response);
      for (const chunk of chunks) {
        try {
          await ctx.reply(chunk, { parse_mode: "Markdown" });
        } catch {
          await ctx.reply(chunk);
        }
      }
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "running command"), { parse_mode: "HTML" });
    }
  });

  bot.command("commands", async (ctx) => {
    try {
      const client = getClient();
      const result = await client.command.list();

      if (result.error) {
        await ctx.reply(formatSdkError(result.error), { parse_mode: "HTML" });
        return;
      }

      const commands = (result.data ?? []) as any[];
      if (commands.length === 0) {
        await ctx.reply("No commands available.");
        return;
      }

      const text =
        `<b>OpenCode Commands</b>  (${commands.length})\n` +
        `<i>Use with /cmd &lt;command&gt;</i>\n\n` +
        commands
          .map((c: any) => {
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
