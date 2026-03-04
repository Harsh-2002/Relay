import type { Bot } from "grammy";
import { getOrCreateSession, getSelectedModel, getSelectedAgent, withPromptQueue } from "../session.js";
import { downloadTelegramFile, downloadTelegramFileBuffer } from "../utils/media.js";
import { transcribeAudio, isSttAvailable } from "../utils/stt.js";
import { streamPromptWithRetry } from "../utils/stream.js";
import { getSystemPrompt } from "../utils/system-prompt.js";
import { formatCatchError } from "../utils/errors.js";
import { readFileSync } from "fs";
import { getConfig } from "../config/index.js";

import { mediaLogger } from "../utils/logger.js";

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

      mediaLogger.info(
        { fileName, mime: doc.mime_type, size: doc.file_size },
        "Document received"
      );

      if (!file.file_path) {
        await ctx.reply(
          "File is too large for Telegram to provide a download link (max ~20 MB). Try sending a smaller file.",
          { parse_mode: "HTML" }
        );
        return;
      }

      const typingInterval = setInterval(() => {
        ctx.replyWithChatAction("typing").catch(() => {});
      }, 4000);
      await ctx.replyWithChatAction("typing");

      // Fire-and-forget so /abort can be processed while streaming
      withPromptQueue(async () => {
        try {
          const caption = ctx.message.caption ?? `I've shared a file: ${fileName}. Please review it.`;

          const isTextFile = isTextMime(doc.mime_type) || isTextExtension(fileName);
          let promptText: string;

          if (isTextFile) {
            const localPath = await downloadTelegramFile(getBotToken(), file.file_path!, fileName);
            mediaLogger.info({ fileName, localPath }, "Document downloaded to disk");
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
              const head = content.slice(0, 100_000);
              const tail = content.slice(-10_000);
              const omitted = content.length - 110_000;
              promptText = `${caption}\n\nFile: ${fileName} (${content.length} chars, truncated)\n\`\`\`\n${head}\n\n... [${omitted} characters omitted] ...\n\n${tail}\n\`\`\``;
            }

            const sessionId = await getOrCreateSession();
            const model = getSelectedModel();
            const agent = getSelectedAgent();
            const system = getSystemPrompt();
            const parts: any[] = [{ type: "text" as const, text: promptText }];

            mediaLogger.info({ fileName, sessionId }, "Sending text file to provider");
            await streamPromptWithRetry({ ctx, sessionId, parts, model, system, agent });
            return;
          } else if (isImageMime(doc.mime_type) || isPdfMime(doc.mime_type)) {
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
            const model = getSelectedModel();
            const agent = getSelectedAgent();
            const system = getSystemPrompt();

            mediaLogger.info({ fileName, mime, sessionId }, "Sending image/PDF to provider");
            await streamPromptWithRetry({ ctx, sessionId, parts, model, system, agent });
            return;
          } else {
            promptText = `${caption}\n\n(Binary file: ${fileName}, ${doc.file_size ?? "unknown"} bytes)`;
          }

          const sessionId = await getOrCreateSession();
          const model = getSelectedModel();
          const agent = getSelectedAgent();
          const system = getSystemPrompt();

          await streamPromptWithRetry({
            ctx,
            sessionId,
            parts: [{ type: "text", text: promptText }],
            model,
            system,
            agent,
          });
        } finally {
          clearInterval(typingInterval);
        }
      }).catch(async (err: any) => {
        clearInterval(typingInterval);
        ctx.reply(formatCatchError(err, "handling file"), { parse_mode: "HTML" }).catch(() => {});
      });
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

      mediaLogger.info(
        { width: largest.width, height: largest.height, fileSize: largest.file_size },
        "Photo received"
      );

      if (!file.file_path) {
        await ctx.reply(
          "Photo is too large for Telegram to provide a download link. Try sending a smaller photo.",
          { parse_mode: "HTML" }
        );
        return;
      }

      const typingInterval = setInterval(() => {
        ctx.replyWithChatAction("typing").catch(() => {});
      }, 4000);
      await ctx.replyWithChatAction("typing");

      // Fire-and-forget so /abort can be processed while streaming
      withPromptQueue(async () => {
        try {
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

          const sessionId = await getOrCreateSession();
          const model = getSelectedModel();
          const agent = getSelectedAgent();
          const system = getSystemPrompt();

          mediaLogger.info({ sessionId, bufferLen: buffer.length }, "Sending photo to provider");
          await streamPromptWithRetry({ ctx, sessionId, parts, model, system, agent });
        } finally {
          clearInterval(typingInterval);
        }
      }).catch(async (err: any) => {
        clearInterval(typingInterval);
        ctx.reply(formatCatchError(err, "handling photo"), { parse_mode: "HTML" }).catch(() => {});
      });
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "handling photo"), { parse_mode: "HTML" });
    }
  });

  bot.on("message:voice", async (ctx) => {
    if (!isSttAvailable()) {
      mediaLogger.info("Voice message received but STT not configured");
      await ctx.reply(
        "Voice messages not supported. Configure an STT API key via <code>relay onboard</code>.",
        { parse_mode: "HTML" }
      );
      return;
    }

    // Keep typing indicator active throughout transcription + prompt processing
    const typingInterval = setInterval(() => {
      ctx.replyWithChatAction("typing").catch(() => {});
    }, 4000);
    await ctx.replyWithChatAction("typing");

    // Fire-and-forget so /abort can be processed while streaming
    withPromptQueue(async () => {
      try {
        const file = await ctx.getFile();
        if (!file.file_path) {
          await ctx.reply("Voice file unavailable. Try sending a shorter message.", { parse_mode: "HTML" });
          return;
        }
        const fileName = `voice_${Date.now()}.ogg`;

        const buffer = await downloadTelegramFileBuffer(getBotToken(), file.file_path);
        const duration = ctx.message.voice.duration;
        mediaLogger.info({ fileName, bufferLen: buffer.length, duration }, "Voice downloaded, transcribing");
        const result = await transcribeAudio(buffer, fileName, duration);

        mediaLogger.info({ provider: result.provider, textLen: result.text?.length ?? 0 }, "Voice transcription result");
        if (!result.text || result.text.trim().length === 0) {
          await ctx.reply("Could not transcribe voice message (empty result).", { parse_mode: "HTML" });
          return;
        }

        const sessionId = await getOrCreateSession();
        const model = getSelectedModel();
        const agent = getSelectedAgent();
        const system = getSystemPrompt();
        const promptParts = [{ type: "text" as const, text: result.text }];

        await streamPromptWithRetry({ ctx, sessionId, parts: promptParts, model, system, agent });
      } finally {
        clearInterval(typingInterval);
      }
    }).catch(async (err: any) => {
      clearInterval(typingInterval);
      ctx.reply(formatCatchError(err, "handling voice message"), { parse_mode: "HTML" }).catch(() => {});
    });
  });

  bot.on("message:audio", async (ctx) => {
    // Keep typing indicator active throughout transcription + prompt processing
    const typingInterval = setInterval(() => {
      ctx.replyWithChatAction("typing").catch(() => {});
    }, 4000);
    await ctx.replyWithChatAction("typing");

    // Fire-and-forget so /abort can be processed while streaming
    withPromptQueue(async () => {
      try {
        const audio = ctx.message.audio;
        const file = await ctx.getFile();
        if (!file.file_path) {
          await ctx.reply(
            "Audio file is too large for Telegram to provide a download link (max ~20 MB).",
            { parse_mode: "HTML" }
          );
          return;
        }
        const fileName = audio.file_name ?? `audio_${Date.now()}.mp3`;
        const sttAvailable = isSttAvailable();

        mediaLogger.info(
          { fileName, size: audio.file_size, mime: audio.mime_type, sttAvailable },
          "Audio received"
        );

        if (sttAvailable) {
          const buffer = await downloadTelegramFileBuffer(getBotToken(), file.file_path);
          const duration = ctx.message.audio.duration;
          const result = await transcribeAudio(buffer, fileName, duration);

          if (result.text && result.text.trim().length > 0) {
            const sessionId = await getOrCreateSession();
            const model = getSelectedModel();
            const agent = getSelectedAgent();
            const system = getSystemPrompt();

            await streamPromptWithRetry({
              ctx, sessionId,
              parts: [{ type: "text", text: result.text }],
              model, system, agent,
            });
            return;
          }
        }

        // Fallback: download and reference as file
        await downloadTelegramFile(getBotToken(), file.file_path, fileName);
        const caption = ctx.message.caption ?? `Audio file: ${fileName}`;

        const sessionId = await getOrCreateSession();
        const model = getSelectedModel();
        const agent = getSelectedAgent();
        const system = getSystemPrompt();

        const promptText = `${caption}\n\n(Audio file: ${fileName})`;
        await streamPromptWithRetry({
          ctx,
          sessionId,
          parts: [{ type: "text", text: promptText }],
          model,
          system,
          agent,
        });
      } finally {
        clearInterval(typingInterval);
      }
    }).catch(async (err: any) => {
      clearInterval(typingInterval);
      ctx.reply(formatCatchError(err, "handling audio"), { parse_mode: "HTML" }).catch(() => {});
    });
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
