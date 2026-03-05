import type { Bot } from "grammy";
import { InputFile } from "grammy";
import { getProvider } from "../providers/index.js";
import { getActiveSessionId, setActiveSessionId } from "../session.js";
import { chunkMessage } from "../utils/chunker.js";
import { formatCatchError } from "../utils/errors.js";
import { escapeHtml } from "../utils/html.js";

export function registerMonitorCommands(bot: Bot): void {
  bot.command("todo", async (ctx) => {
    try {
      const sessionId = getActiveSessionId();
      if (!sessionId) {
        await ctx.reply("No active session — use /new to start one.", { parse_mode: "HTML" });
        return;
      }

      const provider = getProvider();
      const todos = await provider.getTodos(sessionId);

      if (!todos || todos.length === 0) {
        await ctx.reply("No tasks in this session.", { parse_mode: "HTML" });
        return;
      }

      let text = `<b>Todo List</b>  (${todos.length} item${todos.length === 1 ? "" : "s"})\n`;
      for (const t of todos) {
        const icon = statusIcon(t.status);
        const priority = t.priority ? `  <i>[${escapeHtml(t.priority)}]</i>` : "";
        text += `\n${icon}  ${escapeHtml(t.content)}${priority}\n`;
      }

      const chunks = chunkMessage(text);
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: "HTML" });
      }
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "fetching todo list"), { parse_mode: "HTML" });
    }
  });

  bot.command("diff", async (ctx) => {
    try {
      const sessionId = getActiveSessionId();
      if (!sessionId) {
        await ctx.reply("No active session — use /new to start one.", { parse_mode: "HTML" });
        return;
      }

      const provider = getProvider();
      const diffs = await provider.getDiff(sessionId);

      if (diffs === null) {
        await ctx.reply("No changes available for this session.", { parse_mode: "HTML" });
        return;
      }

      if (diffs.length === 0) {
        await ctx.reply("No changes in this session.", { parse_mode: "HTML" });
        return;
      }

      // Build summary
      let totalAdded = 0;
      let totalDeleted = 0;
      for (const d of diffs) {
        totalAdded += d.additions;
        totalDeleted += d.deletions;
      }

      const arg = ctx.match?.trim();

      // "full" → send before/after content as file
      if (arg === "full") {
        const fullText = diffs
          .map((d) => {
            let section = `=== ${d.file} ===  +${d.additions} -${d.deletions}\n`;
            if (d.after) {
              section += `--- before\n${d.before ?? "(new file)"}\n+++ after\n${d.after}\n`;
            }
            return section;
          })
          .join("\n\n");

        const buffer = Buffer.from(fullText, "utf-8");
        await ctx.replyWithDocument(new InputFile(buffer, "session-diff.txt"));
        return;
      }

      // Default: compact summary
      const fileLines = diffs.map(
        (d) => `<code>${escapeHtml(d.file)}</code>  +${d.additions} -${d.deletions}`
      );

      const text =
        `<b>Session Diff</b>  ` +
        `${diffs.length} file${diffs.length === 1 ? "" : "s"} changed  ` +
        `<code>+${totalAdded} -${totalDeleted}</code>\n\n` +
        fileLines.join("\n") +
        `\n\n<i>Use /diff full to download full content</i>`;

      const chunks = chunkMessage(text);
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: "HTML" });
      }
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "fetching diff"), { parse_mode: "HTML" });
    }
  });

  bot.command("fork", async (ctx) => {
    try {
      const sessionId = getActiveSessionId();
      if (!sessionId) {
        await ctx.reply("No active session — use /new to start one.", { parse_mode: "HTML" });
        return;
      }

      const messageID = ctx.match?.trim() || undefined;
      const provider = getProvider();
      const forked = await provider.forkSession(sessionId, messageID);

      if (!forked) {
        await ctx.reply("Could not fork this session.", { parse_mode: "HTML" });
        return;
      }

      setActiveSessionId(forked.id);

      await ctx.reply(
        `<b>Session forked</b>\n\n` +
          `<b>Title:</b>  ${escapeHtml(forked.title ?? "Untitled")}\n` +
          `<b>ID:</b>  <code>${forked.id}</code>\n` +
          (messageID ? `<b>From message:</b>  <code>${messageID}</code>\n` : "") +
          `\nSwitched to the forked session.`,
        { parse_mode: "HTML" }
      );
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "forking session"), { parse_mode: "HTML" });
    }
  });
}

function statusIcon(status: string): string {
  switch (status) {
    case "completed":
      return "\u2705";
    case "in_progress":
      return "\u23f3";
    case "cancelled":
      return "\u274c";
    case "pending":
    default:
      return "\u2b1c";
  }
}

