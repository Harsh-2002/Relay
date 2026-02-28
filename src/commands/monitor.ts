import type { Bot } from "grammy";
import { InputFile } from "grammy";
import { getProvider } from "../providers/index.js";
import { getActiveSessionId, setActiveSessionId } from "../session.js";
import { chunkMessage } from "../utils/chunker.js";
import { formatCatchError } from "../utils/errors.js";

export function registerMonitorCommands(bot: Bot): void {
  bot.command("todo", async (ctx) => {
    try {
      const sessionId = getActiveSessionId();
      if (!sessionId) {
        await ctx.reply("No active session. Use /new to create one.");
        return;
      }

      const provider = getProvider();
      const todos = await provider.getTodos(sessionId);

      if (todos === null) {
        await ctx.reply(
          `Todo list is not supported by the ${provider.name} provider.`
        );
        return;
      }

      if (todos.length === 0) {
        await ctx.reply("No tasks in this session.");
        return;
      }

      const lines = todos.map((t) => {
        const icon = statusIcon(t.status);
        const priority = t.priority ? ` [${t.priority}]` : "";
        return `${icon}  ${escapeHtml(t.content)}${priority}`;
      });

      const text =
        `<b>Todo List</b>  (${todos.length} item${todos.length === 1 ? "" : "s"})\n\n` +
        lines.join("\n");

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
        await ctx.reply("No active session. Use /new to create one.");
        return;
      }

      const provider = getProvider();
      const diffs = await provider.getDiff(sessionId);

      if (diffs === null) {
        await ctx.reply(
          `Diff is not supported by the ${provider.name} provider.`
        );
        return;
      }

      if (diffs.length === 0) {
        await ctx.reply("No changes in this session.");
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
        await ctx.reply("No active session. Use /new to create one.");
        return;
      }

      const messageID = ctx.match?.trim() || undefined;
      const provider = getProvider();
      const forked = await provider.forkSession(sessionId, messageID);

      if (!forked) {
        await ctx.reply(
          `Forking is not supported by the ${provider.name} provider.`
        );
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
