import type { Context } from "grammy";
import { InputFile } from "grammy";
import { getClient } from "../client.js";
import { formatParts } from "./formatter.js";
import { chunkMessage } from "./chunker.js";
import { formatCatchError, EMPTY_RESPONSE_MSG } from "./errors.js";
import type { Event as OcEvent } from "@opencode-ai/sdk";

const EDIT_INTERVAL = Number(process.env.STREAM_EDIT_INTERVAL_MS) || 2000;
const STREAM_TIMEOUT = 5 * 60 * 1000; // 5 minutes

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
  const client = getClient();

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

  try {
    // Fire async prompt
    await client.session.promptAsync({
      path: { id: sessionId },
      body: {
        parts: parts as any,
        ...(model && { model }),
        ...(system && { system }),
      },
    });

    // Subscribe to SSE events
    const sseResult = await client.event.subscribe();
    const stream = sseResult.stream;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STREAM_TIMEOUT);

    try {
      for await (const event of stream) {
        if (controller.signal.aborted) break;

        const evt = event as OcEvent;

        // Filter by session ID
        if (!matchesSession(evt, sessionId)) continue;

        if (evt.type === "message.part.updated") {
          const { part, delta } = evt.properties;
          if (part.type === "text") {
            if (delta) {
              accumulated += delta;
            } else if (part.text && !accumulated.endsWith(part.text)) {
              // Fallback: use full text if no delta provided
              accumulated = part.text;
            }
          } else if (part.type === "tool") {
            const toolName = part.tool;
            if (part.state.status === "running") {
              toolStatus = `[${part.state.title || toolName}...]`;
            } else if (part.state.status === "completed") {
              toolStatus = `[${part.state.title || toolName} done]`;
            } else if (part.state.status === "error") {
              toolStatus = `[${toolName} error]`;
            }
          }

          // Throttled edit
          const now = Date.now();
          if (now - lastEditTime >= EDIT_INTERVAL) {
            const display = buildDisplayText(accumulated, toolStatus);
            await safeEditMessage(ctx, chatId, messageId, display);
            lastEditTime = now;
          }
        } else if (evt.type === "session.idle") {
          break;
        } else if (evt.type === "session.error") {
          const rawError = (evt.properties as any).error ?? "Unknown session error";
          errorMsg = formatCatchError(rawError, "processing request");
          break;
        }
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch (err: any) {
    errorMsg = formatCatchError(err, "streaming response");
  } finally {
    clearInterval(typingInterval);
  }

  // Final response
  if (errorMsg) {
    // errorMsg is already HTML-formatted from formatCatchError, or raw from session.error
    await safeEditMessage(ctx, chatId, messageId, errorMsg, true);
    return;
  }

  if (!accumulated.trim()) {
    // No text accumulated — try fetching the full response via messages API
    try {
      const msgs = await client.session.messages({ path: { id: sessionId } });
      const messages = msgs.data ?? [];
      const lastAssistant = [...messages]
        .reverse()
        .find((m: any) => m.info?.role === "assistant");
      if (lastAssistant) {
        const response = formatParts((lastAssistant as any).parts ?? []);
        await sendFinalResponse(ctx, chatId, messageId, response);
        return;
      }
    } catch {
      // Fallback
    }
    await safeEditMessage(ctx, chatId, messageId, EMPTY_RESPONSE_MSG, true);
    return;
  }

  await sendFinalResponse(ctx, chatId, messageId, accumulated);
}

function matchesSession(event: OcEvent, sessionId: string): boolean {
  if (!("properties" in event)) return false;
  const props = event.properties as any;
  if (props.sessionID && props.sessionID !== sessionId) return false;
  if (props.part?.sessionID && props.part.sessionID !== sessionId) return false;
  return true;
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
      // Wait and retry once
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

  // Send as file if very large
  if (text.length > 20000) {
    const buffer = Buffer.from(text, "utf-8");
    await ctx.api.sendDocument(chatId, new InputFile(buffer, "response.txt"));
    return;
  }

  // Chunk and send
  const chunks = chunkMessage(text);
  for (const chunk of chunks) {
    try {
      await ctx.api.sendMessage(chatId, chunk, { parse_mode: "Markdown" });
    } catch {
      await ctx.api.sendMessage(chatId, chunk);
    }
  }
}
