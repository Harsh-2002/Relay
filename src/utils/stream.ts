import type { Context } from "grammy";
import { getProvider } from "../providers/index.js";
import { startQuestionFlow } from "../commands/question.js";
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

  const chatId = ctx.chat!.id;

  // Keep typing indicator active
  await ctx.replyWithChatAction("typing");
  const typingInterval = setInterval(() => {
    ctx.replyWithChatAction("typing").catch(() => {});
  }, 4000);

  // Single message used throughout: thinking → streaming → final response.
  // Using sendMessage + editMessageText avoids the "pinned notification" banner
  // that sendMessageDraft causes in Telegram.
  let streamMsgId: number | null = null;
  let thinkingTimer: ReturnType<typeof setInterval> | null = null;
  let dotPhase = 0;
  try {
    const msg = await ctx.api.sendMessage(chatId, "Thinking.");
    streamMsgId = msg.message_id;
    thinkingTimer = setInterval(() => {
      if (!streamMsgId) return;
      dotPhase = (dotPhase % 3) + 1;
      ctx.api.editMessageText(chatId, streamMsgId, "Thinking" + ".".repeat(dotPhase))
        .catch(() => {}); // Ignore edit errors (rate limit, not modified, etc.)
    }, 500);
  } catch {
    // If sending the thinking message fails, continue without it
  }

  // Track whether we've transitioned from thinking → content streaming
  let contentStarted = false;

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
      } else if (chunk.type === "question" && chunk.question) {
        if (thinkingTimer) { clearInterval(thinkingTimer); thinkingTimer = null; }
        await startQuestionFlow(ctx, chatId, chunk.question, streamMsgId);
        streamMsgId = null;
        continue;
      } else if (chunk.type === "done") {
        break;
      }

      // Transition: thinking → content streaming (edit the same message, no delete)
      if (!contentStarted && (accumulated || toolStatus)) {
        contentStarted = true;
        if (thinkingTimer) { clearInterval(thinkingTimer); thinkingTimer = null; }
        if (streamMsgId) {
          const display = buildDisplayText(accumulated, toolStatus, reasoning);
          await safeEditStream(ctx, chatId, streamMsgId, display);
          lastEditedText = display;
          lastEditTime = Date.now();
          editCount++;
        }
        continue;
      }

      // Throttled edit updates (only after content streaming has started)
      if (contentStarted && streamMsgId) {
        const now = Date.now();
        if (now - lastEditTime >= getEditInterval()) {
          const display = buildDisplayText(accumulated, toolStatus, reasoning);
          if (display !== lastEditedText) {
            await safeEditStream(ctx, chatId, streamMsgId, display);
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
  }

  streamLogger.info(
    { sessionId, durationMs: Date.now() - startMs, chunkCount, editCount, responseLen: accumulated.length, reasoningLen: reasoning.length, filesCount: collectedFiles.length },
    "Stream completed"
  );

  // Final response — edit streamMsgId in-place (no pin banner).
  // Falls back to sendMessage if streamMsgId is unavailable.
  if (errorMsg) {
    if (streamMsgId) {
      const ok = await safeEditFinal(ctx, chatId, streamMsgId, errorMsg);
      if (!ok) await safeSendMessage(ctx, chatId, errorMsg, true);
    } else {
      await safeSendMessage(ctx, chatId, errorMsg, true);
    }
    return;
  }

  if (!accumulated.trim()) {
    if (streamMsgId) {
      const ok = await safeEditFinal(ctx, chatId, streamMsgId, EMPTY_RESPONSE_MSG);
      if (!ok) await safeSendMessage(ctx, chatId, EMPTY_RESPONSE_MSG, true);
    } else {
      await safeSendMessage(ctx, chatId, EMPTY_RESPONSE_MSG, true);
    }
    return;
  }

  const cleanedText = stripMarkdownImages(accumulated);
  const answerHtml = markdownToHtml(cleanedText);
  const answerHtmlChunks = chunkMessage(answerHtml);
  const fitsInOneMessage = answerHtmlChunks.length === 1;

  if (reasoning && fitsInOneMessage) {
    // Reasoning + answer fit in one message — use expandable blockquote
    const maxReasoningLen = 4000 - answerHtml.length - 80; // 80 chars overhead for tags
    const finalHtml = composeReasoningHtml(reasoning, answerHtml, maxReasoningLen);
    if (streamMsgId) {
      const ok = await safeEditFinal(ctx, chatId, streamMsgId, finalHtml);
      if (!ok) await safeSendMessage(ctx, chatId, finalHtml, true);
    } else {
      await safeSendMessage(ctx, chatId, finalHtml, true);
    }
  } else if (reasoning) {
    // Answer too long for one message — edit streamMsgId with reasoning, send answer chunks after
    const reasoningHtml = formatReasoningBlockquote(reasoning, 3900);
    if (streamMsgId) {
      const ok = await safeEditFinal(ctx, chatId, streamMsgId, reasoningHtml);
      if (!ok) {
        try { await ctx.api.sendMessage(chatId, reasoningHtml, { parse_mode: "HTML" }); } catch {}
      }
    } else {
      try { await ctx.api.sendMessage(chatId, reasoningHtml, { parse_mode: "HTML" }); } catch {}
    }
    await sendFinalChunks(ctx, chatId, answerHtmlChunks, chunkMessage(accumulated));
  } else if (fitsInOneMessage) {
    // No reasoning, fits in one message — edit in-place
    if (streamMsgId) {
      const ok = await safeEditFinal(ctx, chatId, streamMsgId, answerHtml);
      if (!ok) await safeSendMessage(ctx, chatId, answerHtml, true);
    } else {
      await safeSendMessage(ctx, chatId, answerHtml, true);
    }
  } else {
    // No reasoning, multi-chunk — edit first chunk in-place, send rest as new messages
    const plainChunks = chunkMessage(accumulated);
    if (streamMsgId) {
      const ok = await safeEditFinal(ctx, chatId, streamMsgId, answerHtmlChunks[0]);
      if (!ok) {
        // Fallback: send all chunks as new messages
        await sendFinalChunks(ctx, chatId, answerHtmlChunks, plainChunks);
      } else {
        // Send remaining chunks as new messages
        await sendFinalChunks(ctx, chatId, answerHtmlChunks.slice(1), plainChunks.slice(1));
      }
    } else {
      await sendFinalChunks(ctx, chatId, answerHtmlChunks, plainChunks);
    }
  }

  // Send any collected file attachments
  if (collectedFiles.length > 0) {
    await sendResponseFiles(ctx, collectedFiles);
  }
}

/**
 * Wrapper around streamPrompt that handles stale session recovery.
 * If the session no longer exists (e.g. after OpenCode server reconnection),
 * clears the active session, creates a new one, and retries.
 */
export async function streamPromptWithRetry(opts: StreamPromptOptions): Promise<void> {
  try {
    await streamPrompt(opts);
  } catch (err: any) {
    if (isSessionStaleError(err)) {
      streamLogger.info({ sessionId: opts.sessionId }, "Session stale — retrying with new session");
      const { clearActiveSession, getOrCreateSession } = await import("../session.js");
      clearActiveSession();
      const newSessionId = await getOrCreateSession();
      await streamPrompt({ ...opts, sessionId: newSessionId });
    } else {
      throw err;
    }
  }
}

function isSessionStaleError(err: any): boolean {
  const msg = (err?.message ?? "").toLowerCase();
  return msg.includes("session") && (msg.includes("not found") || msg.includes("404") || msg.includes("stale"));
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
  // Strip markdown images (Telegram can't render inline images)
  display = stripMarkdownImages(display);
  // Close any unclosed code fences so markdown→HTML conversion works
  display = closeUnterminatedCodeFences(display);
  return display;
}

/**
 * Strip markdown image syntax (![alt](url)) from text.
 * Telegram can't render inline images — actual files are sent as separate photo messages.
 * Protects code blocks so ![...] inside ``` fences is preserved.
 */
function stripMarkdownImages(text: string): string {
  const codeBlocks: string[] = [];
  let result = text.replace(/```[\s\S]*?```/g, (m) => {
    codeBlocks.push(m);
    return `\x00CBLK${codeBlocks.length - 1}\x00`;
  });
  result = result.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  result = result.replace(/\x00CBLK(\d+)\x00/g, (_, i) => codeBlocks[+i]);
  return result.replace(/\n{3,}/g, "\n\n").trim();
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
 * Edit the streaming message with intermediate content.
 * Falls back to plain text on HTML parse error; skips silently on rate limit or "not modified".
 */
async function safeEditStream(
  ctx: Context,
  chatId: number,
  msgId: number,
  text: string,
): Promise<void> {
  const html = markdownToHtml(text);
  try {
    await ctx.api.editMessageText(chatId, msgId, html, { parse_mode: "HTML" });
  } catch (err: any) {
    if (isParseError(err)) {
      try { await ctx.api.editMessageText(chatId, msgId, text); } catch {}
      return;
    }
    // Skip silently on rate limit or "not modified" — next tick retries
    if (isRateLimitError(err) || isNotModifiedError(err)) return;
    streamLogger.info({ err: err?.message ?? err?.description }, "Stream edit failed");
  }
}

/**
 * Edit the streaming message with final formatted HTML.
 * Returns true on success, false on failure (caller should fall back to sendMessage).
 */
async function safeEditFinal(
  ctx: Context,
  chatId: number,
  msgId: number,
  html: string,
): Promise<boolean> {
  try {
    await ctx.api.editMessageText(chatId, msgId, html, { parse_mode: "HTML" });
    return true;
  } catch (err: any) {
    if (isParseError(err)) {
      try {
        await ctx.api.editMessageText(chatId, msgId, html.replace(/<[^>]+>/g, ""));
        return true;
      } catch { return false; }
    }
    if (isRateLimitError(err)) {
      const retry = err?.parameters?.retry_after ?? 3;
      await new Promise(r => setTimeout(r, retry * 1000));
      try {
        await ctx.api.editMessageText(chatId, msgId, html, { parse_mode: "HTML" });
        return true;
      } catch { return false; }
    }
    return false;
  }
}

/**
 * Send a final message via sendMessage.
 * Used as fallback when streamMsgId is unavailable or edit fails.
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

function isNotModifiedError(err: any): boolean {
  const desc = err?.description ?? err?.message ?? "";
  return desc.includes("message is not modified");
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
 * Send multi-chunk messages. Each chunk is sent as a new message.
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
