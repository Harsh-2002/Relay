import type { Bot } from "grammy";
import { getProvider } from "../providers/index.js";
import {
  getActiveSessionId,
  setActiveSessionId,
  clearActiveSession,
} from "../session.js";
import { formatCatchError } from "../utils/errors.js";

export function registerSessionCommands(bot: Bot): void {
  bot.command("new", async (ctx) => {
    try {
      const title = ctx.match || "Telegram Session";
      const provider = getProvider();
      const session = await provider.createSession(title);

      setActiveSessionId(session.id);
      await ctx.reply(
        `Session created!\nTitle: **${session.title ?? title}**\nID: \`${session.id}\``,
        { parse_mode: "Markdown" }
      );
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "creating session"), { parse_mode: "HTML" });
    }
  });

  bot.command("sessions", async (ctx) => {
    try {
      const provider = getProvider();
      const sessions = await provider.listSessions();

      if (sessions.length === 0) {
        await ctx.reply("No sessions found.");
        return;
      }

      const activeId = getActiveSessionId();
      const lines = sessions
        .sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0))
        .map((s, i) => {
          const marker = s.id === activeId ? " ← active" : "";
          const date = s.lastModified
            ? new Date(s.lastModified).toLocaleDateString()
            : "";
          return `${i + 1}. **${s.title || "Untitled"}**\n   ID: \`${s.id}\`${date ? ` | ${date}` : ""}${marker}`;
        })
        .join("\n\n");

      const text = activeId
        ? `Active: \`${activeId}\`\n\n${lines}`
        : lines;

      try {
        await ctx.reply(text, { parse_mode: "Markdown" });
      } catch {
        await ctx.reply(text);
      }
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "listing sessions"), { parse_mode: "HTML" });
    }
  });

  bot.command("switch", async (ctx) => {
    const id = ctx.match?.trim();
    if (!id) {
      await ctx.reply("Usage: /switch <session-id>");
      return;
    }

    try {
      const provider = getProvider();
      const session = await provider.getSession(id);

      if (!session) {
        await ctx.reply(`Session \`${id}\` not found.`, { parse_mode: "Markdown" });
        return;
      }

      setActiveSessionId(id);
      await ctx.reply(
        `Switched to session: **${session.title ?? "Untitled"}** (\`${id}\`)`,
        { parse_mode: "Markdown" }
      );
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "switching session"), { parse_mode: "HTML" });
    }
  });

  bot.command("delete", async (ctx) => {
    const id = ctx.match?.trim();
    if (!id) {
      await ctx.reply("Usage: /delete <session-id>");
      return;
    }

    try {
      const provider = getProvider();
      const deleted = await provider.deleteSession(id);

      if (!deleted) {
        await ctx.reply(
          `Could not delete session. This may not be supported by the ${provider.name} provider.`
        );
        return;
      }

      if (getActiveSessionId() === id) {
        clearActiveSession();
      }
      await ctx.reply(`Session \`${id}\` deleted.`, { parse_mode: "Markdown" });
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "deleting session"), { parse_mode: "HTML" });
    }
  });

  bot.command("current", async (ctx) => {
    const activeId = getActiveSessionId();
    if (!activeId) {
      await ctx.reply("No active session. Send a message or use /new to create one.");
      return;
    }

    try {
      const provider = getProvider();
      const session = await provider.getSession(activeId);

      if (!session) {
        await ctx.reply(`Active session \`${activeId}\` (details not available)`, {
          parse_mode: "Markdown",
        });
        return;
      }

      await ctx.reply(
        `**${session.title ?? "Untitled"}**\nID: \`${session.id}\``,
        { parse_mode: "Markdown" }
      );
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "fetching session"), { parse_mode: "HTML" });
    }
  });
}
