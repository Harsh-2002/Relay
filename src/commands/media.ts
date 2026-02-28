import type { Bot } from "grammy";
import { getProvider } from "../providers/index.js";
import { getOrCreateSession, getSelectedModel } from "../session.js";
import { chunkMessage } from "../utils/chunker.js";
import { downloadTelegramFile, downloadTelegramFileBuffer } from "../utils/media.js";
import { transcribeAudio, isSttAvailable } from "../utils/stt.js";
import { isStreamingEnabled, streamPrompt } from "../utils/stream.js";
import { getSystemPrompt } from "../utils/system-prompt.js";
import { formatCatchError, EMPTY_RESPONSE_MSG } from "../utils/errors.js";
import { withTimeout, getPromptTimeout } from "../utils/timeout.js";
import { extractFileParts, sendResponseFiles } from "../utils/files.js";
import { readFileSync } from "fs";
import { getConfig } from "../config/index.js";
import { chatLogger } from "../utils/logger.js";

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

function getBotToken(): string {
  return getConfig().botToken;
}

export function registerMediaHandlers(bot: Bot): void {
  bot.on("message:document", async (ctx) => {
    try {
      const doc = ctx.message.document;
      const file = await ctx.getFile();
      const fileName = doc.file_name ?? `file_${Date.now()}`;

      await ctx.replyWithChatAction("typing");

      const localPath = await downloadTelegramFile(getBotToken(), file.file_path!, fileName);
      const caption = ctx.message.caption ?? `I've shared a file: ${fileName}. Please review it.`;

      const isTextFile = isTextMime(doc.mime_type) || isTextExtension(fileName);
      let promptText: string;

      if (isTextFile) {
        let content: string;
        try {
          content = readFileSync(localPath, "utf-8");
        } catch {
          await ctx.reply("Failed to read the uploaded file. Please try again.", { parse_mode: "HTML" });
          return;
        }
        if (content.length <= 500_000) {
          promptText = `${caption}\n\nFile: ${fileName}\n\`\`\`\n${content}\n\`\`\``;
        } else {
          // Chunked: first 100K chars + last 10K chars for very large files
          const head = content.slice(0, 100_000);
          const tail = content.slice(-10_000);
          const omitted = content.length - 110_000;
          promptText = `${caption}\n\nFile: ${fileName} (${content.length} chars, truncated)\n\`\`\`\n${head}\n\n... [${omitted} characters omitted] ...\n\n${tail}\n\`\`\``;
        }

        const sessionId = await getOrCreateSession();
        const provider = getProvider();
        const model = getSelectedModel();
        const system = getSystemPrompt();
        const parts: any[] = [{ type: "text" as const, text: promptText }];

        if (isStreamingEnabled() && provider.promptStream) {
          await streamPrompt({ ctx, sessionId, parts, model, system });
        } else {
          const result = await withTimeout(
            provider.prompt(sessionId, promptText, {
              parts,
              ...(model && { model }),
              system,
            }),
            getPromptTimeout(),
            "Prompt"
          );

          if (!result.text.trim() || result.text === "(empty response)") {
            await ctx.reply(EMPTY_RESPONSE_MSG, { parse_mode: "HTML" });
            return;
          }
          await sendTextChunks(ctx, result.text);
          await sendFiles(ctx, result.parts);
        }
        return;
      } else if (isImageMime(doc.mime_type) || isPdfMime(doc.mime_type)) {
        // Image or PDF document: read buffer and send as file part
        const buffer = await downloadTelegramFileBuffer(getBotToken(), file.file_path!);

        if (buffer.length > MAX_ATTACHMENT_BYTES) {
          const sizeMB = (buffer.length / (1024 * 1024)).toFixed(1);
          await ctx.reply(
            `File is too large (${sizeMB} MB). Maximum attachment size is 15 MB.`,
            { parse_mode: "HTML" }
          );
          return;
        }

        const base64 = buffer.toString("base64");
        const mime = doc.mime_type!;
        const dataUrl = `data:${mime};base64,${base64}`;

        promptText = `${caption}\n\n(Attached file: ${fileName}, ${doc.file_size ?? "unknown"} bytes)`;

        const parts: any[] = [
          { type: "text" as const, text: promptText },
          { type: "file" as const, mime, filename: fileName, url: dataUrl },
        ];

        const sessionId = await getOrCreateSession();
        const provider = getProvider();
        const model = getSelectedModel();
        const system = getSystemPrompt();

        if (isStreamingEnabled() && provider.promptStream) {
          await streamPrompt({ ctx, sessionId, parts, model, system });
        } else {
          const result = await withTimeout(
            provider.prompt(sessionId, promptText, {
              parts,
              ...(model && { model }),
              system,
            }),
            getPromptTimeout(),
            "Prompt"
          );

          if (!result.text.trim() || result.text === "(empty response)") {
            await ctx.reply(EMPTY_RESPONSE_MSG, { parse_mode: "HTML" });
            return;
          }
          await sendTextChunks(ctx, result.text);
          await sendFiles(ctx, result.parts);
        }
        return;
      } else {
        promptText = `${caption}\n\n(Binary file: ${fileName}, ${doc.file_size ?? "unknown"} bytes)`;
      }

      const sessionId = await getOrCreateSession();
      const provider = getProvider();
      const model = getSelectedModel();
      const system = getSystemPrompt();

      const result = await withTimeout(
        provider.prompt(sessionId, promptText, {
          parts: [{ type: "text", text: promptText }],
          ...(model && { model }),
          system,
        }),
        getPromptTimeout(),
        "Prompt"
      );

      if (!result.text.trim() || result.text === "(empty response)") {
        await ctx.reply(EMPTY_RESPONSE_MSG, { parse_mode: "HTML" });
        return;
      }
      await sendTextChunks(ctx, result.text);
      await sendFiles(ctx, result.parts);
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "handling file"), { parse_mode: "HTML" });
    }
  });

  bot.on("message:photo", async (ctx) => {
    try {
      const photos = ctx.message.photo;
      const largest = photos[photos.length - 1];
      const file = await ctx.api.getFile(largest.file_id);
      const fileName = `photo_${Date.now()}.jpg`;

      await ctx.replyWithChatAction("typing");

      const buffer = await downloadTelegramFileBuffer(getBotToken(), file.file_path!);

      if (buffer.length > MAX_ATTACHMENT_BYTES) {
        const sizeMB = (buffer.length / (1024 * 1024)).toFixed(1);
        await ctx.reply(
          `Photo is too large (${sizeMB} MB). Maximum attachment size is 15 MB.`,
          { parse_mode: "HTML" }
        );
        return;
      }

      const caption = ctx.message.caption ?? "I've shared a photo. Please review it.";

      // Send as FilePartInput with base64 data URL for vision models
      const base64 = buffer.toString("base64");
      const dataUrl = `data:image/jpeg;base64,${base64}`;

      const parts: any[] = [
        { type: "text" as const, text: caption },
        {
          type: "file" as const,
          mime: "image/jpeg",
          filename: fileName,
          url: dataUrl,
        },
      ];

      // Also save locally for reference
      await downloadTelegramFile(getBotToken(), file.file_path!, fileName);

      const sessionId = await getOrCreateSession();
      const model = getSelectedModel();
      const system = getSystemPrompt();
      const provider = getProvider();

      if (isStreamingEnabled() && provider.promptStream) {
        await streamPrompt({ ctx, sessionId, parts, model, system });
      } else {
        const result = await withTimeout(
          provider.prompt(sessionId, caption, {
            parts,
            ...(model && { model }),
            system,
          }),
          getPromptTimeout(),
          "Prompt"
        );

        if (!result.text.trim() || result.text === "(empty response)") {
          await ctx.reply(EMPTY_RESPONSE_MSG, { parse_mode: "HTML" });
          return;
        }
        await sendTextChunks(ctx, result.text);
        await sendFiles(ctx, result.parts);
      }
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "handling photo"), { parse_mode: "HTML" });
    }
  });

  bot.on("message:voice", async (ctx) => {
    if (!isSttAvailable()) {
      await ctx.reply(
        "Voice messages not supported. Configure <code>GROQ_API_KEY</code>, <code>OPENAI_API_KEY</code>, or <code>ASSEMBLYAI_API_KEY</code>.",
        { parse_mode: "HTML" }
      );
      return;
    }

    try {
      await ctx.replyWithChatAction("typing");

      const file = await ctx.getFile();
      const fileName = `voice_${Date.now()}.ogg`;

      const buffer = await downloadTelegramFileBuffer(getBotToken(), file.file_path!);
      const result = await transcribeAudio(buffer, fileName);

      if (!result.text || result.text.trim().length === 0) {
        await ctx.reply("Could not transcribe voice message (empty result).", { parse_mode: "HTML" });
        return;
      }

      const sessionId = await getOrCreateSession();
      const model = getSelectedModel();
      const system = getSystemPrompt();
      const provider = getProvider();
      const promptParts = [{ type: "text" as const, text: result.text }];

      if (isStreamingEnabled() && provider.promptStream) {
        await streamPrompt({ ctx, sessionId, parts: promptParts, model, system });
      } else {
        await ctx.replyWithChatAction("typing");

        const promptResult = await withTimeout(
          provider.prompt(sessionId, result.text, {
            parts: promptParts,
            ...(model && { model }),
            system,
          }),
          getPromptTimeout(),
          "Prompt"
        );

        if (!promptResult.text.trim() || promptResult.text === "(empty response)") {
          await ctx.reply(EMPTY_RESPONSE_MSG, { parse_mode: "HTML" });
          return;
        }
        await sendTextChunks(ctx, promptResult.text);
        await sendFiles(ctx, promptResult.parts);
      }
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "handling voice message"), { parse_mode: "HTML" });
    }
  });

  bot.on("message:audio", async (ctx) => {
    try {
      const audio = ctx.message.audio;
      const file = await ctx.getFile();
      const fileName = audio.file_name ?? `audio_${Date.now()}.mp3`;

      await ctx.replyWithChatAction("typing");

      if (isSttAvailable()) {
        const buffer = await downloadTelegramFileBuffer(getBotToken(), file.file_path!);
        const result = await transcribeAudio(buffer, fileName);

        if (result.text && result.text.trim().length > 0) {
          await ctx.replyWithChatAction("typing");

          const sessionId = await getOrCreateSession();
          const provider = getProvider();
          const model = getSelectedModel();
          const system = getSystemPrompt();

          const promptResult = await withTimeout(
            provider.prompt(sessionId, result.text, {
              parts: [{ type: "text", text: result.text }],
              ...(model && { model }),
              system,
            }),
            getPromptTimeout(),
            "Prompt"
          );

          if (!promptResult.text.trim() || promptResult.text === "(empty response)") {
            await ctx.reply(EMPTY_RESPONSE_MSG, { parse_mode: "HTML" });
            return;
          }
          await sendTextChunks(ctx, promptResult.text);
          await sendFiles(ctx, promptResult.parts);
          return;
        }
      }

      // Fallback: download and reference as file
      await downloadTelegramFile(getBotToken(), file.file_path!, fileName);
      const caption = ctx.message.caption ?? `Audio file: ${fileName}`;

      const sessionId = await getOrCreateSession();
      const provider = getProvider();
      const model = getSelectedModel();
      const system = getSystemPrompt();

      const promptResult = await withTimeout(
        provider.prompt(sessionId, `${caption}\n\n(Audio file: ${fileName})`, {
          parts: [
            {
              type: "text",
              text: `${caption}\n\n(Audio file: ${fileName})`,
            },
          ],
          ...(model && { model }),
          system,
        }),
        getPromptTimeout(),
        "Prompt"
      );

      if (!promptResult.text.trim() || promptResult.text === "(empty response)") {
        await ctx.reply(EMPTY_RESPONSE_MSG, { parse_mode: "HTML" });
        return;
      }
      await sendTextChunks(ctx, promptResult.text);
      await sendFiles(ctx, promptResult.parts);
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "handling audio"), { parse_mode: "HTML" });
    }
  });
}

function isTextMime(mime?: string): boolean {
  if (!mime) return false;
  return (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/javascript" ||
    mime === "application/typescript" ||
    mime === "application/xml" ||
    mime === "application/yaml" ||
    mime === "application/x-yaml"
  );
}

function isImageMime(mime?: string): boolean {
  if (!mime) return false;
  return ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mime);
}

function isPdfMime(mime?: string): boolean {
  return mime === "application/pdf";
}

async function sendTextChunks(ctx: any, text: string): Promise<void> {
  const chunks = chunkMessage(text);
  for (const chunk of chunks) {
    try {
      await ctx.reply(chunk, { parse_mode: "Markdown" });
    } catch (sendErr: any) {
      const desc = sendErr?.description ?? sendErr?.message ?? "";
      if (!desc.includes("can't parse")) {
        chatLogger.warn({ err: desc }, "Failed to send message chunk");
      }
      await ctx.reply(chunk);
    }
  }
}

async function sendFiles(ctx: any, parts?: unknown[]): Promise<void> {
  if (!parts) return;
  const files = extractFileParts(parts);
  if (files.length > 0) {
    await sendResponseFiles(ctx, files);
  }
}

function isTextExtension(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return [
    "ts", "tsx", "js", "jsx", "json", "md", "txt", "py", "go", "rs",
    "java", "c", "cpp", "h", "hpp", "css", "html", "xml", "yaml", "yml",
    "toml", "ini", "cfg", "sh", "bash", "zsh", "sql", "rb", "php",
    "swift", "kt", "scala", "lua", "r", "csv", "env", "gitignore",
    "dockerfile", "makefile",
  ].includes(ext);
}
