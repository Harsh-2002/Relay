import type { Bot } from "grammy";
import { InputFile } from "grammy";
import { getClient } from "../client.js";
import { setSelectedModel, getSelectedModel } from "../session.js";
import { chunkMessage } from "../utils/chunker.js";
import { isSttAvailable, getSttProvider } from "../utils/stt.js";
import { isStreamingEnabled } from "../utils/stream.js";
import { getSystemPrompt, reloadSystemPrompt, isUsingCustomPrompt } from "../utils/system-prompt.js";
import { formatSdkError, formatCatchError } from "../utils/errors.js";

export function registerAdminCommands(bot: Bot): void {
  bot.command("health", async (ctx) => {
    try {
      const client = getClient();
      const result = await client.config.get();
      if (result.error) {
        await ctx.reply(formatSdkError(result.error), { parse_mode: "HTML" });
        return;
      }
      const streaming = isStreamingEnabled() ? "Enabled" : "Disabled";
      const sttProvider = getSttProvider();
      const stt = sttProvider ? `${sttProvider}` : "Not configured";
      const prompt = getSystemPrompt();
      const promptSource = isUsingCustomPrompt() ? "Custom" : "Default";
      const model = getSelectedModel();
      const modelStr = model ? `${model.providerID}/${model.modelID}` : "Server default";
      await ctx.reply(
        `<b>Server Status</b>\n\n` +
        `<b>Status:</b>  Healthy\n` +
        `<b>Model:</b>  <code>${modelStr}</code>\n` +
        `<b>Streaming:</b>  ${streaming}\n` +
        `<b>Voice STT:</b>  ${stt}\n` +
        `<b>System Prompt:</b>  ${promptSource} (${prompt.length} chars)`,
        { parse_mode: "HTML" }
      );
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "checking server health"), { parse_mode: "HTML" });
    }
  });

  bot.command("config", async (ctx) => {
    try {
      const client = getClient();
      const result = await client.config.get();

      if (result.error) {
        await ctx.reply(formatSdkError(result.error), { parse_mode: "HTML" });
        return;
      }

      await sendJsonResponse(ctx, result.data, "config.json");
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "fetching config"), { parse_mode: "HTML" });
    }
  });

  bot.command("providers", async (ctx) => {
    try {
      const client = getClient();
      const result = await client.config.providers();

      if (result.error) {
        await ctx.reply(formatSdkError(result.error), { parse_mode: "HTML" });
        return;
      }

      await sendJsonResponse(ctx, result.data, "providers.json");
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "fetching providers"), { parse_mode: "HTML" });
    }
  });

  bot.command("agents", async (ctx) => {
    try {
      const client = getClient();
      const result = await client.app.agents();

      if (result.error) {
        await ctx.reply(formatSdkError(result.error), { parse_mode: "HTML" });
        return;
      }

      const agents = result.data ?? [];
      if (Array.isArray(agents) && agents.length === 0) {
        await ctx.reply("No agents available.");
        return;
      }

      await sendJsonResponse(ctx, agents, "agents.json");
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "listing agents"), { parse_mode: "HTML" });
    }
  });

  bot.command("model", async (ctx) => {
    const input = ctx.match?.trim();
    if (!input) {
      const current = getSelectedModel();
      if (current) {
        await ctx.reply(
          `<b>Current model:</b>  <code>${current.providerID}/${current.modelID}</code>`,
          { parse_mode: "HTML" }
        );
      } else {
        await ctx.reply(
          `No model set — using server default.\n\n<b>Usage:</b>  <code>/model provider/model</code>`,
          { parse_mode: "HTML" }
        );
      }
      return;
    }

    const parts = input.split("/");
    if (parts.length < 2) {
      await ctx.reply(
        `<b>Usage:</b>  <code>/model provider/model</code>\n<b>Example:</b>  <code>/model anthropic/claude-sonnet-4-20250514</code>`,
        { parse_mode: "HTML" }
      );
      return;
    }

    const providerID = parts[0];
    const modelID = parts.slice(1).join("/");
    setSelectedModel(providerID, modelID);
    await ctx.reply(
      `Model set to <code>${providerID}/${modelID}</code>`,
      { parse_mode: "HTML" }
    );
  });

  bot.command("system", async (ctx) => {
    const action = ctx.match?.trim();

    if (action === "reload") {
      const prompt = reloadSystemPrompt();
      const source = isUsingCustomPrompt() ? "Custom file" : "Default";
      await ctx.reply(
        `System prompt reloaded.\n<b>Source:</b>  ${source}  |  <b>Length:</b>  ${prompt.length} chars`,
        { parse_mode: "HTML" }
      );
      return;
    }

    const prompt = getSystemPrompt();
    const source = isUsingCustomPrompt() ? "Custom (skill.md)" : "Default (built-in)";
    const escaped = escapeHtml(prompt.length > 500 ? prompt.slice(0, 500) + "\n\n...(truncated)" : prompt);
    await ctx.reply(
      `<b>System Prompt</b>\n` +
      `<b>Source:</b>  ${source}  |  <b>Length:</b>  ${prompt.length} chars\n\n` +
      `<pre>${escaped}</pre>`,
      { parse_mode: "HTML" }
    );
  });

  bot.command("start", async (ctx) => {
    await ctx.reply(
      `Hey! Send me a message and I'll pass it to the AI.\n\n` +
      `You can also send voice notes, photos, or files.\n\n` +
      `Type /help to see all commands.`,
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      `<b>Chat</b>\n` +
      `Just send any text, voice, photo, or file\n\n` +

      `<b>Sessions</b>\n` +
      `/new  —  New session\n` +
      `/sessions  —  List sessions\n` +
      `/switch <code>id</code>  —  Switch session\n` +
      `/delete <code>id</code>  —  Delete session\n` +
      `/current  —  Active session\n\n` +

      `<b>Files</b>\n` +
      `/read <code>path</code>  —  Read file\n` +
      `/find <code>query</code>  —  Find files\n` +
      `/search <code>pattern</code>  —  Search in files\n` +
      `/symbols <code>query</code>  —  Find symbols\n` +
      `/status  —  Git status\n\n` +

      `<b>History</b>\n` +
      `/history  —  Conversation history\n` +
      `/summarize  —  Summarize session\n` +
      `/revert  —  Undo last change\n` +
      `/abort  —  Cancel operation\n` +
      `/share  —  Share session\n\n` +

      `<b>Shell</b>\n` +
      `/shell <code>cmd</code>  —  Run command\n` +
      `/cmd <code>command</code>  —  OpenCode command\n\n` +

      `<b>Settings</b>\n` +
      `/model <code>provider/model</code>  —  Change model\n` +
      `/system  —  View system prompt\n` +
      `/system reload  —  Reload prompt\n` +
      `/health  —  Server status\n` +
      `/config  —  Show config\n` +
      `/providers  —  List providers\n` +
      `/agents  —  List agents`,
      { parse_mode: "HTML" }
    );
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function sendJsonResponse(ctx: any, data: any, filename: string): Promise<void> {
  const json = JSON.stringify(data, null, 2);

  if (json.length > 3500) {
    const buffer = Buffer.from(json, "utf-8");
    await ctx.replyWithDocument(new InputFile(buffer, filename));
    return;
  }

  const text = "```json\n" + json + "\n```";
  const chunks = chunkMessage(text);
  for (const chunk of chunks) {
    try {
      await ctx.reply(chunk, { parse_mode: "Markdown" });
    } catch {
      await ctx.reply(chunk);
    }
  }
}
