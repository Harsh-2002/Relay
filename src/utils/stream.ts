import type { Context } from "grammy";
import { InputFile } from "grammy";
import { getProvider } from "../providers/index.js";
import { chunkMessage } from "./chunker.js";
import { formatCatchError, EMPTY_RESPONSE_MSG } from "./errors.js";
import { sendResponseFiles, type ResponseFile } from "./files.js";

const EDIT_INTERVAL = Number(process.env.STREAM_EDIT_INTERVAL_MS) || 2000;

export function isStreamingEnabled(): boolean {
  return process.env.STREAMING_ENABLED === "true";
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
    await sendFinalText(ctx, result.text);
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

      // Throttled edit
      const now = Date.now();
      if (now - lastEditTime >= EDIT_INTERVAL) {
        const display = buildDisplayText(accumulated, toolStatus);
        await safeEditMessage(ctx, chatId, messageId, display);
        lastEditTime = now;
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

  await sendFinalResponse(ctx, chatId, messageId, accumulated);

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
    display = display.slice(-4000) + "\n\n(streaming...)";
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
    // Ignore "message is not modified" and rate limit errors
    const desc = err?.description ?? err?.message ?? "";
    if (
      desc.includes("message is not modified") ||
      desc.includes("MESSAGE_NOT_MODIFIED")
    ) {
      return;
    }
    if (desc.includes("Too Many Requests") || desc.includes("retry_after")) {
      const retryAfter = err?.parameters?.retry_after ?? 3;
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      try {
        await ctx.api.editMessageText(chatId, messageId, text, html ? { parse_mode: "HTML" } : undefined);
      } catch {
        // Give up
      }
    }
  }
}

async function sendFinalResponse(
  ctx: Context,
  chatId: number,
  placeholderMsgId: number,
  text: string
): Promise<void> {
  // Delete placeholder
  try {
    await ctx.api.deleteMessage(chatId, placeholderMsgId);
  } catch {
    // May fail if message was already deleted
  }

  await sendFinalText(ctx, text, chatId);
}

async function sendFinalText(ctx: Context, text: string, chatId?: number): Promise<void> {
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
