import type { Context } from "grammy";
import { InputFile } from "grammy";
import { chunkMessage } from "./chunker.js";
import { markdownToHtml } from "./markdown.js";
import { formatReasoningBlockquote } from "./stream.js";
import logger from "./logger.js";

const replyLogger = logger.child({ component: "reply" });

/**
 * Send a text response to Telegram with reasoning support, HTML formatting,
 * chunking, and plain-text fallback. Shared by chat and media handlers.
 */
export async function sendReply(ctx: Context, text: string, reasoning?: string): Promise<void> {
  // Very large responses: send as a file
  if (text.length > 20000) {
    if (reasoning) {
      const reasoningBlock = formatReasoningBlockquote(reasoning, 3900);
      try {
        await ctx.reply(reasoningBlock, { parse_mode: "HTML" });
      } catch {
        // Skip reasoning if it fails
      }
    }
    const buffer = Buffer.from(text, "utf-8");
    await ctx.replyWithDocument(new InputFile(buffer, "response.txt"));
    return;
  }

  const answerHtml = markdownToHtml(text);
  const answerChunks = chunkMessage(answerHtml);
  const fitsInOne = answerChunks.length === 1;

  // Reasoning + answer in one message if it fits
  if (reasoning && fitsInOne) {
    const maxReasoningLen = 4000 - answerHtml.length - 80;
    const reasoningBlock = formatReasoningBlockquote(reasoning, Math.max(maxReasoningLen, 200));
    const combined = `${reasoningBlock}\n\n${answerHtml}`;
    try {
      await ctx.reply(combined, { parse_mode: "HTML" });
      return;
    } catch {
      // Blockquote failed — fall through to send without reasoning
    }
  }

  // Reasoning as separate message if answer is multi-chunk
  if (reasoning) {
    const reasoningBlock = formatReasoningBlockquote(reasoning, 3900);
    try {
      await ctx.reply(reasoningBlock, { parse_mode: "HTML" });
    } catch {
      // Skip reasoning if it fails
    }
  }

  // Send answer chunks with HTML, falling back to plain text on parse errors
  const plainChunks = chunkMessage(text);
  for (let i = 0; i < answerChunks.length; i++) {
    try {
      await ctx.reply(answerChunks[i], { parse_mode: "HTML" });
    } catch (sendErr: any) {
      const desc = sendErr?.description ?? sendErr?.message ?? "";
      if (!desc.includes("can't parse")) {
        replyLogger.warn({ err: desc }, "Failed to send message chunk");
      }
      const plain = i < plainChunks.length ? plainChunks[i] : answerChunks[i].replace(/<[^>]+>/g, "");
      await ctx.reply(plain);
    }
  }
}
