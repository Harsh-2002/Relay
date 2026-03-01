import type { Bot, Context } from "grammy";
import { getProvider } from "../providers/index.js";
import { getOrCreateSession, getSelectedModel, getSelectedAgent, withPromptQueue } from "../session.js";
import { isStreamingEnabled, streamPrompt } from "../utils/stream.js";
import { getSystemPrompt } from "../utils/system-prompt.js";
import { formatCatchError, EMPTY_RESPONSE_MSG } from "../utils/errors.js";
import { withTimeout, getPromptTimeout } from "../utils/timeout.js";
import { extractFileParts, sendResponseFiles } from "../utils/files.js";
import { sendReply } from "../utils/reply.js";
import { chatLogger } from "../utils/logger.js";

const MAX_INPUT_LENGTH = 32_000;

/**
 * If the user is replying to a previous message, prepend the quoted text
 * as context so the AI model knows what they're referring to.
 */
function buildPromptWithReplyContext(ctx: Context, text: string): string {
  const msg = ctx.message ?? ctx.editedMessage;
  const reply = (msg as any)?.reply_to_message;
  if (!reply) return text;

  const replyText = reply.text || reply.caption;
  if (!replyText) return text;

  const maxQuoteLen = 2000;
  const quote = replyText.length > maxQuoteLen
    ? replyText.slice(0, maxQuoteLen) + "..."
    : replyText;

  return `[Replying to: "${quote}"]\n\n${text}`;
}

/**
 * Core text message processing — shared by new messages and edited messages.
 */
async function handleTextMessage(ctx: Context, rawText: string, isEdit: boolean): Promise<void> {
  if (rawText.startsWith("/")) return;

  const text = buildPromptWithReplyContext(ctx, rawText);

  chatLogger.info({ from: ctx.from?.id, len: text.length, isReply: text !== rawText, isEdit }, "Inbound text message");

  if (rawText.length > MAX_INPUT_LENGTH) {
    chatLogger.info({ from: ctx.from?.id, len: rawText.length }, "Message rejected (too long)");
    await ctx.reply(
      `Message too long (${rawText.length.toLocaleString()} chars). ` +
      `Maximum is ${MAX_INPUT_LENGTH.toLocaleString()} characters. ` +
      `Send the content as a file instead.`,
      { parse_mode: "HTML" }
    );
    return;
  }

  try {
    await withPromptQueue(async () => {
      const sessionId = await getOrCreateSession();
      const model = getSelectedModel();
      const agent = getSelectedAgent();
      const system = getSystemPrompt();
      const provider = getProvider();
      const streaming = isStreamingEnabled() && !!provider.promptStream;

      chatLogger.info(
        { sessionId, model, agent, streaming },
        "Processing message"
      );

      if (streaming) {
        chatLogger.info({ sessionId }, "Routing to streaming prompt");
        const promptText = isEdit ? `[Edited message] ${text}` : text;
        const parts = [{ type: "text" as const, text: promptText }];
        await streamPrompt({ ctx, sessionId, parts, model, system, agent });
        return;
      }

      chatLogger.info({ sessionId }, "Routing to non-streaming prompt");

      const typingInterval = setInterval(() => {
        ctx.replyWithChatAction("typing").catch(() => {});
      }, 4000);
      await ctx.replyWithChatAction("typing");

      try {
        const startMs = Date.now();
        const promptText = isEdit ? `[Edited message] ${text}` : text;
        const result = await withTimeout(
          provider.prompt(sessionId, promptText, {
            parts: [{ type: "text" as const, text: promptText }],
            ...(model && { model }),
            ...(agent && { agent }),
            system,
          }),
          getPromptTimeout(),
          "Prompt"
        );

        if (!result.text.trim() || result.text === "(empty response)") {
          chatLogger.info({ sessionId }, "Empty response from provider");
          await ctx.reply(EMPTY_RESPONSE_MSG, { parse_mode: "HTML" });
          return;
        }

        chatLogger.info(
          { sessionId, durationMs: Date.now() - startMs, responseLen: result.text.length, reasoningLen: result.reasoning?.length ?? 0 },
          "Prompt completed"
        );
        await sendReply(ctx, result.text, result.reasoning);

        const files = extractFileParts(result.parts ?? []);
        if (files.length > 0) {
          chatLogger.info({ sessionId, filesCount: files.length }, "Sending file attachments");
          await sendResponseFiles(ctx, files);
        }
      } finally {
        clearInterval(typingInterval);
      }
    });
  } catch (err: any) {
    chatLogger.info({ err: err?.message }, "Chat error");
    await ctx.reply(formatCatchError(err, "sending message"), { parse_mode: "HTML" });
  }
}

export function registerChat(bot: Bot): void {
  // Handle new text messages
  bot.on("message:text", async (ctx) => {
    await handleTextMessage(ctx, ctx.message.text, false);
  });

  // Handle edited text messages — treat as a new prompt with [Edited message] prefix
  bot.on("edited_message:text", async (ctx) => {
    await handleTextMessage(ctx, ctx.editedMessage.text, true);
  });
}
