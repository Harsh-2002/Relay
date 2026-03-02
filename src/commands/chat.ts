import type { Bot, Context } from "grammy";
import { getOrCreateSession, getSelectedModel, getSelectedAgent, withPromptQueue } from "../session.js";
import { streamPrompt } from "../utils/stream.js";
import { getSystemPrompt } from "../utils/system-prompt.js";
import { formatCatchError } from "../utils/errors.js";
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
      chatLogger.info(
        { sessionId, model, agent },
        "Processing message"
      );

      const promptText = isEdit ? `[Edited message] ${text}` : text;
      const parts = [{ type: "text" as const, text: promptText }];
      await streamPrompt({ ctx, sessionId, parts, model, system, agent });
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
