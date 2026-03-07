import type { Bot, Context } from "grammy";
import { getOrCreateSession, getSelectedModel, getSelectedAgent, withPromptQueue } from "../session.js";
import { streamPromptWithRetry } from "../utils/stream.js";
import { getSystemPrompt } from "../utils/system-prompt.js";
import { formatCatchError } from "../utils/errors.js";
import { chatLogger } from "../utils/logger.js";
import { consumePendingTextQuestion } from "./question.js";
import { consumePendingInput } from "../utils/input.js";
import { transcribeAudio, isSttAvailable } from "../utils/stt.js";
import { downloadTelegramFileBuffer } from "../utils/media.js";
import { getConfig } from "../config/index.js";

const MAX_INPUT_LENGTH = 32_000;

/**
 * If the user is replying to a previous message, prepend the quoted text
 * as context so the AI model knows what they're referring to.
 * Supports text, captions, and voice/audio replies (via STT transcription).
 */
async function buildPromptWithReplyContext(ctx: Context, text: string): Promise<string> {
  const msg = ctx.message ?? ctx.editedMessage;
  const reply = (msg as any)?.reply_to_message;
  if (!reply) return text;

  const replyText = reply.text || reply.caption;
  if (replyText) {
    const maxQuoteLen = 2000;
    const quote = replyText.length > maxQuoteLen
      ? replyText.slice(0, maxQuoteLen) + "..."
      : replyText;
    return `[Replying to: "${quote}"]\n\n${text}`;
  }

  // Voice/audio reply — attempt transcription
  const voiceOrAudio = reply.voice ?? reply.audio;
  if (!voiceOrAudio) return text;

  if (!isSttAvailable()) {
    chatLogger.info("Reply target is voice/audio but STT not configured, skipping transcription");
    return text;
  }

  try {
    const file = await ctx.api.getFile(voiceOrAudio.file_id);
    if (!file.file_path) {
      chatLogger.info("Reply target voice/audio file_path is null (too large), skipping");
      return text;
    }

    const buffer = await downloadTelegramFileBuffer(getConfig().botToken, file.file_path);
    const isVoice = !!reply.voice;
    const fileName = isVoice ? `reply_voice_${Date.now()}.ogg` : (reply.audio?.file_name ?? `reply_audio_${Date.now()}.mp3`);
    const duration = voiceOrAudio.duration ?? 0;

    const result = await transcribeAudio(buffer, fileName, duration);
    if (!result.text || result.text.trim().length === 0) {
      chatLogger.info("Reply target voice/audio transcription returned empty, skipping");
      return text;
    }

    const maxQuoteLen = 2000;
    const quote = result.text.length > maxQuoteLen
      ? result.text.slice(0, maxQuoteLen) + "..."
      : result.text;
    const label = isVoice ? "voice message" : "audio";
    return `[Replying to ${label}: "${quote}"]\n\n${text}`;
  } catch (err: any) {
    chatLogger.info({ err: err?.message }, "Failed to transcribe reply target voice/audio, skipping");
    return text;
  }
}

/**
 * Core text message processing — shared by new messages and edited messages.
 */
async function handleTextMessage(ctx: Context, rawText: string, isEdit: boolean): Promise<void> {
  if (rawText.startsWith("/")) return;

  // Check for pending typed answer to an AI question (only for new messages, not edits)
  if (!isEdit) {
    const pending = consumePendingTextQuestion(ctx.chat!.id);
    if (pending) {
      await pending.handle(rawText, ctx);
      return;
    }
  }

  // Check for pending command input (e.g. /shell without args prompts for input)
  if (!isEdit) {
    const inputHandler = consumePendingInput(ctx.chat!.id);
    if (inputHandler) {
      await inputHandler(rawText, ctx);
      return;
    }
  }

  // Show typing indicator if voice/audio transcription will happen
  const reply = ((ctx.message ?? ctx.editedMessage) as any)?.reply_to_message;
  if (reply?.voice || reply?.audio) {
    await ctx.replyWithChatAction("typing");
  }
  const text = await buildPromptWithReplyContext(ctx, rawText);

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

  // Fire-and-forget: don't block grammY's update processing so /abort
  // and other commands can be handled while a stream is running.
  // The prompt queue still serializes actual prompt execution.
  withPromptQueue(async () => {
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
    await streamPromptWithRetry({ ctx, sessionId, parts, model, system, agent });
  }).catch(async (err: any) => {
    chatLogger.info({ err: err?.message }, "Chat error");
    ctx.reply(formatCatchError(err, "sending message"), { parse_mode: "HTML" }).catch(() => {});
  });
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
