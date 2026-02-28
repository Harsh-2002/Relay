import type { Bot } from "grammy";
import { getProvider } from "../providers/index.js";
import { getActiveSessionId } from "../session.js";
import { chunkMessage } from "../utils/chunker.js";
import { formatCatchError } from "../utils/errors.js";

export function registerHistoryCommands(bot: Bot): void {
  bot.command("history", async (ctx) => {
    try {
      const sessionId = getActiveSessionId();
      if (!sessionId) {
        await ctx.reply("No active session. Use /new to create one.");
        return;
      }

      const provider = getProvider();
      const messages = await provider.getHistory(sessionId);

      if (!messages) {
        await ctx.reply(
          `History is not supported by the ${provider.name} provider.`
        );
        return;
      }

      if (messages.length === 0) {
        await ctx.reply("No messages in this session.");
        return;
      }

      const text = messages
        .slice(-10)
        .map((m: any) => {
          const role = m.info?.role ?? m.role ?? "unknown";
          const parts = m.parts ?? m.content ?? [];
          const content = Array.isArray(parts)
            ? parts
                .filter((p: any) => p.type === "text")
                .map((p: any) => p.text)
                .join("\n")
                .slice(0, 200)
            : String(parts).slice(0, 200);
          return `**${role}:** ${content || "(no text)"}`;
        })
        .join("\n\n---\n\n");

      const header = `Last ${Math.min(messages.length, 10)} message(s):\n\n`;
      const chunks = chunkMessage(header + text);
      for (const chunk of chunks) {
        try {
          await ctx.reply(chunk, { parse_mode: "Markdown" });
        } catch {
          await ctx.reply(chunk);
        }
      }
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "fetching history"), { parse_mode: "HTML" });
    }
  });

  bot.command("abort", async (ctx) => {
    try {
      const sessionId = getActiveSessionId();
      if (!sessionId) {
        await ctx.reply("No active session.");
        return;
      }

      const provider = getProvider();
      await provider.abort(sessionId);
      await ctx.reply("Operation aborted.");
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "aborting operation"), { parse_mode: "HTML" });
    }
  });

  bot.command("share", async (ctx) => {
    try {
      const sessionId = getActiveSessionId();
      if (!sessionId) {
        await ctx.reply("No active session.");
        return;
      }

      const provider = getProvider();
      const shareUrl = await provider.share(sessionId);

      if (shareUrl) {
        await ctx.reply(`Session shared: ${shareUrl}`);
      } else if (shareUrl === null) {
        await ctx.reply(
          `Sharing is not supported by the ${provider.name} provider.`
        );
      } else {
        await ctx.reply("Session shared successfully.");
      }
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "sharing session"), { parse_mode: "HTML" });
    }
  });

  bot.command("revert", async (ctx) => {
    try {
      const sessionId = getActiveSessionId();
      if (!sessionId) {
        await ctx.reply("No active session.");
        return;
      }

      const provider = getProvider();
      const reverted = await provider.revert(sessionId);

      if (!reverted) {
        await ctx.reply(
          provider.name === "opencode"
            ? "No assistant message to revert."
            : `Revert is not supported by the ${provider.name} provider.`
        );
        return;
      }

      await ctx.reply("Last change reverted.");
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "reverting change"), { parse_mode: "HTML" });
    }
  });

  bot.command("unrevert", async (ctx) => {
    try {
      const sessionId = getActiveSessionId();
      if (!sessionId) {
        await ctx.reply("No active session.");
        return;
      }

      const provider = getProvider();
      const ok = await provider.unrevert(sessionId);

      if (!ok) {
        await ctx.reply(
          `Unrevert is not supported by the ${provider.name} provider.`
        );
        return;
      }

      await ctx.reply("Revert undone.");
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "undoing revert"), { parse_mode: "HTML" });
    }
  });

  bot.command("summarize", async (ctx) => {
    try {
      const sessionId = getActiveSessionId();
      if (!sessionId) {
        await ctx.reply("No active session.");
        return;
      }

      await ctx.replyWithChatAction("typing");
      const provider = getProvider();
      const ok = await provider.summarize(sessionId);

      if (!ok) {
        await ctx.reply(
          `Summarize is not supported by the ${provider.name} provider.`
        );
        return;
      }

      await ctx.reply("Session summarized.");
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "summarizing session"), { parse_mode: "HTML" });
    }
  });
}
