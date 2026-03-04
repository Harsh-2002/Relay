import type { Bot } from "grammy";
import { InputFile, InlineKeyboard } from "grammy";
import type { ModelDetail } from "../providers/types.js";
import { getProvider } from "../providers/index.js";
import { setSelectedModel, getSelectedModel, getSelectedAgent, setSelectedAgent, clearSelectedAgent, getSelectedSttProvider, setSelectedSttProvider, clearSelectedSttProvider } from "../session.js";
import { chunkMessage } from "../utils/chunker.js";
import { isSttAvailable, getSttProvider, listSttProviders } from "../utils/stt.js";

import { getSystemPrompt, reloadSystemPrompt, isUsingCustomPrompt } from "../utils/system-prompt.js";
import { formatCatchError, isNotModified } from "../utils/errors.js";
import { escapeHtml } from "../utils/html.js";
import { isServerDown } from "../lifecycle.js";

const PROVIDER_MODELS_PER_PAGE = 8;

const SENSITIVE_KEYS = new Set([
  "botToken",
  "groqApiKey",
  "openaiSttApiKey",
  "assemblyaiApiKey",
  "sarvamApiKey",
  "webhookSecret",
]);

function buildGroupKeyboard(
  models: ModelDetail[],
  selectedModel?: { providerID: string; modelID: string } | null,
): { keyboard: InlineKeyboard; text: string } {
  // Count models per provider ID, track display name
  const providerInfo = new Map<string, { name: string; count: number }>();
  let freeCount = 0;
  for (const m of models) {
    const info = providerInfo.get(m.provider);
    if (info) {
      info.count++;
    } else {
      providerInfo.set(m.provider, { name: m.providerName ?? m.provider, count: 1 });
    }
    if (m.free) freeCount++;
  }

  const kb = new InlineKeyboard();

  // "Free Models" shortcut at top
  if (freeCount > 0) {
    kb.row().text(`⭐ Free Models (${freeCount})`, "mdl_prov:free");
  }

  // Provider buttons sorted by display name, 2 per row
  const providers = [...providerInfo.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  for (let i = 0; i < providers.length; i += 2) {
    kb.row();
    kb.text(`${providers[i][1].name} (${providers[i][1].count})`, `mdl_prov:${providers[i][0]}`);
    if (i + 1 < providers.length) {
      kb.text(`${providers[i + 1][1].name} (${providers[i + 1][1].count})`, `mdl_prov:${providers[i + 1][0]}`);
    }
  }

  let text = `<b>Select a Provider</b>`;
  if (selectedModel) {
    text += `\n\n<b>Current:</b>  <code>${escapeHtml(selectedModel.providerID)}/${escapeHtml(selectedModel.modelID)}</code>`;
  }

  return { keyboard: kb, text };
}

function buildGroupModelsKeyboard(
  models: ModelDetail[],
  groupID: string,
  page: number,
  selectedModel?: { providerID: string; modelID: string } | null,
): { keyboard: InlineKeyboard; text: string } {
  let filtered: ModelDetail[];
  let headerLabel: string;

  if (groupID === "free") {
    filtered = models.filter(m => m.free);
    headerLabel = "Free Models";
  } else {
    filtered = models.filter(m => m.provider === groupID);
    headerLabel = filtered[0]?.providerName ?? groupID;
  }

  // Sort: free first, then alphabetical
  filtered.sort((a, b) => {
    if (a.free !== b.free) return a.free ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const kb = new InlineKeyboard();

  // Back button
  kb.row().text("« Back", "mdl_back");

  if (filtered.length === 0) {
    const text = `<b>${escapeHtml(headerLabel)}</b>  —  No models available`;
    return { keyboard: kb, text };
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PROVIDER_MODELS_PER_PAGE));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const pageModels = filtered.slice(safePage * PROVIDER_MODELS_PER_PAGE, (safePage + 1) * PROVIDER_MODELS_PER_PAGE);

  for (const m of pageModels) {
    const isActive =
      selectedModel?.providerID === m.provider && selectedModel?.modelID === m.id;

    const badges: string[] = [];
    if (m.free) badges.push("free");
    if (m.reasoning) badges.push("reasoning");
    if (m.attachment) badges.push("vision");
    const badgeStr = badges.length > 0 ? "  [" + badges.join(", ") + "]" : "";

    const label = isActive ? `✓ ${m.name}${badgeStr}` : `${m.name}${badgeStr}`;
    kb.row().text(label, `mdl:${m.provider}/${m.id}`);
  }

  // Pagination
  if (totalPages > 1) {
    kb.row();
    if (safePage > 0) {
      kb.text("« Prev", `mdl_ppg:${groupID}:${safePage - 1}`);
    }
    kb.text(`${safePage + 1}/${totalPages}`, "mdl_noop");
    if (safePage < totalPages - 1) {
      kb.text("Next »", `mdl_ppg:${groupID}:${safePage + 1}`);
    }
  }

  let text = `<b>${escapeHtml(headerLabel)}</b>  (${filtered.length} models)`;
  if (totalPages > 1) text += `  —  page ${safePage + 1}/${totalPages}`;

  return { keyboard: kb, text };
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

function formatAgentsResponse(data: any, activeAgent?: string | null): string {
  if (!data) return "No agent data available.";

  const items = Array.isArray(data) ? data : [data];
  if (items.length === 0) return "No agents available.";

  let text = `<b>Agents</b>  (${items.length})\n\n`;
  for (const a of items) {
    const name = a.name ?? a.id ?? "unknown";
    const isActive = activeAgent && (name === activeAgent || a.id === activeAgent);
    text += isActive ? `\u2713 <code>${escapeHtml(name)}</code>` : `<code>${escapeHtml(name)}</code>`;
    if (a.description) text += ` \u2014 ${escapeHtml(a.description)}`;
    text += "\n";
  }

  return text;
}

function buildAgentKeyboard(
  agents: any[],
  activeAgent: string | null,
): { keyboard: InlineKeyboard; text: string } {
  const kb = new InlineKeyboard();

  // "Default" button always first
  const defaultLabel = !activeAgent ? "✓ Default" : "Default";
  kb.row().text(defaultLabel, "ag:default");

  // Group agents by mode
  const primary: any[] = [];
  const subagents: any[] = [];
  for (const a of agents) {
    const mode = a.mode ?? "primary";
    if (mode === "subagent") {
      subagents.push(a);
    } else {
      primary.push(a);
    }
  }

  if (primary.length > 0) {
    kb.row().text("— Primary —", "ag_noop");
    for (const a of primary) {
      const name = a.name ?? a.id ?? "unknown";
      const isActive = activeAgent === name || activeAgent === a.id;
      const desc = a.description
        ? ` — ${a.description.length > 30 ? a.description.slice(0, 30) + "..." : a.description}`
        : "";
      const label = isActive ? `✓ ${name}${desc}` : `${name}${desc}`;
      kb.row().text(label, `ag:${name}`);
    }
  }

  if (subagents.length > 0) {
    kb.row().text("— Sub Agents —", "ag_noop");
    for (const a of subagents) {
      const name = a.name ?? a.id ?? "unknown";
      const isActive = activeAgent === name || activeAgent === a.id;
      const desc = a.description
        ? ` — ${a.description.length > 30 ? a.description.slice(0, 30) + "..." : a.description}`
        : "";
      const label = isActive ? `✓ ${name}${desc}` : `${name}${desc}`;
      kb.row().text(label, `ag:${name}`);
    }
  }

  // Header text
  let text = `<b>Agents</b>  (${agents.length})\n\n`;
  if (activeAgent) {
    const match = agents.find((a: any) => (a.name ?? a.id) === activeAgent || a.id === activeAgent);
    text += `<b>Active:</b>  <code>${escapeHtml(activeAgent)}</code>`;
    if (match?.description) text += ` — ${escapeHtml(match.description)}`;
    if (match?.mode) text += `\n<b>Mode:</b>  ${escapeHtml(match.mode)}`;
  } else {
    text += `<b>Active:</b>  Default`;
  }

  return { keyboard: kb, text };
}

function buildSttPicker(
  providers: ReturnType<typeof listSttProviders>,
  active: string,
  currentResolved: string | null,
): { text: string; keyboard: InlineKeyboard } {
  const kb = new InlineKeyboard();
  const autoLabel = active === "auto" ? "✓ Auto" : "Auto";
  kb.row().text(autoLabel, "stt:auto");

  const configured = providers.filter((p) => p.configured);
  const notConfigured = providers.filter((p) => !p.configured);

  if (configured.length > 0) {
    kb.row().text("— Configured —", "stt_noop");
    for (const p of configured) {
      const label = active === p.id ? `✓ ${p.name}` : p.name;
      kb.row().text(label, `stt:${p.id}`);
    }
  }

  if (notConfigured.length > 0) {
    kb.row().text("— Not Configured —", "stt_noop");
    for (const p of notConfigured) {
      kb.row().text(`${p.name}  (no key)`, `stt_nokey:${p.id}`);
    }
  }

  let text = `<b>Speech-to-Text</b>\n\n`;
  text += `<b>Active:</b>  ${escapeHtml(active)}`;
  if (active === "auto" && currentResolved) {
    text += ` (using ${escapeHtml(currentResolved)})`;
  }
  text += `\n<b>Configured:</b>  ${configured.length > 0 ? configured.map((p) => p.name).join(", ") : "None"}`;

  return { text, keyboard: kb };
}

export function registerAdminCommands(bot: Bot): void {
  bot.command("health", async (ctx) => {
    try {
      const provider = getProvider();
      const health = await provider.getHealth();

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

      const lifecycleStatus = isServerDown() ? "DOWN (auto-recovery in progress)" : "Healthy";

      let text =
        `<b>Server Status</b>\n\n` +
        `<b>Provider:</b>  <code>${escapeHtml(health.provider)}</code>\n` +
        `<b>Status:</b>  ${escapeHtml(health.status)}\n` +
        `<b>Lifecycle:</b>  ${lifecycleStatus}\n` +
        `<b>Model:</b>  <code>${escapeHtml(modelStr)}</code>${reasoningBadge}\n` +
        `<b>Voice STT:</b>  ${escapeHtml(stt)}\n` +
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

      if (!agents || agents.length === 0) {
        await ctx.reply("No agents available.", { parse_mode: "HTML" });
        return;
      }

      const { keyboard, text } = buildAgentKeyboard(agents, getSelectedAgent());
      await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "listing agents"), { parse_mode: "HTML" });
    }
  });

  bot.command("project", async (ctx) => {
    try {
      const provider = getProvider();
      const proj = await provider.getProjectInfo();

      if (!proj) {
        await ctx.reply("Project info is not available.", { parse_mode: "HTML" });
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
        await ctx.reply("Git info is not available.", { parse_mode: "HTML" });
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
      const tools = await provider.getTools();

      if (!tools || tools.length === 0) {
        await ctx.reply("No tools available.", { parse_mode: "HTML" });
        return;
      }

      const text =
        `<b>Available Tools</b>  (${tools.length})\n\n` +
        tools.map((t) => {
          let line = `<code>${escapeHtml(t.id)}</code>`;
          if (t.description) {
            const desc = t.description.length > 80 ? t.description.slice(0, 80) + "..." : t.description;
            line += ` \u2014 ${escapeHtml(desc)}`;
          }
          return line;
        }).join("\n");

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

      const { keyboard, text } = buildGroupKeyboard(models, selected);
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
          `<b>Current model:</b>  <code>${escapeHtml(current.providerID)}/${escapeHtml(current.modelID)}</code>${capStr}\n\n<i>Use /models to list available models</i>`,
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
            `Model set to <code>${escapeHtml(match.provider)}/${escapeHtml(match.id)}</code>${capStr}`,
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
      `Model set to <code>${escapeHtml(providerID)}/${escapeHtml(modelID)}</code>${capStr}`,
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

  // Group selection — show models for that group
  bot.callbackQuery(/^mdl_prov:(.+)$/, async (ctx) => {
    try {
      const groupID = ctx.match[1];
      const provider = getProvider();
      const models = await provider.listModels();
      const selected = getSelectedModel();

      const { keyboard, text } = buildGroupModelsKeyboard(models, groupID, 0, selected);
      await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
      await ctx.answerCallbackQuery();
    } catch (err: any) {
      if (isNotModified(err)) { await ctx.answerCallbackQuery(); return; }
      await ctx.answerCallbackQuery({ text: "Failed to load models" });
    }
  });

  // Back to group list
  bot.callbackQuery("mdl_back", async (ctx) => {
    try {
      const provider = getProvider();
      const models = await provider.listModels();
      const selected = getSelectedModel();

      const { keyboard, text } = buildGroupKeyboard(models, selected);
      await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
      await ctx.answerCallbackQuery();
    } catch (err: any) {
      if (isNotModified(err)) { await ctx.answerCallbackQuery(); return; }
      await ctx.answerCallbackQuery({ text: "Failed to go back" });
    }
  });

  // Pagination within a group's models
  bot.callbackQuery(/^mdl_ppg:(.+):(\d+)$/, async (ctx) => {
    try {
      const groupID = ctx.match[1];
      const page = parseInt(ctx.match[2], 10);
      const provider = getProvider();
      const models = await provider.listModels();
      const selected = getSelectedModel();

      const { keyboard, text } = buildGroupModelsKeyboard(models, groupID, page, selected);
      await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
      await ctx.answerCallbackQuery();
    } catch (err: any) {
      if (isNotModified(err)) { await ctx.answerCallbackQuery(); return; }
      await ctx.answerCallbackQuery({ text: "Failed to load page" });
    }
  });

  // Noop for pagination counter button
  bot.callbackQuery("mdl_noop", async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  bot.command("agent", async (ctx) => {
    const input = ctx.match?.trim();

    if (!input) {
      try {
        const provider = getProvider();
        const agents = await provider.getAgents();
        if (!agents || agents.length === 0) {
          await ctx.reply("No agents available.", { parse_mode: "HTML" });
          return;
        }
        const { keyboard, text } = buildAgentKeyboard(agents, getSelectedAgent());
        await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
      } catch (err: any) {
        await ctx.reply(formatCatchError(err, "listing agents"), { parse_mode: "HTML" });
      }
      return;
    }

    if (input === "clear") {
      clearSelectedAgent();
      await ctx.reply("Agent reset to default.", { parse_mode: "HTML" });
      return;
    }

    // Try to match the agent name against available agents
    try {
      const provider = getProvider();
      const agents = await provider.getAgents();
      const items = (agents ?? []) as any[];
      const match = items.find(
        (a: any) => (a.name ?? a.id) === input || (a.id === input)
      );

      if (match) {
        const name = match.name ?? match.id;
        setSelectedAgent(name);
        await ctx.reply(`Agent set to <code>${escapeHtml(name)}</code>`, { parse_mode: "HTML" });
      } else if (items.length > 0) {
        const available = items.map((a: any) => a.name ?? a.id).join(", ");
        await ctx.reply(
          `Agent <code>${escapeHtml(input)}</code> not found.\n\n<b>Available:</b>  ${escapeHtml(available)}`,
          { parse_mode: "HTML" }
        );
      } else {
        // No agents list available — set it anyway
        setSelectedAgent(input);
        await ctx.reply(`Agent set to <code>${escapeHtml(input)}</code>`, { parse_mode: "HTML" });
      }
    } catch (err: any) {
      // Fall back to setting directly
      setSelectedAgent(input);
      await ctx.reply(`Agent set to <code>${escapeHtml(input)}</code>`, { parse_mode: "HTML" });
    }
  });

  // --- STT provider selection ---

  bot.command("stt", async (ctx) => {
    const providers = listSttProviders();
    const active = getSelectedSttProvider() ?? "auto";
    const currentResolved = getSttProvider();
    const { text, keyboard } = buildSttPicker(providers, active, currentResolved);
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
  });

  bot.callbackQuery(/^stt:(.+)$/, async (ctx) => {
    const choice = ctx.match[1];

    if (choice === "auto") {
      clearSelectedSttProvider();
    } else {
      // Verify it's configured
      const providers = listSttProviders();
      const target = providers.find((p) => p.id === choice);
      if (!target || !target.configured) {
        await ctx.answerCallbackQuery({ text: `${choice} is not configured (no API key)` });
        return;
      }
      setSelectedSttProvider(choice);
    }

    // Rebuild the keyboard with updated selection
    const providers = listSttProviders();
    const active = getSelectedSttProvider() ?? "auto";
    const currentResolved = getSttProvider();
    const { text, keyboard } = buildSttPicker(providers, active, currentResolved);

    try {
      await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
    } catch (err: any) {
      if (!isNotModified(err)) throw err;
    }
    await ctx.answerCallbackQuery({ text: `STT set to ${choice}` });
  });

  bot.callbackQuery(/^stt_nokey:(.+)$/, async (ctx) => {
    const name = ctx.match[1];
    await ctx.answerCallbackQuery({
      text: `${name} is not configured. Add its API key via relay onboard.`,
      show_alert: true,
    });
  });

  bot.callbackQuery("stt_noop", async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  // --- Callback query handlers for agent selection ---

  bot.callbackQuery(/^ag:(.+)$/, async (ctx) => {
    try {
      const choice = ctx.match[1];

      if (choice === "default") {
        clearSelectedAgent();
      } else {
        setSelectedAgent(choice);
      }

      // Rebuild keyboard in-place
      const provider = getProvider();
      const agents = await provider.getAgents();
      if (!agents || agents.length === 0) {
        await ctx.editMessageText("No agents available.", { parse_mode: "HTML" });
        await ctx.answerCallbackQuery({ text: "No agents available" });
        return;
      }

      const { keyboard, text } = buildAgentKeyboard(agents, getSelectedAgent());
      await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
      await ctx.answerCallbackQuery({
        text: choice === "default" ? "Agent reset to default" : `Agent set to ${choice}`,
      });
    } catch (err: any) {
      await ctx.answerCallbackQuery({ text: "Failed to set agent" });
    }
  });

  bot.callbackQuery("ag_noop", async (ctx) => {
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
    await ctx.reply(
      `Hey! Send me a message and I'll pass it to the AI.\n\n` +
      `You can also send voice notes, photos, or files.\n\n` +
      `Type /help to see all commands.`,
      { parse_mode: "HTML" }
    );
  });

  bot.command("help", async (ctx) => {
    const text =
      `<b>Relay</b>\n\n` +

      `<b>Chat</b>\n` +
      `Just send any text, voice, photo, or file\n\n` +

      `<b>Sessions</b>\n` +
      `/new  —  New session\n` +
      `/sessions  —  List sessions\n` +
      `/switch <code>id</code>  —  Switch session\n` +
      `/delete <code>id</code>  —  Delete session\n` +
      `/current  —  Active session\n` +
      `/rename <code>title</code>  —  Rename session\n` +
      `/fork <code>[messageId]</code>  —  Fork session\n\n` +

      `<b>Monitor</b>\n` +
      `/todo  —  AI task checklist\n` +
      `/diff  —  Session code changes\n` +
      `/diff full  —  Download full diff\n\n` +

      `<b>Files</b>\n` +
      `/ls <code>[path]</code>  —  List directory\n` +
      `/read <code>path</code>  —  Read file\n` +
      `/find <code>query</code>  —  Find files\n` +
      `/search <code>pattern</code>  —  Search in files\n` +
      `/symbols <code>query</code>  —  Find symbols\n` +
      `/status  —  Git status\n\n` +

      `<b>History</b>\n` +
      `/history  —  Conversation history\n` +
      `/summarize  —  Summarize session\n` +
      `/revert  —  Undo last change\n` +
      `/unrevert  —  Redo reverted change\n` +
      `/abort  —  Cancel operation\n` +
      `/share  —  Share session\n` +
      `/unshare  —  Revoke shared link\n\n` +

      `<b>Shell</b>\n` +
      `/shell <code>cmd</code>  —  Run command\n` +
      `/cmd  —  OpenCode commands (picker)\n` +
      `/commands  —  List available commands\n\n` +

      `<b>MCP</b>\n` +
      `/mcp  —  MCP server status\n` +
      `/mcp add <code>name</code> local <code>cmd</code>  —  Add local MCP\n` +
      `/mcp add <code>name</code> remote <code>url</code>  —  Add remote MCP\n` +
      `/mcp remove <code>name</code>  —  Remove MCP server\n` +
      `/mcp connect <code>name</code>  —  Reconnect MCP server\n\n` +

      `<b>Cron</b>\n` +
      `/cron  —  Scheduled tasks (picker)\n` +
      `/cron add daily <code>HH:MM</code> <code>Title: prompt</code>\n` +
      `/cron add every <code>Nm</code> <code>Title: prompt</code>\n` +
      `/cron add weekly <code>days</code> <code>HH:MM</code> <code>Title: prompt</code>\n\n` +

      `<b>Settings</b>\n` +
      `/model <code>provider/model</code>  —  Change model\n` +
      `/models  —  List available models\n` +
      `/stt  —  Switch voice transcription provider\n` +
      `/agent <code>[name|clear]</code>  —  View or change agent\n` +
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
