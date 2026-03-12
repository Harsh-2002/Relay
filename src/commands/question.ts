import type { Bot, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { getProvider } from "../providers/index.js";
import { escapeHtml } from "../utils/html.js";
import { providerLogger } from "../utils/logger.js";
import type { StreamChunk } from "../providers/types.js";

// --- State ---

interface QuestionFlowState {
  requestId: string;
  items: NonNullable<StreamChunk["question"]>["items"];
  currentIndex: number;
  collectedAnswers: string[][];
  multiSelectState?: Set<number>;
  chatId: number;
  msgId?: number;
  api?: Context["api"];
}

const questionFlows = new Map<string, QuestionFlowState>();
const pendingTextQuestions = new Map<number, { requestId: string; msgId?: number; forceReplyMsgId?: number }>();

// --- Public API ---

export async function startQuestionFlow(
  ctx: Context,
  chatId: number,
  question: NonNullable<StreamChunk["question"]>,
  streamMsgId: number | null,
): Promise<void> {
  // Clean up any stale flows for this chat (e.g. from a previous stream that errored out)
  for (const [reqId, flow] of questionFlows) {
    if (flow.chatId === chatId) {
      questionFlows.delete(reqId);
    }
  }
  // Delete stale force_reply message if any
  const stalePending = pendingTextQuestions.get(chatId);
  if (stalePending?.forceReplyMsgId) {
    try { await ctx.api.deleteMessage(chatId, stalePending.forceReplyMsgId); } catch {}
  }
  pendingTextQuestions.delete(chatId);

  const { requestId, items } = question;

  if (items.length === 1 && !items[0].multiple && items[0].options.length > 0) {
    // Single question, single-select, has options
    await sendSingleSelect(ctx.api, chatId, requestId, items[0], streamMsgId);
  } else if (items.length > 1) {
    // Multi-question batch
    const flow: QuestionFlowState = {
      requestId,
      items,
      currentIndex: 0,
      collectedAnswers: [],
      chatId,
      api: ctx.api,
    };
    questionFlows.set(requestId, flow);
    await renderMultiQuestion(ctx.api, flow, streamMsgId);
  } else if (items.length === 1 && items[0].multiple && items[0].options.length > 0) {
    // Single question, multi-select
    const flow: QuestionFlowState = {
      requestId,
      items,
      currentIndex: 0,
      collectedAnswers: [],
      multiSelectState: new Set(),
      chatId,
      api: ctx.api,
    };
    questionFlows.set(requestId, flow);
    await renderMultiSelect(ctx.api, flow, streamMsgId);
  } else {
    // No options (free text) or empty items
    const item = items[0] ?? { header: "", question: "Provide input:", options: [], custom: true };
    await sendNoOptions(ctx.api, chatId, requestId, item, streamMsgId);
  }
}

export async function cleanupQuestionFlow(requestId: string, reason?: "timeout" | "resolved"): Promise<void> {
  const flow = questionFlows.get(requestId);
  if (flow) {
    // On timeout, edit the Telegram message to show auto-replied and remove keyboard
    if (reason === "timeout" && flow.api && flow.msgId) {
      try {
        await flow.api.editMessageText(flow.chatId, flow.msgId,
          "⏱ <b>Auto-replied</b> (no response after 5 minutes)",
          { parse_mode: "HTML" });
      } catch {}
    }
    const pending = pendingTextQuestions.get(flow.chatId);
    if (pending?.requestId === requestId) {
      // Delete the force_reply message so it doesn't re-activate later
      if (pending.forceReplyMsgId && flow.api) {
        try { await flow.api.deleteMessage(flow.chatId, pending.forceReplyMsgId); } catch {}
      }
      pendingTextQuestions.delete(flow.chatId);
    }
    questionFlows.delete(requestId);
  }
  for (const [chatId, p] of pendingTextQuestions) {
    if (p.requestId === requestId) {
      pendingTextQuestions.delete(chatId);
    }
  }
}

export function consumePendingTextQuestion(
  chatId: number,
): { handle: (text: string, ctx: Context) => Promise<void> } | null {
  const pending = pendingTextQuestions.get(chatId);
  if (!pending) return null;
  pendingTextQuestions.delete(chatId);

  const { requestId, msgId, forceReplyMsgId } = pending;

  return {
    handle: async (text: string, ctx: Context) => {
      // Delete the "Type your answer:" force_reply message to prevent it
      // from re-activating the reply prompt when future messages arrive
      if (forceReplyMsgId) {
        try { await ctx.api.deleteMessage(chatId, forceReplyMsgId); } catch {}
      }

      const flow = questionFlows.get(requestId);
      if (flow) {
        // Multi-question: push answer and advance
        flow.collectedAnswers.push([text]);
        flow.currentIndex++;
        if (flow.currentIndex < flow.items.length) {
          await renderMultiQuestion(ctx.api, flow);
        } else {
          await submitMultiQuestionAnswers(ctx.api, flow);
        }
      } else {
        // Single question: reply directly
        const provider = getProvider();
        try {
          await provider.replyToQuestion!(requestId, [[text]]);
          if (msgId) {
            try {
              await ctx.api.editMessageReplyMarkup(chatId, msgId, { reply_markup: { inline_keyboard: [] } });
            } catch {}
          }
          await ctx.reply(`<b>Answer sent:</b> ${escapeHtml(text)}`, { parse_mode: "HTML" });
        } catch (err: any) {
          providerLogger.warn({ requestId, err: err?.message }, "Typed answer reply failed");
          await ctx.reply("Question already answered or expired.");
        }
      }
    },
  };
}

// --- Single-select (has options, not multiple) ---

async function sendSingleSelect(
  api: Context["api"],
  chatId: number,
  requestId: string,
  item: QuestionFlowState["items"][0],
  streamMsgId: number | null,
): Promise<void> {
  const kb = new InlineKeyboard();
  for (let i = 0; i < item.options.length; i++) {
    kb.row().text(item.options[i].label, `qa:${requestId}:${i}`);
  }
  const bottomRow = kb.row();
  bottomRow.text("Skip (auto-select first)", `qa_skip:${requestId}`);
  if (item.custom !== false) {
    bottomRow.text("Type answer...", `qatxt:${requestId}`);
  }

  const html = formatQuestionHtml(item);
  if (streamMsgId) {
    try {
      await api.editMessageText(chatId, streamMsgId, html, { parse_mode: "HTML", reply_markup: kb });
      return;
    } catch {}
  }
  await api.sendMessage(chatId, html, { parse_mode: "HTML", reply_markup: kb });
}

// --- No options ---

async function sendNoOptions(
  api: Context["api"],
  chatId: number,
  requestId: string,
  item: QuestionFlowState["items"][0],
  streamMsgId: number | null,
): Promise<void> {
  const kb = new InlineKeyboard();
  kb.row()
    .text("Yes", `qay:${requestId}`)
    .text("No", `qan:${requestId}`);
  if (item.custom !== false) {
    kb.row().text("Type answer...", `qatxt:${requestId}`);
  }

  const html = formatQuestionHtml(item);
  if (streamMsgId) {
    try {
      await api.editMessageText(chatId, streamMsgId, html, { parse_mode: "HTML", reply_markup: kb });
      return;
    } catch {}
  }
  await api.sendMessage(chatId, html, { parse_mode: "HTML", reply_markup: kb });
}

// --- Multi-question ---

async function renderMultiQuestion(
  api: Context["api"],
  flow: QuestionFlowState,
  streamMsgId?: number | null,
): Promise<void> {
  const item = flow.items[flow.currentIndex];
  const total = flow.items.length;
  const current = flow.currentIndex + 1;

  const kb = new InlineKeyboard();
  if (item.options.length > 0) {
    for (let i = 0; i < item.options.length; i++) {
      kb.row().text(item.options[i].label, `mqr:${flow.requestId}:${i}`);
    }
  } else {
    // No options for this sub-question — synthetic Yes/No
    kb.row()
      .text("Yes", `mqr:${flow.requestId}:0`)
      .text("No", `mqr:${flow.requestId}:1`);
  }
  const bottomRow = kb.row();
  bottomRow.text("Skip", `mqs:${flow.requestId}`);
  if (item.custom !== false) {
    bottomRow.text("Type answer...", `mqtxt:${flow.requestId}`);
  }

  const html = `<b>Question ${current} of ${total}</b>\n\n` + formatQuestionHtml(item);

  if (streamMsgId) {
    try {
      await api.editMessageText(flow.chatId, streamMsgId, html, { parse_mode: "HTML", reply_markup: kb });
      flow.msgId = streamMsgId;
      return;
    } catch {}
  }
  if (flow.msgId) {
    try {
      await api.editMessageText(flow.chatId, flow.msgId, html, { parse_mode: "HTML", reply_markup: kb });
      return;
    } catch {}
  }
  const msg = await api.sendMessage(flow.chatId, html, { parse_mode: "HTML", reply_markup: kb });
  flow.msgId = msg.message_id;
}

// --- Multi-select ---

async function renderMultiSelect(
  api: Context["api"],
  flow: QuestionFlowState,
  streamMsgId?: number | null,
): Promise<void> {
  const item = flow.items[0];
  const selected = flow.multiSelectState!;

  const kb = new InlineKeyboard();
  for (let i = 0; i < item.options.length; i++) {
    const prefix = selected.has(i) ? "☑" : "☐";
    kb.row().text(`${prefix} ${item.options[i].label}`, `qat:${flow.requestId}:${i}`);
  }
  kb.row()
    .text("Done", `qad:${flow.requestId}`)
    .text("Skip (select all)", `qas:${flow.requestId}`);

  const html = formatQuestionHtml(item) + `\n\n<i>${selected.size} selected</i>`;

  if (streamMsgId) {
    try {
      await api.editMessageText(flow.chatId, streamMsgId, html, { parse_mode: "HTML", reply_markup: kb });
      flow.msgId = streamMsgId;
      return;
    } catch {}
  }
  if (flow.msgId) {
    try {
      await api.editMessageText(flow.chatId, flow.msgId, html, { parse_mode: "HTML", reply_markup: kb });
      return;
    } catch {}
  }
  const msg = await api.sendMessage(flow.chatId, html, { parse_mode: "HTML", reply_markup: kb });
  flow.msgId = msg.message_id;
}

// --- Submit helpers ---

async function submitMultiQuestionAnswers(api: Context["api"], flow: QuestionFlowState): Promise<void> {
  const provider = getProvider();
  try {
    await provider.replyToQuestion!(flow.requestId, flow.collectedAnswers);
    let summary = "<b>All questions answered:</b>\n";
    for (let i = 0; i < flow.items.length; i++) {
      const answer = flow.collectedAnswers[i]?.[0] ?? "?";
      summary += `\n${i + 1}. ${escapeHtml(answer)}`;
    }
    if (flow.msgId) {
      try {
        await api.editMessageText(flow.chatId, flow.msgId, summary, { parse_mode: "HTML" });
      } catch {}
    }
  } catch (err: any) {
    providerLogger.warn({ requestId: flow.requestId, err: err?.message }, "Multi-question reply failed");
    if (flow.msgId) {
      try {
        await api.editMessageText(flow.chatId, flow.msgId, "Question already answered or expired.");
      } catch {}
    }
  }
  questionFlows.delete(flow.requestId);
}

// --- Formatting ---

function formatQuestionHtml(item: { header: string; question: string; options: Array<{ label: string; description?: string }> }): string {
  let html = "";
  if (item.header) html += `<b>${escapeHtml(item.header)}</b>\n\n`;
  html += escapeHtml(item.question);
  for (const opt of item.options) {
    html += `\n\n• <b>${escapeHtml(opt.label)}</b>`;
    if (opt.description) html += ` — ${escapeHtml(opt.description)}`;
  }
  return html;
}

// --- Callback handlers ---

export function registerQuestionHandlers(bot: Bot): void {
  // Single-select: pick option
  bot.callbackQuery(/^qa:([^:]+):(\d+)$/, async (ctx) => {
    const requestId = ctx.match[1];
    const optionIdx = parseInt(ctx.match[2], 10);

    const buttons = ctx.callbackQuery.message?.reply_markup?.inline_keyboard ?? [];
    let selectedLabel = "";
    for (const row of buttons) {
      for (const btn of row) {
        if ("callback_data" in btn && btn.callback_data === ctx.callbackQuery.data) {
          selectedLabel = btn.text;
          break;
        }
      }
      if (selectedLabel) break;
    }
    if (!selectedLabel) selectedLabel = `Option ${optionIdx + 1}`;

    const provider = getProvider();
    try {
      await provider.replyToQuestion!(requestId, [[selectedLabel]]);
      const originalText = ctx.callbackQuery.message?.text ?? "";
      const newText = `${escapeHtml(originalText)}\n\n<b>Selected: ${escapeHtml(selectedLabel)}</b>`;
      try {
        await ctx.editMessageText(newText, { parse_mode: "HTML" });
      } catch {
        await ctx.editMessageText(`Selected: ${selectedLabel}`);
      }
      await ctx.answerCallbackQuery({ text: `Selected: ${selectedLabel}` });
    } catch (err: any) {
      providerLogger.warn({ requestId, err: err?.message }, "Question reply failed");
      await ctx.answerCallbackQuery({ text: "Already answered or expired" });
      try { await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }); } catch {}
    }
  });

  // Single-select: skip (auto-select first)
  bot.callbackQuery(/^qa_skip:([^:]+)$/, async (ctx) => {
    const requestId = ctx.match[1];
    const buttons = ctx.callbackQuery.message?.reply_markup?.inline_keyboard ?? [];
    let firstLabel = "yes";
    if (buttons.length > 0 && buttons[0].length > 0) {
      firstLabel = buttons[0][0].text;
    }

    const provider = getProvider();
    try {
      await provider.replyToQuestion!(requestId, [[firstLabel]]);
      const originalText = ctx.callbackQuery.message?.text ?? "";
      const newText = `${escapeHtml(originalText)}\n\n<b>Skipped (auto-selected: ${escapeHtml(firstLabel)})</b>`;
      try {
        await ctx.editMessageText(newText, { parse_mode: "HTML" });
      } catch {
        await ctx.editMessageText(`Skipped (auto-selected: ${firstLabel})`);
      }
      await ctx.answerCallbackQuery({ text: `Auto-selected: ${firstLabel}` });
    } catch (err: any) {
      providerLogger.warn({ requestId, err: err?.message }, "Question skip failed");
      await ctx.answerCallbackQuery({ text: "Already answered or expired" });
      try { await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }); } catch {}
    }
  });

  // Type answer (single-select or no-options)
  bot.callbackQuery(/^qatxt:([^:]+)$/, async (ctx) => {
    const requestId = ctx.match[1];
    const chatId = ctx.callbackQuery.message?.chat.id;
    const msgId = ctx.callbackQuery.message?.message_id;
    if (!chatId) return;

    await ctx.answerCallbackQuery({ text: "Type your answer below" });
    const forceReplyMsg = await ctx.api.sendMessage(chatId, "Type your answer:", {
      reply_markup: { force_reply: true, selective: true },
    });
    pendingTextQuestions.set(chatId, { requestId, msgId, forceReplyMsgId: forceReplyMsg.message_id });
  });

  // No-options: Yes
  bot.callbackQuery(/^qay:([^:]+)$/, async (ctx) => {
    const requestId = ctx.match[1];
    const provider = getProvider();
    try {
      await provider.replyToQuestion!(requestId, [["yes"]]);
      const originalText = ctx.callbackQuery.message?.text ?? "";
      try {
        await ctx.editMessageText(`${escapeHtml(originalText)}\n\n<b>Answered: yes</b>`, { parse_mode: "HTML" });
      } catch {
        await ctx.editMessageText("Answered: yes");
      }
      await ctx.answerCallbackQuery({ text: "Answered: yes" });
    } catch (err: any) {
      providerLogger.warn({ requestId, err: err?.message }, "Yes reply failed");
      await ctx.answerCallbackQuery({ text: "Already answered or expired" });
      try { await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }); } catch {}
    }
  });

  // No-options: No
  bot.callbackQuery(/^qan:([^:]+)$/, async (ctx) => {
    const requestId = ctx.match[1];
    const provider = getProvider();
    try {
      await provider.replyToQuestion!(requestId, [["no"]]);
      const originalText = ctx.callbackQuery.message?.text ?? "";
      try {
        await ctx.editMessageText(`${escapeHtml(originalText)}\n\n<b>Answered: no</b>`, { parse_mode: "HTML" });
      } catch {
        await ctx.editMessageText("Answered: no");
      }
      await ctx.answerCallbackQuery({ text: "Answered: no" });
    } catch (err: any) {
      providerLogger.warn({ requestId, err: err?.message }, "No reply failed");
      await ctx.answerCallbackQuery({ text: "Already answered or expired" });
      try { await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }); } catch {}
    }
  });

  // Multi-question: pick option
  bot.callbackQuery(/^mqr:([^:]+):(\d+)$/, async (ctx) => {
    const requestId = ctx.match[1];
    const flow = questionFlows.get(requestId);
    if (!flow) {
      await ctx.answerCallbackQuery({ text: "Question flow expired" });
      try { await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }); } catch {}
      return;
    }

    // Get label from button text
    const buttons = ctx.callbackQuery.message?.reply_markup?.inline_keyboard ?? [];
    let selectedLabel = "";
    for (const row of buttons) {
      for (const btn of row) {
        if ("callback_data" in btn && btn.callback_data === ctx.callbackQuery.data) {
          selectedLabel = btn.text;
          break;
        }
      }
      if (selectedLabel) break;
    }
    if (!selectedLabel) selectedLabel = "yes";

    flow.collectedAnswers.push([selectedLabel]);
    flow.currentIndex++;
    await ctx.answerCallbackQuery({ text: `Selected: ${selectedLabel}` });

    if (flow.currentIndex < flow.items.length) {
      await renderMultiQuestion(ctx.api, flow);
    } else {
      await submitMultiQuestionAnswers(ctx.api, flow);
    }
  });

  // Multi-question: skip (auto-select first)
  bot.callbackQuery(/^mqs:([^:]+)$/, async (ctx) => {
    const requestId = ctx.match[1];
    const flow = questionFlows.get(requestId);
    if (!flow) {
      await ctx.answerCallbackQuery({ text: "Question flow expired" });
      return;
    }

    const item = flow.items[flow.currentIndex];
    const firstLabel = item.options[0]?.label ?? "yes";
    flow.collectedAnswers.push([firstLabel]);
    flow.currentIndex++;
    await ctx.answerCallbackQuery({ text: `Skipped: ${firstLabel}` });

    if (flow.currentIndex < flow.items.length) {
      await renderMultiQuestion(ctx.api, flow);
    } else {
      await submitMultiQuestionAnswers(ctx.api, flow);
    }
  });

  // Multi-question: type answer
  bot.callbackQuery(/^mqtxt:([^:]+)$/, async (ctx) => {
    const requestId = ctx.match[1];
    const flow = questionFlows.get(requestId);
    if (!flow) {
      await ctx.answerCallbackQuery({ text: "Question flow expired" });
      return;
    }

    await ctx.answerCallbackQuery({ text: "Type your answer below" });
    const forceReplyMsg = await ctx.api.sendMessage(flow.chatId, "Type your answer:", {
      reply_markup: { force_reply: true, selective: true },
    });
    pendingTextQuestions.set(flow.chatId, { requestId, msgId: flow.msgId, forceReplyMsgId: forceReplyMsg.message_id });
  });

  // Multi-select: toggle option
  bot.callbackQuery(/^qat:([^:]+):(\d+)$/, async (ctx) => {
    const requestId = ctx.match[1];
    const optionIdx = parseInt(ctx.match[2], 10);
    const flow = questionFlows.get(requestId);
    if (!flow || !flow.multiSelectState) {
      await ctx.answerCallbackQuery({ text: "Question flow expired" });
      try { await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }); } catch {}
      return;
    }

    if (flow.multiSelectState.has(optionIdx)) {
      flow.multiSelectState.delete(optionIdx);
    } else {
      flow.multiSelectState.add(optionIdx);
    }
    await ctx.answerCallbackQuery();
    await renderMultiSelect(ctx.api, flow);
  });

  // Multi-select: done
  bot.callbackQuery(/^qad:([^:]+)$/, async (ctx) => {
    const requestId = ctx.match[1];
    const flow = questionFlows.get(requestId);
    if (!flow || !flow.multiSelectState) {
      await ctx.answerCallbackQuery({ text: "Question flow expired" });
      return;
    }

    const item = flow.items[0];
    const selected = [...flow.multiSelectState].map(i => item.options[i]?.label).filter(Boolean);
    if (selected.length === 0) {
      selected.push(item.options[0]?.label ?? "yes");
    }

    const provider = getProvider();
    try {
      await provider.replyToQuestion!(requestId, [selected]);
      const summary = `<b>Selected:</b> ${selected.map(s => escapeHtml(s)).join(", ")}`;
      if (flow.msgId) {
        try {
          await ctx.api.editMessageText(flow.chatId, flow.msgId, summary, { parse_mode: "HTML" });
        } catch {}
      }
      await ctx.answerCallbackQuery({ text: `Selected ${selected.length} options` });
    } catch (err: any) {
      providerLogger.warn({ requestId, err: err?.message }, "Multi-select reply failed");
      await ctx.answerCallbackQuery({ text: "Already answered or expired" });
    }
    questionFlows.delete(requestId);
  });

  // Multi-select: skip (select all)
  bot.callbackQuery(/^qas:([^:]+)$/, async (ctx) => {
    const requestId = ctx.match[1];
    const flow = questionFlows.get(requestId);
    if (!flow) {
      await ctx.answerCallbackQuery({ text: "Question flow expired" });
      return;
    }

    const item = flow.items[0];
    const allLabels = item.options.map(o => o.label);

    const provider = getProvider();
    try {
      await provider.replyToQuestion!(requestId, [allLabels]);
      const summary = `<b>Skipped (selected all):</b> ${allLabels.map(s => escapeHtml(s)).join(", ")}`;
      if (flow.msgId) {
        try {
          await ctx.api.editMessageText(flow.chatId, flow.msgId, summary, { parse_mode: "HTML" });
        } catch {}
      }
      await ctx.answerCallbackQuery({ text: "Selected all" });
    } catch (err: any) {
      providerLogger.warn({ requestId, err: err?.message }, "Multi-select skip failed");
      await ctx.answerCallbackQuery({ text: "Already answered or expired" });
    }
    questionFlows.delete(requestId);
  });
}
