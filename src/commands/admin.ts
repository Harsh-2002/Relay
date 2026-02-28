import type { Bot } from "grammy";
import { InputFile } from "grammy";
import { getProvider, getProviderName } from "../providers/index.js";
import { setSelectedModel, getSelectedModel } from "../session.js";
import { chunkMessage } from "../utils/chunker.js";
import { isSttAvailable, getSttProvider } from "../utils/stt.js";
import { isStreamingEnabled } from "../utils/stream.js";
import { getSystemPrompt, reloadSystemPrompt, isUsingCustomPrompt } from "../utils/system-prompt.js";
import { formatCatchError } from "../utils/errors.js";
import { escapeHtml } from "../utils/html.js";

export function registerAdminCommands(bot: Bot): void {
  bot.command("health", async (ctx) => {
    try {
      const provider = getProvider();
      const health = await provider.getHealth();

      const streaming = isStreamingEnabled() ? "Enabled" : "Disabled";
      const sttProvider = getSttProvider();
      const stt = sttProvider ? `${sttProvider}` : "Not configured";
      const prompt = getSystemPrompt();
      const promptSource = isUsingCustomPrompt() ? "Custom" : "Default";
      const model = getSelectedModel();
      const modelStr = model
        ? `${model.providerID}/${model.modelID}`
        : health.model ?? "Server default";

      // Check reasoning capability for current model
      let reasoningBadge = "";
      try {
        const models = await provider.listModels();
        const activeModel = model
          ? models.find(m => m.id === model.modelID && m.provider === model.providerID)
          : models.find(m => m.active);
        if (activeModel?.reasoning) {
          reasoningBadge = "  [reasoning]";
        }
      } catch {
        // Ignore — optional info
      }

      let text =
        `<b>Server Status</b>\n\n` +
        `<b>Provider:</b>  <code>${health.provider}</code>\n` +
        `<b>Status:</b>  ${health.status}\n` +
        `<b>Model:</b>  <code>${modelStr}</code>${reasoningBadge}\n` +
        `<b>Streaming:</b>  ${streaming}\n` +
        `<b>Voice STT:</b>  ${stt}\n` +
        `<b>System Prompt:</b>  ${promptSource} (${prompt.length} chars)`;

      if (health.project) {
        text += `\n\n<b>Project:</b>  <code>${escapeHtml(health.project)}</code>`;
      }
      if (health.branch) {
        text += `\n<b>Branch:</b>  <code>${escapeHtml(health.branch)}</code>`;
      }
      if (health.extra) {
        for (const [key, value] of Object.entries(health.extra)) {
          text += `\n<b>${escapeHtml(key)}:</b>  <code>${escapeHtml(value)}</code>`;
        }
      }

      await ctx.reply(text, { parse_mode: "HTML" });
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "checking server health"), { parse_mode: "HTML" });
    }
  });

  bot.command("config", async (ctx) => {
    try {
      const provider = getProvider();
      const config = await provider.getConfig();
      await sendJsonResponse(ctx, config, "config.json");
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "fetching config"), { parse_mode: "HTML" });
    }
  });

  bot.command("providers", async (ctx) => {
    try {
      const provider = getProvider();
      const providers = await provider.getProviders();
      await sendJsonResponse(ctx, providers, "providers.json");
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "fetching providers"), { parse_mode: "HTML" });
    }
  });

  bot.command("agents", async (ctx) => {
    try {
      const provider = getProvider();
      const agents = await provider.getAgents();

      if (agents === null) {
        await ctx.reply(
          `Agent listing is not supported by the ${provider.name} provider.`
        );
        return;
      }

      if (agents.length === 0) {
        await ctx.reply("No agents available.");
        return;
      }

      await sendJsonResponse(ctx, agents, "agents.json");
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "listing agents"), { parse_mode: "HTML" });
    }
  });

  bot.command("project", async (ctx) => {
    try {
      const provider = getProvider();
      const proj = await provider.getProjectInfo();

      if (!proj) {
        await ctx.reply(
          `Project info is not available for the ${provider.name} provider.`
        );
        return;
      }

      let text = `<b>Project Info</b>\n\n`;

      if (proj.id) text += `<b>ID:</b>  <code>${escapeHtml(proj.id)}</code>\n`;
      if (proj.worktree) text += `<b>Worktree:</b>  <code>${escapeHtml(proj.worktree)}</code>\n`;
      if (proj.vcs) text += `<b>VCS:</b>  ${escapeHtml(proj.vcs)}\n`;
      if (proj.branch) text += `<b>Branch:</b>  <code>${escapeHtml(proj.branch)}</code>\n`;
      if (proj.directory) text += `<b>Directory:</b>  <code>${escapeHtml(proj.directory)}</code>\n`;

      await ctx.reply(text, { parse_mode: "HTML" });
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "fetching project info"), { parse_mode: "HTML" });
    }
  });

  bot.command("git", async (ctx) => {
    try {
      const provider = getProvider();

      // Use provider's file status and project info for git data
      const [projectInfo, fileStatus] = await Promise.all([
        provider.getProjectInfo(),
        provider.getFileStatus(),
      ]);

      if (!projectInfo?.branch && fileStatus === null) {
        await ctx.reply(
          `Git info is not directly available for the ${provider.name} provider.`
        );
        return;
      }

      let text =
        `<b>Git Info</b>\n\n` +
        `<b>Branch:</b>  <code>${escapeHtml(projectInfo?.branch ?? "unknown")}</code>\n`;

      if (fileStatus === null) {
        text += `<b>Status:</b>  Not available`;
      } else if (fileStatus.length === 0) {
        text += `<b>Status:</b>  Clean working tree`;
      } else {
        text += `<b>Changed files:</b>  ${fileStatus.length}\n\n`;
        text += fileStatus
          .slice(0, 30)
          .map((f) => `<code>${escapeHtml(f.status)}</code>  ${escapeHtml(f.path)}`)
          .join("\n");
        if (fileStatus.length > 30) {
          text += `\n\n<i>...and ${fileStatus.length - 30} more</i>`;
        }
      }

      const chunks = chunkMessage(text);
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: "HTML" });
      }
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "fetching git info"), { parse_mode: "HTML" });
    }
  });

  bot.command("tools", async (ctx) => {
    try {
      const provider = getProvider();
      const ids = await provider.getTools();

      if (ids === null) {
        await ctx.reply(
          `Tool listing is not supported by the ${provider.name} provider.`
        );
        return;
      }

      if (ids.length === 0) {
        await ctx.reply("No tools available.");
        return;
      }

      const text =
        `<b>Available Tools</b>  (${ids.length})\n\n` +
        ids.map((id) => `<code>${escapeHtml(id)}</code>`).join("\n");

      const chunks = chunkMessage(text);
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: "HTML" });
      }
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "listing tools"), { parse_mode: "HTML" });
    }
  });

  bot.command("models", async (ctx) => {
    try {
      const provider = getProvider();
      const models = await provider.listModels();
      const selected = getSelectedModel();

      if (models.length === 0) {
        await ctx.reply("No models available.");
        return;
      }

      // Mark the active model
      for (const m of models) {
        if (selected && selected.providerID === m.provider && selected.modelID === m.id) {
          m.active = true;
        }
      }

      // Group by provider
      const grouped = new Map<string, typeof models>();
      for (const m of models) {
        const list = grouped.get(m.provider) ?? [];
        list.push(m);
        grouped.set(m.provider, list);
      }

      let text = `<b>Available Models</b>\n`;

      for (const [provId, provModels] of grouped) {
        text += `\n<b>${escapeHtml(provId)}</b>\n`;
        for (const m of provModels) {
          const badges: string[] = [];
          if (m.reasoning) badges.push("reasoning");
          if (m.attachment) badges.push("vision");
          if (m.active) badges.push("active");

          const badgeStr = badges.length > 0 ? "  " + badges.map(b => `[${b}]`).join(" ") : "";
          text += `  <code>${escapeHtml(m.id)}</code>${badgeStr}\n`;
        }
      }

      text += `\n<i>Use /model provider/model to switch</i>`;

      const chunks = chunkMessage(text);
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: "HTML" });
      }
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "listing models"), { parse_mode: "HTML" });
    }
  });

  bot.command("model", async (ctx) => {
    const input = ctx.match?.trim();
    if (!input) {
      const current = getSelectedModel();
      if (current) {
        // Try to show capabilities for the current model
        let capStr = "";
        try {
          const provider = getProvider();
          const models = await provider.listModels();
          const match = models.find(m => m.id === current.modelID && m.provider === current.providerID);
          if (match) {
            const caps: string[] = [];
            if (match.reasoning) caps.push("reasoning");
            if (match.attachment) caps.push("vision");
            capStr = caps.length > 0 ? `\n<b>Capabilities:</b>  ${caps.join(", ")}` : "";
          }
        } catch {
          // Ignore — capabilities are optional info
        }
        await ctx.reply(
          `<b>Current model:</b>  <code>${current.providerID}/${current.modelID}</code>${capStr}\n\n<i>Use /models to list available models</i>`,
          { parse_mode: "HTML" }
        );
      } else {
        await ctx.reply(
          `No model set — using server default.\n\n<b>Usage:</b>  <code>/model provider/model</code>\n<i>Use /models to list available models</i>`,
          { parse_mode: "HTML" }
        );
      }
      return;
    }

    // Try partial match if no "/" in input
    if (!input.includes("/")) {
      try {
        const provider = getProvider();
        const models = await provider.listModels();
        const match = models.find(m => m.id === input || m.id.includes(input) || m.name.toLowerCase().includes(input.toLowerCase()));
        if (match) {
          setSelectedModel(match.provider, match.id);
          const caps: string[] = [];
          if (match.reasoning) caps.push("reasoning");
          if (match.attachment) caps.push("vision");
          const capStr = caps.length > 0 ? `\n<b>Capabilities:</b>  ${caps.join(", ")}` : "";
          await ctx.reply(
            `Model set to <code>${match.provider}/${match.id}</code>${capStr}`,
            { parse_mode: "HTML" }
          );
          return;
        }
      } catch {
        // Fall through to usage message
      }

      await ctx.reply(
        `<b>Usage:</b>  <code>/model provider/model</code>\n<b>Example:</b>  <code>/model anthropic/claude-sonnet-4-20250514</code>\n\n<i>Use /models to list available models</i>`,
        { parse_mode: "HTML" }
      );
      return;
    }

    const parts = input.split("/");
    const providerID = parts[0];
    const modelID = parts.slice(1).join("/");
    setSelectedModel(providerID, modelID);

    // Show capabilities if available
    let capStr = "";
    try {
      const provider = getProvider();
      const models = await provider.listModels();
      const match = models.find(m => m.id === modelID && m.provider === providerID);
      if (match) {
        const caps: string[] = [];
        if (match.reasoning) caps.push("reasoning");
        if (match.attachment) caps.push("vision");
        capStr = caps.length > 0 ? `\n<b>Capabilities:</b>  ${caps.join(", ")}` : "";
      }
    } catch {
      // Ignore
    }

    await ctx.reply(
      `Model set to <code>${providerID}/${modelID}</code>${capStr}`,
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
    const providerName = getProviderName();
    await ctx.reply(
      `Hey! Send me a message and I'll pass it to the AI.\n\n` +
      `Provider: ${providerName}\n\n` +
      `You can also send voice notes, photos, or files.\n\n` +
      `Type /help to see all commands.`,
    );
  });

  bot.command("help", async (ctx) => {
    const providerName = getProviderName();
    const isOpencode = providerName === "opencode";

    let text =
      `<b>OCBot</b> — ${providerName} provider\n\n` +

      `<b>Chat</b>\n` +
      `Just send any text, voice, photo, or file\n\n` +

      `<b>Sessions</b>\n` +
      `/new  —  New session\n` +
      `/sessions  —  List sessions\n` +
      `/switch <code>id</code>  —  Switch session\n` +
      `/delete <code>id</code>  —  Delete session\n` +
      `/current  —  Active session\n` +
      `/fork <code>[messageId]</code>  —  Fork session\n\n`;

    if (isOpencode) {
      text +=
        `<b>Monitor</b>\n` +
        `/todo  —  AI task checklist\n` +
        `/diff  —  Session code changes\n` +
        `/diff full  —  Download full diff\n\n`;
    }

    text +=
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
      `/shell <code>cmd</code>  —  Run command\n`;

    if (isOpencode) {
      text +=
        `/cmd <code>command</code>  —  OpenCode command\n` +
        `/commands  —  List available commands\n\n`;
    } else {
      text += `\n`;
    }

    const provider = getProvider();

    if (provider.capabilities.mcp) {
      text +=
        `<b>MCP</b>\n` +
        `/mcp  —  MCP server status\n` +
        `/mcp add <code>name</code> local <code>cmd</code>  —  Add local MCP\n` +
        `/mcp add <code>name</code> remote <code>url</code>  —  Add remote MCP\n` +
        `/mcp remove <code>name</code>  —  Remove MCP server\n\n`;
    }

    text +=
      `<b>Settings</b>\n` +
      `/model <code>provider/model</code>  —  Change model\n` +
      `/models  —  List available models\n` +
      `/system  —  View system prompt\n` +
      `/system reload  —  Reload prompt\n` +
      `/health  —  Server status\n` +
      `/config  —  Show config\n` +
      `/providers  —  List providers\n` +
      `/agents  —  List agents\n` +
      `/tools  —  Available tools\n` +
      `/project  —  Project info\n` +
      `/git  —  Git branch + status`;

    await ctx.reply(text, { parse_mode: "HTML" });
  });
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
