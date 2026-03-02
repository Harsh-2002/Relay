import type { Context } from "grammy";
import { getProvider } from "../providers/index.js";
import { chunkMessage } from "./chunker.js";
import { formatCatchError, EMPTY_RESPONSE_MSG } from "./errors.js";
import { sendResponseFiles, type ResponseFile } from "./files.js";
import { markdownToHtml } from "./markdown.js";
import { escapeHtml } from "./html.js";
import { getConfig } from "../config/index.js";
import { streamLogger } from "./logger.js";

function getEditInterval(): number {
  return getConfig().streamEditIntervalMs;
}

// Monotonic counter for draft IDs (must be non-zero, wraps at 2 billion)
let _draftCounter = 0;
function nextDraftId(): number {
  _draftCounter = (_draftCounter % 2_000_000_000) + 1;
  return _draftCounter;
}

export interface StreamPromptOptions {
  ctx: Context;
  sessionId: string;
  parts: Array<{ type: "text"; text: string } | { type: "file"; mime: string; filename?: string; url: string }>;
  model?: { providerID: string; modelID: string } | null;
  system?: string;
  agent?: string | null;
}

export async function streamPrompt({
  ctx,
  sessionId,
  parts,
  model,
  system,
  agent,
}: StreamPromptOptions): Promise<void> {
  const provider = getProvider();
  const startMs = Date.now();

  streamLogger.info({ sessionId, partsCount: parts.length }, "Starting stream prompt");

  const chatId = ctx.chat!.id;
  const draftId = nextDraftId();
  streamLogger.info({ chatId, draftId }, "Draft prepared");

  // Keep typing indicator active
  await ctx.replyWithChatAction("typing");
  const typingInterval = setInterval(() => {
    ctx.replyWithChatAction("typing").catch(() => {});
  }, 4000);

  // Thinking animation via regular message + edits (not sendMessageDraft).
  // sendMessageDraft causes a "pinned notification" banner in Telegram during
  // the thinking phase. Regular messages don't have this problem.
  let thinkingMsgId: number | null = null;
  let thinkingTimer: ReturnType<typeof setInterval> | null = null;
  let dotPhase = 0;
  try {
    const msg = await ctx.api.sendMessage(chatId, "Thinking.");
    thinkingMsgId = msg.message_id;
    thinkingTimer = setInterval(() => {
      if (!thinkingMsgId) return;
      dotPhase = (dotPhase % 3) + 1;
      ctx.api.editMessageText(chatId, thinkingMsgId, "Thinking" + ".".repeat(dotPhase))
        .catch(() => {}); // Ignore edit errors (rate limit, not modified, etc.)
    }, 500);
  } catch {
    // If sending the thinking message fails, continue without it
  }

  // Track whether we've transitioned from thinking → streaming draft
  let draftStarted = false;

  let accumulated = "";
  let reasoning = "";
  let toolStatus = "";
  let lastEditTime = 0;
  let lastEditedText = "";
  let errorMsg: string | null = null;
  let chunkCount = 0;
  let editCount = 0;
  const collectedFiles: ResponseFile[] = [];

  try {
    const stream = provider.promptStream(sessionId, parts[0]?.type === "text" ? (parts[0] as any).text : "", {
      parts: parts as any,
      ...(model && { model }),
      ...(system && { system }),
      ...(agent && { agent }),
    });

    for await (const chunk of stream) {
      if (chunk.type === "text") {
        chunkCount++;
        accumulated += chunk.content;
      } else if (chunk.type === "reasoning") {
        reasoning += chunk.content;
      } else if (chunk.type === "reasoning_reclassify") {
        if (chunk.deltaText) {
          const idx = accumulated.indexOf(chunk.deltaText);
          if (idx >= 0) {
            accumulated = accumulated.slice(0, idx) + accumulated.slice(idx + chunk.deltaText.length);
          }
        }
        reasoning += chunk.content;
        streamLogger.info({ sessionId, deltaTextLen: chunk.deltaText?.length }, "Reasoning reclassified");
      } else if (chunk.type === "tool_use") {
        toolStatus = chunk.content;
      } else if (chunk.type === "file" && chunk.file) {
        collectedFiles.push(chunk.file);
      } else if (chunk.type === "done") {
        break;
      }

      // Transition: thinking message → streaming draft on first real content
      if (!draftStarted && (accumulated || toolStatus)) {
        draftStarted = true;
        // Stop dots animation and delete thinking message
        if (thinkingTimer) { clearInterval(thinkingTimer); thinkingTimer = null; }
        if (thinkingMsgId) {
          ctx.api.deleteMessage(chatId, thinkingMsgId).catch(() => {});
          thinkingMsgId = null;
        }
        // Send first draft with actual content immediately
        const display = buildDisplayText(accumulated, toolStatus, reasoning);
        await safeSendDraft(ctx, chatId, draftId, display);
        lastEditedText = display;
        lastEditTime = Date.now();
        editCount++;
        continue;
      }

      // Throttled draft updates (only after draft has started)
      if (draftStarted) {
        const now = Date.now();
        if (now - lastEditTime >= getEditInterval()) {
          const display = buildDisplayText(accumulated, toolStatus, reasoning);
          if (display !== lastEditedText) {
            await safeSendDraft(ctx, chatId, draftId, display);
            lastEditedText = display;
            lastEditTime = now;
            editCount++;
          }
        }
      }
    }
  } catch (err: any) {
    streamLogger.info({ sessionId, err: err?.message, chunkCount }, "Stream error");
    errorMsg = formatCatchError(err, "streaming response");
  } finally {
    if (thinkingTimer) clearInterval(thinkingTimer);
    clearInterval(typingInterval);
    // Clean up thinking message if it's still visible (error/empty response path)
    if (thinkingMsgId) {
      ctx.api.deleteMessage(chatId, thinkingMsgId).catch(() => {});
      thinkingMsgId = null;
    }
  }

  streamLogger.info(
    { sessionId, durationMs: Date.now() - startMs, chunkCount, editCount, responseLen: accumulated.length, reasoningLen: reasoning.length, filesCount: collectedFiles.length },
    "Stream completed"
  );

  // Final response — sendMessage finalizes (clears) the draft
  if (errorMsg) {
    await safeSendMessage(ctx, chatId, errorMsg, true);
    return;
  }

  if (!accumulated.trim()) {
    await safeSendMessage(ctx, chatId, EMPTY_RESPONSE_MSG, true);
    return;
  }

  const answerHtml = markdownToHtml(accumulated);
  const answerHtmlChunks = chunkMessage(answerHtml);
  const fitsInOneMessage = answerHtmlChunks.length === 1;

  if (reasoning && fitsInOneMessage) {
    // Reasoning + answer fit in one message — use expandable blockquote
    const maxReasoningLen = 4000 - answerHtml.length - 80; // 80 chars overhead for tags
    const finalHtml = composeReasoningHtml(reasoning, answerHtml, maxReasoningLen);
    await safeSendMessage(ctx, chatId, finalHtml, true);
  } else if (reasoning) {
    // Answer too long for one message — send reasoning as separate preceding message
    const reasoningHtml = formatReasoningBlockquote(reasoning, 3900);
    try {
      await ctx.api.sendMessage(chatId, reasoningHtml, { parse_mode: "HTML" });
    } catch {
      // If blockquote fails, skip reasoning
    }
    await sendFinalChunks(ctx, chatId, answerHtmlChunks, chunkMessage(accumulated));
  } else if (fitsInOneMessage) {
    // No reasoning, fits in one message
    await safeSendMessage(ctx, chatId, answerHtml, true);
  } else {
    // No reasoning, multi-chunk
    const plainChunks = chunkMessage(accumulated);
    await sendFinalChunks(ctx, chatId, answerHtmlChunks, plainChunks);
  }

  // Send any collected file attachments
  if (collectedFiles.length > 0) {
    await sendResponseFiles(ctx, collectedFiles);
  }
}

function buildDisplayText(text: string, toolStatus: string, reasoning = ""): string {
  let display = "";
  if (!text && reasoning) {
    // Still in reasoning phase — brief indicator, no content leak
    display = "Thinking...";
  } else {
    display = text || "Thinking...";
  }
  if (toolStatus) {
    display += `\n\n${toolStatus}`;
  }
  // Telegram message limit is 4096 — show tail end for long responses
  if (display.length > 4000) {
    display = "...\n\n" + display.slice(display.length - 3950);
  }
  // Close any unclosed code fences so markdown→HTML conversion works
  display = closeUnterminatedCodeFences(display);
  return display;
}

/**
 * If the text has an odd number of ``` markers (i.e. an unclosed code fence),
 * append a closing ``` so markdown-to-HTML conversion doesn't break.
 */
function closeUnterminatedCodeFences(text: string): string {
  const fenceCount = (text.match(/```/g) || []).length;
  if (fenceCount % 2 !== 0) {
    return text + "\n```";
  }
  return text;
}

/**
 * Send a message draft (animated streaming). Fire-and-forget — no message ID returned.
 * Falls back to plain text on HTML parse error; skips silently on rate limit.
 */
async function safeSendDraft(
  ctx: Context,
  chatId: number,
  draftId: number,
  text: string,
): Promise<void> {
  const html = markdownToHtml(text);
  try {
    await ctx.api.sendMessageDraft(chatId, draftId, html, { parse_mode: "HTML" });
  } catch (err: any) {
    if (isParseError(err)) {
      try {
        await ctx.api.sendMessageDraft(chatId, draftId, text);
      } catch {
        // Give up on this draft update
      }
      return;
    }
    if (isRateLimitError(err)) return; // Skip — next throttle tick will retry
    streamLogger.info({ err: err?.message ?? err?.description }, "Draft send failed");
  }
}

/**
 * Send a final message (which also finalizes/clears the active draft).
 * Falls back to plain text on HTML parse error.
 */
async function safeSendMessage(
  ctx: Context,
  chatId: number,
  html: string,
  isHtml: boolean,
): Promise<void> {
  try {
    if (isHtml) {
      await ctx.api.sendMessage(chatId, html, { parse_mode: "HTML" });
    } else {
      await ctx.api.sendMessage(chatId, html);
    }
  } catch (err: any) {
    if (isHtml && isParseError(err)) {
      // Fallback: strip HTML and send plain
      try {
        await ctx.api.sendMessage(chatId, html.replace(/<[^>]+>/g, ""));
      } catch {
        // Give up
      }
      return;
    }
    await retryOnRateLimit(err, () =>
      isHtml
        ? ctx.api.sendMessage(chatId, html, { parse_mode: "HTML" })
        : ctx.api.sendMessage(chatId, html)
    );
  }
}

function isParseError(err: any): boolean {
  const desc = err?.description ?? err?.message ?? "";
  return desc.includes("can't parse") || desc.includes("Bad Request: can't parse");
}

function isRateLimitError(err: any): boolean {
  const desc = err?.description ?? err?.message ?? "";
  return desc.includes("Too Many Requests") || desc.includes("retry_after");
}

async function retryOnRateLimit(err: any, fn: () => Promise<any>): Promise<void> {
  if (isRateLimitError(err)) {
    const retryAfter = err?.parameters?.retry_after ?? 3;
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    try { await fn(); } catch { /* give up after retry */ }
  } else {
    streamLogger.info({ err: err?.description ?? err?.message }, "Telegram send failed");
  }
}

/**
 * Format reasoning as a Telegram expandable blockquote.
 */
export function formatReasoningBlockquote(reasoning: string, maxLen: number): string {
  let text = reasoning;
  if (text.length > maxLen) {
    text = text.slice(0, maxLen) + "...";
  }
  return `<blockquote expandable>🧠 <b>Thinking</b>\n${escapeHtml(text)}</blockquote>`;
}

/**
 * Compose final HTML with expandable reasoning blockquote + answer.
 */
function composeReasoningHtml(reasoning: string, answerHtml: string, maxReasoningLen: number): string {
  const reasoningBlock = formatReasoningBlockquote(reasoning, Math.max(maxReasoningLen, 200));
  return `${reasoningBlock}\n\n${answerHtml}`;
}

/**
 * Send multi-chunk final response. First sendMessage finalizes the draft,
 * remaining chunks are regular messages.
 */
async function sendFinalChunks(
  ctx: Context,
  chatId: number,
  htmlChunks: string[],
  plainChunks: string[],
): Promise<void> {
  for (let i = 0; i < htmlChunks.length; i++) {
    try {
      await ctx.api.sendMessage(chatId, htmlChunks[i], { parse_mode: "HTML" });
    } catch {
      const plain = i < plainChunks.length ? plainChunks[i] : htmlChunks[i].replace(/<[^>]+>/g, "");
      await ctx.api.sendMessage(chatId, plain);
    }
  }
}

