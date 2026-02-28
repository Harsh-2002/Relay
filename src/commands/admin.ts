import type { Bot } from "grammy";
import { InputFile, InlineKeyboard } from "grammy";
import type { ModelDetail } from "../providers/types.js";
import { getProvider, getProviderName } from "../providers/index.js";
import { setSelectedModel, getSelectedModel } from "../session.js";
import { chunkMessage } from "../utils/chunker.js";
import { isSttAvailable, getSttProvider } from "../utils/stt.js";
import { isStreamingEnabled } from "../utils/stream.js";
import { getSystemPrompt, reloadSystemPrompt, isUsingCustomPrompt } from "../utils/system-prompt.js";
import { formatCatchError } from "../utils/errors.js";
import { escapeHtml } from "../utils/html.js";

const MODELS_PER_PAGE = 8;

const SENSITIVE_KEYS = new Set([
  "botToken",
  "groqApiKey",
  "openaiSttApiKey",
  "assemblyaiApiKey",
  "webhookSecret",
]);

function buildModelKeyboard(
  models: ModelDetail[],
  page: number,
  selectedModel?: { providerID: string; modelID: string } | null,
): { keyboard: InlineKeyboard; text: string } {
  // Group by provider
  const grouped = new Map<string, ModelDetail[]>();
  for (const m of models) {
    const list = grouped.get(m.provider) ?? [];
    list.push(m);
    grouped.set(m.provider, list);
  }

  // Flatten into display order with provider headers
  const items: { type: "header"; provider: string }[] | { type: "model"; model: ModelDetail }[] = [];
  const allItems: ({ type: "header"; provider: string } | { type: "model"; model: ModelDetail })[] = [];
  for (const [provId, provModels] of grouped) {
    allItems.push({ type: "header", provider: provId });
    for (const m of provModels) {
      allItems.push({ type: "model", model: m });
    }
  }

  // Count total model items (excluding headers) for pagination
  const modelItems = allItems.filter(i => i.type === "model");
  const totalPages = Math.max(1, Math.ceil(modelItems.length / MODELS_PER_PAGE));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));

  // Get the slice of models for this page
  const pageModels = modelItems.slice(safePage * MODELS_PER_PAGE, (safePage + 1) * MODELS_PER_PAGE);
  const pageModelIds = new Set(pageModels.map(i => i.type === "model" ? i.model.id : ""));

  // Build keyboard
  const kb = new InlineKeyboard();
  let headerText = `<b>Available Models</b>  (${modelItems.length})`;
  if (totalPages > 1) headerText += `  —  page ${safePage + 1}/${totalPages}`;

  // Figure out which providers appear on this page
  const pageProviders = new Set<string>();
  for (const item of pageModels) {
    if (item.type === "model") pageProviders.add(item.model.provider);
  }

  let lastProvider = "";
  for (const item of pageModels) {
    if (item.type !== "model") continue;
    const m = item.model;

    // Add provider header row if new provider
    if (m.provider !== lastProvider) {
      kb.row().text(`— ${m.provider} —`, "mdl_noop");
      lastProvider = m.provider;
    }

    const isActive =
      selectedModel?.providerID === m.provider && selectedModel?.modelID === m.id;

    const badges: string[] = [];
    if (m.reasoning) badges.push("reasoning");
    if (m.attachment) badges.push("vision");
    const badgeStr = badges.length > 0 ? "  [" + badges.join(", ") + "]" : "";

    const label = isActive ? `✓ ${m.name}${badgeStr}` : `${m.name}${badgeStr}`;
    const callbackData = `mdl:${m.provider}/${m.id}`;

    kb.row().text(label, callbackData);
  }

  // Pagination row
  if (totalPages > 1) {
    kb.row();
    if (safePage > 0) {
      kb.text("« Prev", `mdl_pg:${safePage - 1}`);
    }
    kb.text(`${safePage + 1}/${totalPages}`, "mdl_noop");
    if (safePage < totalPages - 1) {
      kb.text("Next »", `mdl_pg:${safePage + 1}`);
    }
  }

  return { keyboard: kb, text: headerText };
}

function formatConfigResponse(data: any): string {
  if (!data || typeof data !== "object") {
    return "No configuration data available.";
  }

  const entries = Object.entries(data);
  if (entries.length === 0) {
    return "Configuration is empty.";
  }

  let text = "<b>Configuration</b>\n\n";
  for (const [key, value] of entries) {
    if (value === undefined || value === null || value === "") continue;
    const displayValue = SENSITIVE_KEYS.has(key)
      ? "••••••"
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
    text += `<b>${escapeHtml(key)}:</b>  <code>${escapeHtml(displayValue)}</code>\n`;
  }

  return text;
}

function formatProvidersResponse(data: any): string {
  if (!data) return "No provider data available.";

  const items = Array.isArray(data) ? data : [data];
  if (items.length === 0) return "No providers found.";

  let text = `<b>Providers</b>  (${items.length})\n\n`;
  for (const p of items) {
    const name = p.name ?? p.id ?? "unknown";
    text += `<b>${escapeHtml(name)}</b>`;
    if (p.id && p.id !== name) text += `  <code>${escapeHtml(p.id)}</code>`;
    if (p.status) text += `  —  ${escapeHtml(p.status)}`;
    text += "\n";
    if (p.models && Array.isArray(p.models)) {
      text += `  Models: ${p.models.length}\n`;
    }
  }

  return text;
}

function formatAgentsResponse(data: any): string {
  if (!data) return "No agent data available.";

  const items = Array.isArray(data) ? data : [data];
  if (items.length === 0) return "No agents available.";

  let text = `<b>Agents</b>  (${items.length})\n\n`;
  for (const a of items) {
    const name = a.name ?? a.id ?? "unknown";
    text += `<code>${escapeHtml(name)}</code>`;
    if (a.description) text += ` — ${escapeHtml(a.description)}`;
    text += "\n";
  }

  return text;
}

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
      const text = formatConfigResponse(config);
      const chunks = chunkMessage(text);
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: "HTML" });
      }
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "fetching config"), { parse_mode: "HTML" });
    }
  });

  bot.command("providers", async (ctx) => {
    try {
      const provider = getProvider();
      const providers = await provider.getProviders();
      const text = formatProvidersResponse(providers);
      const chunks = chunkMessage(text);
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: "HTML" });
      }
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
          `Agent listing is not supported by the <b>${escapeHtml(provider.name)}</b> provider.`,
          { parse_mode: "HTML" }
        );
        return;
      }

      if (agents.length === 0) {
        await ctx.reply("No agents available.", { parse_mode: "HTML" });
        return;
      }

      const text = formatAgentsResponse(agents);
      const chunks = chunkMessage(text);
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: "HTML" });
      }
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
          `Project info is not available for the <b>${escapeHtml(provider.name)}</b> provider.`,
          { parse_mode: "HTML" }
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
          `Git info is not available for the <b>${escapeHtml(provider.name)}</b> provider.`,
          { parse_mode: "HTML" }
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
          `Tool listing is not supported by the <b>${escapeHtml(provider.name)}</b> provider.`,
          { parse_mode: "HTML" }
        );
        return;
      }

      if (ids.length === 0) {
        await ctx.reply("No tools available.", { parse_mode: "HTML" });
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
        await ctx.reply("No models available.", { parse_mode: "HTML" });
        return;
      }

      // Mark the active model
      for (const m of models) {
        if (selected && selected.providerID === m.provider && selected.modelID === m.id) {
          m.active = true;
        }
      }

      const { keyboard, text } = buildModelKeyboard(models, 0, selected);
      await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
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

  // --- Callback query handlers for model selection ---

  bot.callbackQuery(/^mdl:(.+)$/, async (ctx) => {
    try {
      const data = ctx.match[1];
      const slashIdx = data.indexOf("/");
      if (slashIdx === -1) {
        await ctx.answerCallbackQuery({ text: "Invalid model" });
        return;
      }

      const providerID = data.slice(0, slashIdx);
      const modelID = data.slice(slashIdx + 1);
      setSelectedModel(providerID, modelID);

      // Build capability string
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
        // Ignore — capabilities are optional info
      }

      await ctx.editMessageText(
        `Model set to <code>${escapeHtml(providerID)}/${escapeHtml(modelID)}</code>${capStr}`,
        { parse_mode: "HTML" },
      );
      await ctx.answerCallbackQuery({ text: "Model selected!" });
    } catch (err: any) {
      await ctx.answerCallbackQuery({ text: "Failed to set model" });
    }
  });

  bot.callbackQuery(/^mdl_pg:(\d+)$/, async (ctx) => {
    try {
      const page = parseInt(ctx.match[1], 10);
      const provider = getProvider();
      const models = await provider.listModels();
      const selected = getSelectedModel();

      // Mark active
      for (const m of models) {
        if (selected && selected.providerID === m.provider && selected.modelID === m.id) {
          m.active = true;
        }
      }

      const { keyboard, text } = buildModelKeyboard(models, page, selected);
      await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
      await ctx.answerCallbackQuery();
    } catch (err: any) {
      await ctx.answerCallbackQuery({ text: "Failed to load page" });
    }
  });

  bot.callbackQuery("mdl_noop", async (ctx) => {
    await ctx.answerCallbackQuery();
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
    const source = isUsingCustomPrompt() ? "Custom (SKILL.md)" : "Default (built-in)";
    const header = `<b>System Prompt</b>\n<b>Source:</b>  ${source}  |  <b>Length:</b>  ${prompt.length} chars\n\n`;
    const text = header + `<pre>${escapeHtml(prompt)}</pre>`;
    const chunks = chunkMessage(text);
    for (const chunk of chunks) {
      await ctx.reply(chunk, { parse_mode: "HTML" });
    }
  });

  bot.command("start", async (ctx) => {
    const providerName = getProviderName();
    await ctx.reply(
      `Hey! Send me a message and I'll pass it to the AI.\n\n` +
      `<b>Provider:</b> ${escapeHtml(providerName)}\n\n` +
      `You can also send voice notes, photos, or files.\n\n` +
      `Type /help to see all commands.`,
      { parse_mode: "HTML" }
    );
  });

  bot.command("help", async (ctx) => {
    const providerName = getProviderName();
    const provider = getProvider();
    const caps = provider.capabilities;

    let text =
      `<b>Relay</b> — ${providerName} provider\n\n` +

      `<b>Chat</b>\n` +
      `Just send any text, voice, photo, or file\n\n` +

      `<b>Sessions</b>\n` +
      `/new  —  New session\n` +
      `/sessions  —  List sessions\n` +
      `/switch <code>id</code>  —  Switch session\n` +
      `/delete <code>id</code>  —  Delete session\n` +
      `/current  —  Active session\n`;

    if (caps.fork) {
      text += `/fork <code>[messageId]</code>  —  Fork session\n`;
    }
    text += `\n`;

    if (caps.todos || caps.diff) {
      text += `<b>Monitor</b>\n`;
      if (caps.todos) text += `/todo  —  AI task checklist\n`;
      if (caps.diff) {
        text += `/diff  —  Session code changes\n`;
        text += `/diff full  —  Download full diff\n`;
      }
      text += `\n`;
    }

    if (caps.fileOps) {
      text +=
        `<b>Files</b>\n` +
        `/read <code>path</code>  —  Read file\n` +
        `/find <code>query</code>  —  Find files\n` +
        `/search <code>pattern</code>  —  Search in files\n` +
        `/symbols <code>query</code>  —  Find symbols\n` +
        `/status  —  Git status\n\n`;
    }

    text += `<b>History</b>\n`;
    if (caps.history) text += `/history  —  Conversation history\n`;
    if (caps.summarize) text += `/summarize  —  Summarize session\n`;
    if (caps.revert) text += `/revert  —  Undo last change\n`;
    text += `/abort  —  Cancel operation\n`;
    if (caps.share) text += `/share  —  Share session\n`;
    text += `\n`;

    if (caps.shell) {
      text += `<b>Shell</b>\n`;
      text += `/shell <code>cmd</code>  —  Run command\n`;
      if (caps.commands) {
        text += `/cmd <code>command</code>  —  OpenCode command\n`;
        text += `/commands  —  List available commands\n`;
      }
      text += `\n`;
    }

    if (caps.mcp) {
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
