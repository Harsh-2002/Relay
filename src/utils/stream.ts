import type { Context } from "grammy";
import { InputFile } from "grammy";
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

  if (!provider.promptStream) {
    streamLogger.info({ sessionId }, "No promptStream — falling back to non-streaming");
    // Fallback to non-streaming prompt
    const result = await provider.prompt(sessionId, parts[0]?.type === "text" ? (parts[0] as any).text : "", {
      parts: parts as any,
      ...(model && { model }),
      ...(system && { system }),
      ...(agent && { agent }),
    });
    await sendPlainText(ctx, result.text);
    return;
  }

  // Send placeholder
  const placeholder = await ctx.reply("Thinking...");
  const chatId = placeholder.chat.id;
  const messageId = placeholder.message_id;
  streamLogger.info({ chatId, messageId }, "Placeholder message sent");

  // Keep typing indicator active
  const typingInterval = setInterval(() => {
    ctx.replyWithChatAction("typing").catch(() => {});
  }, 4000);

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
      } else if (chunk.type === "tool_use") {
        toolStatus = chunk.content;
      } else if (chunk.type === "file" && chunk.file) {
        collectedFiles.push(chunk.file);
      } else if (chunk.type === "done") {
        break;
      }

      // Throttled edit — use Markdown so the final edit doesn't cause a visual flash
      const now = Date.now();
      if (now - lastEditTime >= getEditInterval()) {
        const display = buildDisplayText(accumulated, toolStatus, reasoning);
        if (display !== lastEditedText) {
          await safeEditHtml(ctx, chatId, messageId, display);
          lastEditedText = display;
          lastEditTime = now;
          editCount++;
        }
      }
    }
  } catch (err: any) {
    streamLogger.info({ sessionId, err: err?.message, chunkCount }, "Stream error");
    errorMsg = formatCatchError(err, "streaming response");
  } finally {
    clearInterval(typingInterval);
  }

  streamLogger.info(
    { sessionId, durationMs: Date.now() - startMs, chunkCount, editCount, responseLen: accumulated.length, filesCount: collectedFiles.length },
    "Stream completed"
  );

  // Final response
  if (errorMsg) {
    await safeEditMessage(ctx, chatId, messageId, errorMsg, true);
    return;
  }

  if (!accumulated.trim()) {
    await safeEditMessage(ctx, chatId, messageId, EMPTY_RESPONSE_MSG, true);
    return;
  }

  const answerHtml = markdownToHtml(accumulated);
  const answerHtmlChunks = chunkMessage(answerHtml);
  const fitsInOneMessage = answerHtmlChunks.length === 1;

  if (reasoning && fitsInOneMessage) {
    // Reasoning + answer fit in one message — use expandable blockquote
    const maxReasoningLen = 4000 - answerHtml.length - 80; // 80 chars overhead for tags
    const finalHtml = composeReasoningHtml(reasoning, answerHtml, maxReasoningLen);
    await safeEditRawHtml(ctx, chatId, messageId, finalHtml);
  } else if (reasoning) {
    // Answer too long for one message — send reasoning as separate preceding message
    const reasoningHtml = formatReasoningBlockquote(reasoning, 3900);
    // Delete placeholder, send reasoning then answer chunks
    try { await ctx.api.deleteMessage(chatId, messageId); } catch {}
    try {
      await ctx.api.sendMessage(chatId, reasoningHtml, { parse_mode: "HTML" });
    } catch {
      // If blockquote fails, skip reasoning
    }
    await sendHtmlChunks(ctx, chatId, answerHtmlChunks, chunkMessage(accumulated));
  } else if (fitsInOneMessage) {
    // No reasoning, fits in one message
    if (answerHtml !== lastEditedText) {
      await safeEditRawHtml(ctx, chatId, messageId, answerHtml);
    }
  } else {
    // No reasoning, multi-chunk
    await sendFinalResponse(ctx, chatId, messageId, accumulated);
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

async function safeEditMessage(
  ctx: Context,
  chatId: number,
  messageId: number,
  text: string,
  html = false,
): Promise<void> {
  try {
    await ctx.api.editMessageText(chatId, messageId, text, html ? { parse_mode: "HTML" } : undefined);
  } catch (err: any) {
    if (isNotModifiedError(err)) return;
    await retryOnRateLimit(err, () =>
      ctx.api.editMessageText(chatId, messageId, text, html ? { parse_mode: "HTML" } : undefined)
    );
  }
}

/**
 * Edit a message with HTML formatting (converted from markdown).
 * Falls back to plain text if HTML parsing fails.
 */
async function safeEditHtml(
  ctx: Context,
  chatId: number,
  messageId: number,
  text: string,
): Promise<void> {
  const html = markdownToHtml(text);
  try {
    await ctx.api.editMessageText(chatId, messageId, html, { parse_mode: "HTML" });
  } catch (err: any) {
    if (isNotModifiedError(err)) return;
    // HTML parse failure — retry without formatting
    if (isParseError(err)) {
      try {
        await ctx.api.editMessageText(chatId, messageId, text);
      } catch (plainErr: any) {
        if (isNotModifiedError(plainErr)) return;
        await retryOnRateLimit(plainErr, () =>
          ctx.api.editMessageText(chatId, messageId, text)
        );
      }
      return;
    }
    await retryOnRateLimit(err, () =>
      ctx.api.editMessageText(chatId, messageId, html, { parse_mode: "HTML" })
    );
  }
}

function isNotModifiedError(err: any): boolean {
  const desc = err?.description ?? err?.message ?? "";
  return desc.includes("message is not modified") || desc.includes("MESSAGE_NOT_MODIFIED");
}

function isParseError(err: any): boolean {
  const desc = err?.description ?? err?.message ?? "";
  return desc.includes("can't parse") || desc.includes("Bad Request: can't parse");
}

async function retryOnRateLimit(err: any, fn: () => Promise<any>): Promise<void> {
  const desc = err?.description ?? err?.message ?? "";
  if (desc.includes("Too Many Requests") || desc.includes("retry_after")) {
    const retryAfter = err?.parameters?.retry_after ?? 3;
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    try { await fn(); } catch { /* give up after retry */ }
  } else {
    streamLogger.info({ err: desc }, "Telegram edit failed");
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
  return `<blockquote expandable>💭 <b>Thinking</b>\n${escapeHtml(text)}</blockquote>`;
}

/**
 * Compose final HTML with expandable reasoning blockquote + answer.
 */
function composeReasoningHtml(reasoning: string, answerHtml: string, maxReasoningLen: number): string {
  const reasoningBlock = formatReasoningBlockquote(reasoning, Math.max(maxReasoningLen, 200));
  return `${reasoningBlock}\n\n${answerHtml}`;
}

/**
 * Edit message with pre-composed HTML (no markdown conversion).
 */
async function safeEditRawHtml(
  ctx: Context,
  chatId: number,
  messageId: number,
  html: string,
): Promise<void> {
  try {
    await ctx.api.editMessageText(chatId, messageId, html, { parse_mode: "HTML" });
  } catch (err: any) {
    if (isNotModifiedError(err)) return;
    if (isParseError(err)) {
      // Fallback: strip HTML and send plain
      try {
        await ctx.api.editMessageText(chatId, messageId, html.replace(/<[^>]+>/g, ""));
      } catch (plainErr: any) {
        if (isNotModifiedError(plainErr)) return;
      }
      return;
    }
    await retryOnRateLimit(err, () =>
      ctx.api.editMessageText(chatId, messageId, html, { parse_mode: "HTML" })
    );
  }
}

/**
 * Send pre-chunked HTML messages with plain text fallback.
 */
async function sendHtmlChunks(
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

async function sendFinalResponse(
  ctx: Context,
  chatId: number,
  placeholderMsgId: number,
  text: string
): Promise<void> {
  const chunks = chunkMessage(text);

  // Convert to HTML for sending
  const html = markdownToHtml(text);
  const htmlChunks = chunkMessage(html);

  // If it fits in a single message, just edit the placeholder in place (no flash)
  if (htmlChunks.length === 1) {
    try {
      await ctx.api.editMessageText(chatId, placeholderMsgId, htmlChunks[0], { parse_mode: "HTML" });
      return;
    } catch {
      // HTML failed — try plain text edit
      try {
        await ctx.api.editMessageText(chatId, placeholderMsgId, chunks[0]);
        return;
      } catch {
        // Edit failed entirely — fall through to delete+resend
      }
    }
  }

  // Multiple chunks or edit failed — delete placeholder and send fresh messages
  try {
    await ctx.api.deleteMessage(chatId, placeholderMsgId);
  } catch {
    // May fail if message was already deleted
  }

  for (const chunk of htmlChunks) {
    try {
      await ctx.api.sendMessage(chatId, chunk, { parse_mode: "HTML" });
    } catch {
      // Fall back to plain text for this chunk
      const plainIdx = htmlChunks.indexOf(chunk);
      const plainChunk = plainIdx < chunks.length ? chunks[plainIdx] : chunk.replace(/<[^>]+>/g, "");
      await ctx.api.sendMessage(chatId, plainChunk);
    }
  }
}

async function sendPlainText(ctx: Context, text: string, chatId?: number): Promise<void> {
  const targetChatId = chatId ?? ctx.chat?.id;
  if (!targetChatId) return;

  // Send as file if very large
  if (text.length > 20000) {
    const buffer = Buffer.from(text, "utf-8");
    await ctx.api.sendDocument(targetChatId, new InputFile(buffer, "response.txt"));
    return;
  }

  // Convert to HTML and chunk
  const html = markdownToHtml(text);
  const chunks = chunkMessage(html);
  for (const chunk of chunks) {
    try {
      await ctx.api.sendMessage(targetChatId, chunk, { parse_mode: "HTML" });
    } catch {
      await ctx.api.sendMessage(targetChatId, chunk.replace(/<[^>]+>/g, ""));
    }
  }
}
