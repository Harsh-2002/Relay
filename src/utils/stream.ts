import type { Context } from "grammy";
import { InputFile } from "grammy";
import { getProvider } from "../providers/index.js";
import { chunkMessage } from "./chunker.js";
import { formatCatchError, EMPTY_RESPONSE_MSG } from "./errors.js";
import { sendResponseFiles, type ResponseFile } from "./files.js";
import { getConfig } from "../config/index.js";
import { providerLogger } from "./logger.js";

function getEditInterval(): number {
  return getConfig().streamEditIntervalMs;
}

export function isStreamingEnabled(): boolean {
  return getConfig().streamingEnabled;
}

export interface StreamPromptOptions {
  ctx: Context;
  sessionId: string;
  parts: Array<{ type: "text"; text: string } | { type: "file"; mime: string; filename?: string; url: string }>;
  model?: { providerID: string; modelID: string } | null;
  system?: string;
}

export async function streamPrompt({
  ctx,
  sessionId,
  parts,
  model,
  system,
}: StreamPromptOptions): Promise<void> {
  const provider = getProvider();

  if (!provider.promptStream) {
    // Fallback to non-streaming prompt
    const result = await provider.prompt(sessionId, parts[0]?.type === "text" ? (parts[0] as any).text : "", {
      parts: parts as any,
      ...(model && { model }),
      ...(system && { system }),
    });
    await sendPlainText(ctx, result.text);
    return;
  }

  // Send placeholder
  const placeholder = await ctx.reply("Thinking...");
  const chatId = placeholder.chat.id;
  const messageId = placeholder.message_id;

  // Keep typing indicator active
  const typingInterval = setInterval(() => {
    ctx.replyWithChatAction("typing").catch(() => {});
  }, 4000);

  let accumulated = "";
  let toolStatus = "";
  let lastEditTime = 0;
  let lastEditedText = "";
  let errorMsg: string | null = null;
  const collectedFiles: ResponseFile[] = [];

  try {
    const stream = provider.promptStream(sessionId, parts[0]?.type === "text" ? (parts[0] as any).text : "", {
      parts: parts as any,
      ...(model && { model }),
      ...(system && { system }),
    });

    for await (const chunk of stream) {
      if (chunk.type === "text") {
        accumulated += chunk.content;
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
        const display = buildDisplayText(accumulated, toolStatus);
        if (display !== lastEditedText) {
          await safeEditMarkdown(ctx, chatId, messageId, display);
          lastEditedText = display;
          lastEditTime = now;
        }
      }
    }
  } catch (err: any) {
    errorMsg = formatCatchError(err, "streaming response");
  } finally {
    clearInterval(typingInterval);
  }

  // Final response
  if (errorMsg) {
    await safeEditMessage(ctx, chatId, messageId, errorMsg, true);
    return;
  }

  if (!accumulated.trim()) {
    await safeEditMessage(ctx, chatId, messageId, EMPTY_RESPONSE_MSG, true);
    return;
  }

  const finalDisplay = buildDisplayText(accumulated, "");
  const chunks = chunkMessage(accumulated);

  if (chunks.length <= 1 && finalDisplay === lastEditedText) {
    // Already showing the complete response — nothing to do
  } else if (chunks.length <= 1) {
    // Fits in one message but last streaming edit was throttled — do one final edit
    await safeEditMarkdown(ctx, chatId, messageId, finalDisplay);
  } else {
    // Too long for one message — delete placeholder and send as multiple messages
    await sendFinalResponse(ctx, chatId, messageId, accumulated);
  }

  // Send any collected file attachments
  if (collectedFiles.length > 0) {
    await sendResponseFiles(ctx, collectedFiles);
  }
}

function buildDisplayText(text: string, toolStatus: string): string {
  let display = text || "Thinking...";
  if (toolStatus) {
    display += `\n\n${toolStatus}`;
  }
  // Telegram message limit is 4096
  if (display.length > 4000) {
    display = display.slice(0, 4000) + "\n\n(streaming...)";
  }
  return display;
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
 * Edit a message with Markdown formatting. Falls back to plain text if Markdown parsing fails.
 * This is used for streaming edits so the final message doesn't need a re-render.
 */
async function safeEditMarkdown(
  ctx: Context,
  chatId: number,
  messageId: number,
  text: string,
): Promise<void> {
  try {
    await ctx.api.editMessageText(chatId, messageId, text, { parse_mode: "Markdown" });
  } catch (err: any) {
    if (isNotModifiedError(err)) return;
    // Markdown parse failure — retry without formatting
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
      ctx.api.editMessageText(chatId, messageId, text, { parse_mode: "Markdown" })
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
    providerLogger.warn({ err: desc }, "Telegram edit failed");
  }
}

async function sendFinalResponse(
  ctx: Context,
  chatId: number,
  placeholderMsgId: number,
  text: string
): Promise<void> {
  const chunks = chunkMessage(text);

  // If it fits in a single message, just edit the placeholder in place (no flash)
  if (chunks.length === 1) {
    try {
      await ctx.api.editMessageText(chatId, placeholderMsgId, chunks[0], { parse_mode: "Markdown" });
      return;
    } catch {
      // Markdown failed — try plain text edit
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

  for (const chunk of chunks) {
    try {
      await ctx.api.sendMessage(chatId, chunk, { parse_mode: "Markdown" });
    } catch {
      await ctx.api.sendMessage(chatId, chunk);
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

  // Chunk and send
  const chunks = chunkMessage(text);
  for (const chunk of chunks) {
    try {
      await ctx.api.sendMessage(targetChatId, chunk, { parse_mode: "Markdown" });
    } catch {
      await ctx.api.sendMessage(targetChatId, chunk);
    }
  }
}
