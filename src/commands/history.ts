import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
import { getProvider } from "../providers/index.js";
import { getActiveSessionId, setActiveSessionId } from "../session.js";
import { chunkMessage } from "../utils/chunker.js";
import { formatCatchError } from "../utils/errors.js";
import { escapeHtml } from "../utils/html.js";
import { markdownToHtml } from "../utils/markdown.js";

export function registerHistoryCommands(bot: Bot): void {
  bot.command("history", async (ctx) => {
    try {
      const sessionId = getActiveSessionId();
      if (!sessionId) {
        await ctx.reply("No active session — use /new to start one.", { parse_mode: "HTML" });
        return;
      }

      await ctx.replyWithChatAction("typing");
      const provider = getProvider();
      const messages = await provider.getHistory(sessionId);

      if (!messages) {
        await ctx.reply("No history available for this session.", { parse_mode: "HTML" });
        return;
      }

      if (messages.length === 0) {
        await ctx.reply("No messages in this session.", { parse_mode: "HTML" });
        return;
      }

      const last10 = messages.slice(-10);

      // Extract raw text per message for rendering and fork previews
      function getMessageText(m: any): string {
        const parts = m.parts ?? m.content ?? [];
        if (Array.isArray(parts)) {
          return parts
            .filter((p: any) => p.type === "text")
            .map((p: any) => p.text)
            .join("\n");
        }
        return String(parts);
      }

      const text = last10
        .map((m: any) => {
          const role = m.info?.role ?? m.role ?? "unknown";
          const raw = getMessageText(m).slice(0, 300);
          const rendered = raw ? markdownToHtml(raw) : "(no text)";
          return `<b>${escapeHtml(role)}:</b>\n${rendered}`;
        })
        .join("\n\n---\n\n");

      // Build fork buttons for assistant messages
      const kb = new InlineKeyboard();
      for (const m of last10 as any[]) {
        const role = m.info?.role ?? m.role ?? "unknown";
        if (role !== "assistant") continue;

        const msgId = m.id ?? m.info?.id;
        if (!msgId) continue;

        const raw = getMessageText(m).slice(0, 25);
        const label = raw ? `Fork after: "${raw}…"` : "Fork";
        kb.row().text(label, `hist_fork:${msgId}`);
      }

      const header = `Last ${Math.min(messages.length, 10)} message(s):\n\n`;
      const full = header + text;
      const hasButtons = kb.inline_keyboard.length > 0;

      // Chunk using the HTML-aware chunker
      const chunks = chunkMessage(full);

      if (hasButtons) {
        // First chunk gets the keyboard, rest sent plain
        await ctx.reply(chunks[0], { parse_mode: "HTML", reply_markup: kb });
        for (let i = 1; i < chunks.length; i++) {
          await ctx.reply(chunks[i], { parse_mode: "HTML" });
        }
      } else {
        for (const chunk of chunks) {
          await ctx.reply(chunk, { parse_mode: "HTML" });
        }
      }
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "fetching history"), { parse_mode: "HTML" });
    }
  });

  // --- Fork callback handler ---

  bot.callbackQuery(/^hist_fork:(.+)$/, async (ctx) => {
    try {
      const messageId = ctx.match[1];
      const sessionId = getActiveSessionId();
      if (!sessionId) {
        await ctx.answerCallbackQuery({ text: "No active session" });
        return;
      }

      const provider = getProvider();
      const forked = await provider.forkSession(sessionId, messageId);

      if (!forked) {
        await ctx.answerCallbackQuery({ text: "Could not fork session" });
        return;
      }

      setActiveSessionId(forked.id);
      await ctx.reply(
        `Session forked\n\n<b>Title:</b> ${escapeHtml(forked.title ?? "Forked Session")}\n<b>ID:</b> <code>${escapeHtml(forked.id)}</code>`,
        { parse_mode: "HTML" }
      );
      await ctx.answerCallbackQuery({ text: "Session forked" });
    } catch (err: any) {
      await ctx.answerCallbackQuery({ text: "Failed to fork session" });
    }
  });

  bot.command("abort", async (ctx) => {
    try {
      const sessionId = getActiveSessionId();
      if (!sessionId) {
        await ctx.reply("No active session — use /new to start one.", { parse_mode: "HTML" });
        return;
      }

      await ctx.replyWithChatAction("typing");
      const provider = getProvider();
      await provider.abort(sessionId);
      await ctx.reply("Operation aborted.", { parse_mode: "HTML" });
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "aborting operation"), { parse_mode: "HTML" });
    }
  });

  bot.command("share", async (ctx) => {
    try {
      const sessionId = getActiveSessionId();
      if (!sessionId) {
        await ctx.reply("No active session — use /new to start one.", { parse_mode: "HTML" });
        return;
      }

      await ctx.replyWithChatAction("typing");
      const provider = getProvider();
      const shareUrl = await provider.share(sessionId);

      if (shareUrl) {
        await ctx.reply(
          `Session shared: <a href="${escapeHtml(shareUrl)}">${escapeHtml(shareUrl)}</a>`,
          { parse_mode: "HTML" }
        );
      } else {
        await ctx.reply("Could not share this session.", { parse_mode: "HTML" });
      }
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "sharing session"), { parse_mode: "HTML" });
    }
  });

  bot.command("unshare", async (ctx) => {
    try {
      const sessionId = getActiveSessionId();
      if (!sessionId) {
        await ctx.reply("No active session — use /new to start one.", { parse_mode: "HTML" });
        return;
      }

      await ctx.replyWithChatAction("typing");
      const provider = getProvider();
      const ok = await provider.unshare(sessionId);

      if (!ok) {
        await ctx.reply("Could not unshare this session.", { parse_mode: "HTML" });
        return;
      }

      await ctx.reply("Session link revoked.", { parse_mode: "HTML" });
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "unsharing session"), { parse_mode: "HTML" });
    }
  });

  bot.command("revert", async (ctx) => {
    try {
      const sessionId = getActiveSessionId();
      if (!sessionId) {
        await ctx.reply("No active session — use /new to start one.", { parse_mode: "HTML" });
        return;
      }

      await ctx.replyWithChatAction("typing");
      const provider = getProvider();
      const reverted = await provider.revert(sessionId);

      if (!reverted) {
        await ctx.reply("No assistant message to revert.", { parse_mode: "HTML" });
        return;
      }

      await ctx.reply("Last change reverted.", { parse_mode: "HTML" });
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "reverting change"), { parse_mode: "HTML" });
    }
  });

  bot.command("unrevert", async (ctx) => {
    try {
      const sessionId = getActiveSessionId();
      if (!sessionId) {
        await ctx.reply("No active session — use /new to start one.", { parse_mode: "HTML" });
        return;
      }

      await ctx.replyWithChatAction("typing");
      const provider = getProvider();
      const ok = await provider.unrevert(sessionId);

      if (!ok) {
        await ctx.reply("Nothing to unrevert.", { parse_mode: "HTML" });
        return;
      }

      await ctx.reply("Revert undone.", { parse_mode: "HTML" });
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "undoing revert"), { parse_mode: "HTML" });
    }
  });

  bot.command("summarize", async (ctx) => {
    try {
      const sessionId = getActiveSessionId();
      if (!sessionId) {
        await ctx.reply("No active session — use /new to start one.", { parse_mode: "HTML" });
        return;
      }

      await ctx.replyWithChatAction("typing");
      const provider = getProvider();
      const result = await provider.summarize(sessionId);

      if (!result) {
        await ctx.reply("Could not summarize this session.", { parse_mode: "HTML" });
        return;
      }

      let text = `<b>Session Summarized</b>\n\n<b>Title:</b>  ${escapeHtml(result.title)}`;
      if (result.files != null) {
        text += `\n<b>Files:</b>  ${result.files}`;
      }
      if (result.additions != null || result.deletions != null) {
        const add = result.additions ?? 0;
        const del = result.deletions ?? 0;
        text += `\n<b>Changes:</b>  <code>+${add} -${del}</code>`;
      }
      await ctx.reply(text, { parse_mode: "HTML" });
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "summarizing session"), { parse_mode: "HTML" });
    }
  });
}
