import type { Bot } from "grammy";
import { getClient } from "../client.js";
import { setSelectedModel, getSelectedModel } from "../session.js";

export function registerAdminCommands(bot: Bot): void {
  bot.command("health", async (ctx) => {
    try {
      const client = getClient();
      const result = await client.global.event();
      await ctx.reply("OpenCode server is reachable.");
    } catch (err: any) {
      await ctx.reply(`Server unreachable: ${err.message}`);
    }
  });

  bot.command("config", async (ctx) => {
    try {
      const client = getClient();
      const result = await client.config.get();

      if (result.error) {
        await ctx.reply("Failed to get config.");
        return;
      }

      const text = "```json\n" + JSON.stringify(result.data, null, 2) + "\n```";
      try {
        await ctx.reply(text, { parse_mode: "Markdown" });
      } catch {
        await ctx.reply(JSON.stringify(result.data, null, 2));
      }
    } catch (err: any) {
      await ctx.reply(`Error: ${err.message}`);
    }
  });

  bot.command("providers", async (ctx) => {
    try {
      const client = getClient();
      const result = await client.config.providers();

      if (result.error) {
        await ctx.reply("Failed to get providers.");
        return;
      }

      const text = "```json\n" + JSON.stringify(result.data, null, 2) + "\n```";
      try {
        await ctx.reply(text, { parse_mode: "Markdown" });
      } catch {
        await ctx.reply(JSON.stringify(result.data, null, 2));
      }
    } catch (err: any) {
      await ctx.reply(`Error: ${err.message}`);
    }
  });

  bot.command("agents", async (ctx) => {
    try {
      const client = getClient();
      const result = await client.app.agents();

      if (result.error) {
        await ctx.reply("Failed to list agents.");
        return;
      }

      const agents = result.data ?? [];
      if (Array.isArray(agents) && agents.length === 0) {
        await ctx.reply("No agents available.");
        return;
      }

      const text = "```json\n" + JSON.stringify(agents, null, 2) + "\n```";
      try {
        await ctx.reply(text, { parse_mode: "Markdown" });
      } catch {
        await ctx.reply(JSON.stringify(agents, null, 2));
      }
    } catch (err: any) {
      await ctx.reply(`Error: ${err.message}`);
    }
  });

  bot.command("model", async (ctx) => {
    const input = ctx.match?.trim();
    if (!input) {
      const current = getSelectedModel();
      if (current) {
        await ctx.reply(`Current model: \`${current.providerID}/${current.modelID}\``, {
          parse_mode: "Markdown",
        });
      } else {
        await ctx.reply(
          "No model set (using server default).\nUsage: /model <providerID/modelID>"
        );
      }
      return;
    }

    const parts = input.split("/");
    if (parts.length < 2) {
      await ctx.reply("Usage: /model <providerID/modelID>\nExample: /model anthropic/claude-3-5-sonnet-20241022");
      return;
    }

    const providerID = parts[0];
    const modelID = parts.slice(1).join("/");
    setSelectedModel(providerID, modelID);
    await ctx.reply(`Model set to \`${providerID}/${modelID}\``, { parse_mode: "Markdown" });
  });

  bot.command("start", async (ctx) => {
    await ctx.reply(
      "Welcome to **OCBot** — OpenCode from Telegram!\n\n" +
        "Just send a message to chat with the AI, or use commands:\n\n" +
        "/help — Show all commands\n" +
        "/new — Create a new session\n" +
        "/sessions — List sessions\n" +
        "/health — Check server status",
      { parse_mode: "Markdown" }
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "**OCBot Commands**\n\n" +
        "**Chat:**\n" +
        "Send any text message to chat with AI\n\n" +
        "**Sessions:**\n" +
        "/new [title] — Create new session\n" +
        "/sessions — List all sessions\n" +
        "/switch <id> — Switch active session\n" +
        "/delete <id> — Delete a session\n" +
        "/current — Show active session\n\n" +
        "**Files:**\n" +
        "/read <path> — Read a file\n" +
        "/search <pattern> — Search text in files\n" +
        "/find <query> — Find files by name\n" +
        "/symbols <query> — Find code symbols\n" +
        "/status — Git file status\n\n" +
        "**Shell:**\n" +
        "/shell <cmd> — Run shell command\n" +
        "/cmd <command> — Run OpenCode command\n\n" +
        "**History:**\n" +
        "/history — Show conversation history\n" +
        "/abort — Cancel current operation\n" +
        "/share — Share session\n" +
        "/revert — Revert last change\n" +
        "/summarize — Summarize session\n\n" +
        "**Admin:**\n" +
        "/health — Check server health\n" +
        "/config — Show config\n" +
        "/providers — List AI providers\n" +
        "/agents — List agents\n" +
        "/model <provider/model> — Change model",
      { parse_mode: "Markdown" }
    );
  });
}
