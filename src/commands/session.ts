import type { Bot } from "grammy";
import { getProvider } from "../providers/index.js";
import {
  getActiveSessionId,
  setActiveSessionId,
  clearActiveSession,
} from "../session.js";
import { formatCatchError } from "../utils/errors.js";
import { escapeHtml } from "../utils/html.js";

export function registerSessionCommands(bot: Bot): void {
  bot.command("new", async (ctx) => {
    try {
      const title = ctx.match || "Telegram Session";
      const provider = getProvider();
      const session = await provider.createSession(title);

      setActiveSessionId(session.id);
      await ctx.reply(
        `Session created\n\n<b>Title:</b> ${escapeHtml(session.title ?? title)}\n<b>ID:</b> <code>${escapeHtml(session.id)}</code>`,
        { parse_mode: "HTML" }
      );
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "creating session"), { parse_mode: "HTML" });
    }
  });

  bot.command("sessions", async (ctx) => {
    try {
      const provider = getProvider();
      const [sessions, statuses] = await Promise.all([
        provider.listSessions(),
        provider.getSessionStatuses(),
      ]);

      if (sessions.length === 0) {
        await ctx.reply("No sessions found.", { parse_mode: "HTML" });
        return;
      }

      const activeId = getActiveSessionId();
      const lines = sessions
        .sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0))
        .map((s, i) => {
          const marker = s.id === activeId ? " \u2190 active" : "";
          const date = s.lastModified
            ? new Date(s.lastModified).toLocaleDateString()
            : "";
          const status = statuses[s.id];
          const statusBadge = status === "busy" ? " \u23f3" : "";
          return `${i + 1}. <b>${escapeHtml(s.title || "Untitled")}</b>${statusBadge}\n   ID: <code>${escapeHtml(s.id)}</code>${date ? ` | ${date}` : ""}${marker}`;
        })
        .join("\n\n");

      const text = activeId
        ? `Active: <code>${escapeHtml(activeId)}</code>\n\n${lines}`
        : lines;

      await ctx.reply(text, { parse_mode: "HTML" });
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "listing sessions"), { parse_mode: "HTML" });
    }
  });

  bot.command("switch", async (ctx) => {
    const id = ctx.match?.trim();
    if (!id) {
      await ctx.reply("Usage: <code>/switch &lt;session-id&gt;</code>", { parse_mode: "HTML" });
      return;
    }

    try {
      const provider = getProvider();
      const session = await provider.getSession(id);

      if (!session) {
        await ctx.reply(`Session <code>${escapeHtml(id)}</code> not found.`, { parse_mode: "HTML" });
        return;
      }

      setActiveSessionId(id);
      await ctx.reply(
        `Switched to session: <b>${escapeHtml(session.title ?? "Untitled")}</b> (<code>${escapeHtml(id)}</code>)`,
        { parse_mode: "HTML" }
      );
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "switching session"), { parse_mode: "HTML" });
    }
  });

  bot.command("delete", async (ctx) => {
    const id = ctx.match?.trim();
    if (!id) {
      await ctx.reply("Usage: <code>/delete &lt;session-id&gt;</code>", { parse_mode: "HTML" });
      return;
    }

    try {
      const provider = getProvider();
      const deleted = await provider.deleteSession(id);

      if (!deleted) {
        await ctx.reply("Could not delete this session.", { parse_mode: "HTML" });
        return;
      }

      if (getActiveSessionId() === id) {
        clearActiveSession();
      }
      await ctx.reply(`Session <code>${escapeHtml(id)}</code> deleted.`, { parse_mode: "HTML" });
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "deleting session"), { parse_mode: "HTML" });
    }
  });

  bot.command("rename", async (ctx) => {
    const title = ctx.match?.trim();
    if (!title) {
      await ctx.reply("Usage: <code>/rename &lt;new title&gt;</code>", { parse_mode: "HTML" });
      return;
    }

    const activeId = getActiveSessionId();
    if (!activeId) {
      await ctx.reply("No active session — use /new to start one.", { parse_mode: "HTML" });
      return;
    }

    try {
      const provider = getProvider();
      const ok = await provider.renameSession(activeId, title);

      if (!ok) {
        await ctx.reply("Could not rename this session.", { parse_mode: "HTML" });
        return;
      }

      await ctx.reply(`Session renamed to <b>${escapeHtml(title)}</b>`, { parse_mode: "HTML" });
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "renaming session"), { parse_mode: "HTML" });
    }
  });

  bot.command("current", async (ctx) => {
    const activeId = getActiveSessionId();
    if (!activeId) {
      await ctx.reply("No active session — use /new to start one.", { parse_mode: "HTML" });
      return;
    }

    try {
      const provider = getProvider();
      const [session, statuses] = await Promise.all([
        provider.getSession(activeId),
        provider.getSessionStatuses(),
      ]);

      if (!session) {
        await ctx.reply(`Active session <code>${escapeHtml(activeId)}</code> (details not available)`, {
          parse_mode: "HTML",
        });
        return;
      }

      const status = statuses[activeId] ?? "unknown";
      const statusDisplay = status === "busy" ? "busy \u23f3" : status;

      await ctx.reply(
        `<b>${escapeHtml(session.title ?? "Untitled")}</b>\nID: <code>${escapeHtml(session.id)}</code>\nStatus: ${statusDisplay}`,
        { parse_mode: "HTML" }
      );
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "fetching session"), { parse_mode: "HTML" });
    }
  });
}
