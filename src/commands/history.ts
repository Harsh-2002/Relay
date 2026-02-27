import type { Bot } from "grammy";
import { getClient } from "../client.js";
import { getActiveSessionId, getOrCreateSession } from "../session.js";
import { chunkMessage } from "../utils/chunker.js";

export function registerHistoryCommands(bot: Bot): void {
  bot.command("history", async (ctx) => {
    try {
      const sessionId = getActiveSessionId();
      if (!sessionId) {
        await ctx.reply("No active session. Use /new to create one.");
        return;
      }

      const client = getClient();
      const result = await client.session.messages({ path: { id: sessionId } });

      if (result.error) {
        await ctx.reply("Failed to get messages.");
        return;
      }

      const messages = result.data ?? [];
      if (messages.length === 0) {
        await ctx.reply("No messages in this session.");
        return;
      }

      const text = messages
        .slice(-10)
        .map((m: any) => {
          const role = m.info?.role ?? "unknown";
          const parts = m.parts ?? [];
          const content = parts
            .filter((p: any) => p.type === "text")
            .map((p: any) => p.text)
            .join("\n")
            .slice(0, 200);
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
      await ctx.reply(`Error: ${err.message}`);
    }
  });

  bot.command("abort", async (ctx) => {
    try {
      const sessionId = getActiveSessionId();
      if (!sessionId) {
        await ctx.reply("No active session.");
        return;
      }

      const client = getClient();
      await client.session.abort({ path: { id: sessionId } });
      await ctx.reply("Operation aborted.");
    } catch (err: any) {
      await ctx.reply(`Error: ${err.message}`);
    }
  });

  bot.command("share", async (ctx) => {
    try {
      const sessionId = getActiveSessionId();
      if (!sessionId) {
        await ctx.reply("No active session.");
        return;
      }

      const client = getClient();
      const result = await client.session.share({ path: { id: sessionId } });

      if (result.error) {
        await ctx.reply("Failed to share session.");
        return;
      }

      const shareUrl = result.data?.share?.url;
      if (shareUrl) {
        await ctx.reply(`Session shared: ${shareUrl}`);
      } else {
        await ctx.reply("Session shared successfully.");
      }
    } catch (err: any) {
      await ctx.reply(`Error: ${err.message}`);
    }
  });

  bot.command("revert", async (ctx) => {
    try {
      const sessionId = getActiveSessionId();
      if (!sessionId) {
        await ctx.reply("No active session.");
        return;
      }

      const client = getClient();
      await client.session.revert({ path: { id: sessionId } });
      await ctx.reply("Last change reverted.");
    } catch (err: any) {
      await ctx.reply(`Error: ${err.message}`);
    }
  });

  bot.command("unrevert", async (ctx) => {
    try {
      const sessionId = getActiveSessionId();
      if (!sessionId) {
        await ctx.reply("No active session.");
        return;
      }

      const client = getClient();
      await client.session.unrevert({ path: { id: sessionId } });
      await ctx.reply("Revert undone.");
    } catch (err: any) {
      await ctx.reply(`Error: ${err.message}`);
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
      const client = getClient();
      await client.session.summarize({ path: { id: sessionId } });
      await ctx.reply("Session summarized.");
    } catch (err: any) {
      await ctx.reply(`Error: ${err.message}`);
    }
  });
}
