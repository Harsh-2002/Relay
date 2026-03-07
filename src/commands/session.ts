import type { Bot, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { getProvider } from "../providers/index.js";
import type { SessionInfo } from "../providers/types.js";
import {
  getActiveSessionId,
  setActiveSessionId,
  clearActiveSession,
} from "../session.js";
import { formatCatchError, isNotModified } from "../utils/errors.js";
import { escapeHtml } from "../utils/html.js";
import { promptForInput } from "../utils/input.js";

function buildSessionList(
  sessions: SessionInfo[],
  statuses: Record<string, string>,
  activeId: string | null,
): { text: string; keyboard: InlineKeyboard } {
  const sorted = sessions
    .slice()
    .sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0));

  const lines = sorted.map((s, i) => {
    const marker = s.id === activeId ? " ← active" : "";
    const date = s.lastModified
      ? new Date(s.lastModified).toLocaleDateString()
      : "";
    const status = statuses[s.id];
    const statusBadge = status === "busy" ? " ⏳" : "";
    return `${i + 1}. <b>${escapeHtml(s.title || "Untitled")}</b>${statusBadge}\n   ${date}${marker}`;
  });

  const text = `<b>Sessions</b>  (${sessions.length})\n\n` + lines.join("\n\n");

  const kb = new InlineKeyboard();
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    const title = s.title || "Untitled";
    const shortTitle = title.length > 18 ? title.slice(0, 18) + "…" : title;
    if (s.id === activeId) {
      kb.row().text(`✓ ${i + 1}. ${shortTitle}`, "ses_noop");
    } else {
      kb.row()
        .text(`${i + 1}. ${shortTitle}`, `ses_sw:${s.id}`)
        .text(`🗑`, `ses_del:${s.id}`);
    }
  }

  return { text, keyboard: kb };
}

async function executeRename(title: string, ctx: Context): Promise<void> {
  const activeId = getActiveSessionId();
  if (!activeId) {
    await ctx.reply("No active session — use /new to start one.", { parse_mode: "HTML" });
    return;
  }

  try {
    await ctx.replyWithChatAction("typing");
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
}

export function registerSessionCommands(bot: Bot): void {
  bot.command("new", async (ctx) => {
    try {
      await ctx.replyWithChatAction("typing");
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
      await ctx.replyWithChatAction("typing");
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
      const { text, keyboard } = buildSessionList(sessions, statuses, activeId);
      await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "listing sessions"), { parse_mode: "HTML" });
    }
  });

  // --- Session picker callback handlers ---

  bot.callbackQuery(/^ses_sw:(.+)$/, async (ctx) => {
    try {
      const id = ctx.match[1];
      const provider = getProvider();
      const session = await provider.getSession(id);

      if (!session) {
        await ctx.answerCallbackQuery({ text: "Session not found" });
        return;
      }

      setActiveSessionId(id);

      // Rebuild list in-place
      const [sessions, statuses] = await Promise.all([
        provider.listSessions(),
        provider.getSessionStatuses(),
      ]);
      const { text, keyboard } = buildSessionList(sessions, statuses, getActiveSessionId());
      try {
        await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
      } catch (err: any) {
        if (!isNotModified(err)) throw err;
      }
      await ctx.answerCallbackQuery({ text: `Switched to ${session.title ?? "Untitled"}` });
    } catch (err: any) {
      await ctx.answerCallbackQuery({ text: "Failed to switch session" });
    }
  });

  bot.callbackQuery(/^ses_del:(.+)$/, async (ctx) => {
    try {
      const id = ctx.match[1];
      const provider = getProvider();
      const session = await provider.getSession(id);
      const title = session?.title ?? "Untitled";

      const kb = new InlineKeyboard()
        .text("Yes, delete", `ses_del_yes:${id}`)
        .text("No", `ses_del_no:${id}`);

      await ctx.editMessageText(
        `Delete session <b>${escapeHtml(title)}</b>?`,
        { parse_mode: "HTML", reply_markup: kb },
      );
      await ctx.answerCallbackQuery();
    } catch (err: any) {
      await ctx.answerCallbackQuery({ text: "Failed to show confirmation" });
    }
  });

  bot.callbackQuery(/^ses_del_yes:(.+)$/, async (ctx) => {
    try {
      const id = ctx.match[1];
      const provider = getProvider();
      const deleted = await provider.deleteSession(id);

      if (!deleted) {
        await ctx.answerCallbackQuery({ text: "Could not delete session" });
        return;
      }

      if (getActiveSessionId() === id) {
        clearActiveSession();
      }

      // Rebuild list in-place
      const [sessions, statuses] = await Promise.all([
        provider.listSessions(),
        provider.getSessionStatuses(),
      ]);

      if (sessions.length === 0) {
        try {
          await ctx.editMessageText("No sessions found.", { parse_mode: "HTML" });
        } catch (err: any) {
          if (!isNotModified(err)) throw err;
        }
      } else {
        const { text, keyboard } = buildSessionList(sessions, statuses, getActiveSessionId());
        try {
          await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
        } catch (err: any) {
          if (!isNotModified(err)) throw err;
        }
      }
      await ctx.answerCallbackQuery({ text: "Session deleted" });
    } catch (err: any) {
      await ctx.answerCallbackQuery({ text: "Failed to delete session" });
    }
  });

  bot.callbackQuery(/^ses_del_no:(.+)$/, async (ctx) => {
    try {
      const provider = getProvider();
      const [sessions, statuses] = await Promise.all([
        provider.listSessions(),
        provider.getSessionStatuses(),
      ]);

      if (sessions.length === 0) {
        try {
          await ctx.editMessageText("No sessions found.", { parse_mode: "HTML" });
        } catch (err: any) {
          if (!isNotModified(err)) throw err;
        }
      } else {
        const { text, keyboard } = buildSessionList(sessions, statuses, getActiveSessionId());
        try {
          await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
        } catch (err: any) {
          if (!isNotModified(err)) throw err;
        }
      }
      await ctx.answerCallbackQuery();
    } catch (err: any) {
      await ctx.answerCallbackQuery({ text: "Failed to load sessions" });
    }
  });

  bot.callbackQuery("ses_noop", async (ctx) => {
    await ctx.answerCallbackQuery({ text: "This is the active session" });
  });

  bot.command("switch", async (ctx) => {
    const id = ctx.match?.trim();
    if (!id) {
      // Show sessions picker
      try {
        await ctx.replyWithChatAction("typing");
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
        const { text, keyboard } = buildSessionList(sessions, statuses, activeId);
        await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
      } catch (err: any) {
        await ctx.reply(formatCatchError(err, "listing sessions"), { parse_mode: "HTML" });
      }
      return;
    }

    try {
      await ctx.replyWithChatAction("typing");
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
      // Show sessions picker
      try {
        await ctx.replyWithChatAction("typing");
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
        const { text, keyboard } = buildSessionList(sessions, statuses, activeId);
        await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
      } catch (err: any) {
        await ctx.reply(formatCatchError(err, "listing sessions"), { parse_mode: "HTML" });
      }
      return;
    }

    // Show confirmation
    try {
      await ctx.replyWithChatAction("typing");
      const provider = getProvider();
      const session = await provider.getSession(id);
      const title = session?.title ?? "Untitled";
      const kb = new InlineKeyboard()
        .text("Yes, delete", `ses_del_yes:${id}`)
        .text("No", `ses_del_no:${id}`);
      await ctx.reply(
        `Delete session <b>${escapeHtml(title)}</b>?`,
        { parse_mode: "HTML", reply_markup: kb },
      );
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "deleting session"), { parse_mode: "HTML" });
    }
  });

  bot.command("rename", async (ctx) => {
    const title = ctx.match?.trim();
    if (!title) {
      const activeId = getActiveSessionId();
      if (!activeId) {
        await ctx.reply("No active session — use /new to start one.", { parse_mode: "HTML" });
        return;
      }
      await promptForInput(ctx, "Type the new session title:", async (text, replyCtx) => {
        await executeRename(text.trim(), replyCtx);
      });
      return;
    }
    await executeRename(title, ctx);
  });

  bot.command("current", async (ctx) => {
    const activeId = getActiveSessionId();
    if (!activeId) {
      await ctx.reply("No active session — use /new to start one.", { parse_mode: "HTML" });
      return;
    }

    try {
      await ctx.replyWithChatAction("typing");
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
      const statusDisplay = status === "busy" ? "busy ⏳" : status;

      await ctx.reply(
        `<b>${escapeHtml(session.title ?? "Untitled")}</b>\nID: <code>${escapeHtml(session.id)}</code>\nStatus: ${statusDisplay}`,
        { parse_mode: "HTML" }
      );
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "fetching session"), { parse_mode: "HTML" });
    }
  });
}
