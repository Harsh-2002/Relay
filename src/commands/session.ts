import type { Bot } from "grammy";
import { getClient } from "../client.js";
import {
  getActiveSessionId,
  setActiveSessionId,
  clearActiveSession,
  getOrCreateSession,
} from "../session.js";
import { formatSessionList } from "../utils/formatter.js";

export function registerSessionCommands(bot: Bot): void {
  bot.command("new", async (ctx) => {
    try {
      const title = ctx.match || "Telegram Session";
      const client = getClient();
      const result = await client.session.create({ body: { title } });

      if (result.error) {
        await ctx.reply(`Failed to create session: ${JSON.stringify(result.error)}`);
        return;
      }

      setActiveSessionId(result.data!.id);
      await ctx.reply(
        `Session created!\nTitle: **${result.data!.title}**\nID: \`${result.data!.id}\``,
        { parse_mode: "Markdown" }
      );
    } catch (err: any) {
      await ctx.reply(`Error: ${err.message}`);
    }
  });

  bot.command("sessions", async (ctx) => {
    try {
      const client = getClient();
      const result = await client.session.list();

      if (result.error) {
        await ctx.reply(`Failed to list sessions: ${JSON.stringify(result.error)}`);
        return;
      }

      const activeId = getActiveSessionId();
      let text = formatSessionList(result.data ?? []);
      if (activeId) {
        text = `Active: \`${activeId}\`\n\n${text}`;
      }
      try {
        await ctx.reply(text, { parse_mode: "Markdown" });
      } catch {
        await ctx.reply(text);
      }
    } catch (err: any) {
      await ctx.reply(`Error: ${err.message}`);
    }
  });

  bot.command("switch", async (ctx) => {
    const id = ctx.match?.trim();
    if (!id) {
      await ctx.reply("Usage: /switch <session-id>");
      return;
    }

    try {
      const client = getClient();
      const result = await client.session.get({ path: { id } });

      if (result.error) {
        await ctx.reply(`Session not found: ${id}`);
        return;
      }

      setActiveSessionId(id);
      await ctx.reply(`Switched to session: **${result.data!.title}** (\`${id}\`)`, {
        parse_mode: "Markdown",
      });
    } catch (err: any) {
      await ctx.reply(`Error: ${err.message}`);
    }
  });

  bot.command("delete", async (ctx) => {
    const id = ctx.match?.trim();
    if (!id) {
      await ctx.reply("Usage: /delete <session-id>");
      return;
    }

    try {
      const client = getClient();
      await client.session.delete({ path: { id } });

      if (getActiveSessionId() === id) {
        clearActiveSession();
      }
      await ctx.reply(`Session \`${id}\` deleted.`, { parse_mode: "Markdown" });
    } catch (err: any) {
      await ctx.reply(`Error: ${err.message}`);
    }
  });

  bot.command("current", async (ctx) => {
    const activeId = getActiveSessionId();
    if (!activeId) {
      await ctx.reply("No active session. Send a message or use /new to create one.");
      return;
    }

    try {
      const client = getClient();
      const result = await client.session.get({ path: { id: activeId } });

      if (result.error) {
        await ctx.reply(`Could not fetch session: ${activeId}`);
        return;
      }

      const s = result.data!;
      const created = new Date(s.time.created).toLocaleString();
      const updated = new Date(s.time.updated).toLocaleString();
      await ctx.reply(
        `**${s.title}**\nID: \`${s.id}\`\nCreated: ${created}\nUpdated: ${updated}`,
        { parse_mode: "Markdown" }
      );
    } catch (err: any) {
      await ctx.reply(`Error: ${err.message}`);
    }
  });
}
