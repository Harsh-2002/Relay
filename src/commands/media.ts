import type { Bot } from "grammy";
import { getProvider } from "../providers/index.js";
import { getOrCreateSession, getSelectedModel } from "../session.js";
import { chunkMessage } from "../utils/chunker.js";
import { downloadTelegramFile, downloadTelegramFileBuffer } from "../utils/media.js";
import { transcribeAudio, isSttAvailable } from "../utils/stt.js";
import { isStreamingEnabled, streamPrompt } from "../utils/stream.js";
import { getSystemPrompt } from "../utils/system-prompt.js";
import { formatCatchError, EMPTY_RESPONSE_MSG } from "../utils/errors.js";
import { readFileSync } from "fs";

const botToken = process.env.BOT_TOKEN ?? "";

export function registerMediaHandlers(bot: Bot): void {
  bot.on("message:document", async (ctx) => {
    try {
      const doc = ctx.message.document;
      const file = await ctx.getFile();
      const fileName = doc.file_name ?? `file_${Date.now()}`;

      await ctx.replyWithChatAction("typing");

      const localPath = await downloadTelegramFile(botToken, file.file_path!, fileName);
      const caption = ctx.message.caption ?? `I've shared a file: ${fileName}. Please review it.`;

      const isTextFile = isTextMime(doc.mime_type) || isTextExtension(fileName);
      let promptText: string;

      if (isTextFile && doc.file_size && doc.file_size < 100_000) {
        const content = readFileSync(localPath, "utf-8");
        promptText = `${caption}\n\nFile: ${fileName}\n\`\`\`\n${content}\n\`\`\``;
      } else {
        promptText = `${caption}\n\n(Binary file: ${fileName}, ${doc.file_size ?? "unknown"} bytes)`;
      }

      const sessionId = await getOrCreateSession();
      const provider = getProvider();
      const model = getSelectedModel();
      const system = getSystemPrompt();

      const result = await provider.prompt(sessionId, promptText, {
        parts: [{ type: "text", text: promptText }],
        ...(model && { model }),
        system,
      });

      if (!result.text.trim() || result.text === "(empty response)") {
        await ctx.reply(EMPTY_RESPONSE_MSG, { parse_mode: "HTML" });
        return;
      }
      const chunks = chunkMessage(result.text);
      for (const chunk of chunks) {
        try {
          await ctx.reply(chunk, { parse_mode: "Markdown" });
        } catch {
          await ctx.reply(chunk);
        }
      }
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

      const buffer = await downloadTelegramFileBuffer(botToken, file.file_path!);
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
      await downloadTelegramFile(botToken, file.file_path!, fileName);

      const sessionId = await getOrCreateSession();
      const model = getSelectedModel();
      const system = getSystemPrompt();
      const provider = getProvider();

      // Streaming only available for OpenCode (SSE-based)
      if (isStreamingEnabled() && provider.name === "opencode") {
        await streamPrompt({ ctx, sessionId, parts, model, system });
      } else {
        const result = await provider.prompt(sessionId, caption, {
          parts,
          ...(model && { model }),
          system,
        });

        if (!result.text.trim() || result.text === "(empty response)") {
          await ctx.reply(EMPTY_RESPONSE_MSG, { parse_mode: "HTML" });
          return;
        }
        const chunks = chunkMessage(result.text);
        for (const chunk of chunks) {
          try {
            await ctx.reply(chunk, { parse_mode: "Markdown" });
          } catch {
            await ctx.reply(chunk);
          }
        }
      }
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "handling photo"), { parse_mode: "HTML" });
    }
  });

  bot.on("message:voice", async (ctx) => {
    if (!isSttAvailable()) {
      await ctx.reply(
        "Voice messages not supported. Configure GROQ_API_KEY, OPENAI_API_KEY, or ASSEMBLYAI_API_KEY."
      );
      return;
    }

    try {
      await ctx.replyWithChatAction("typing");

      const file = await ctx.getFile();
      const fileName = `voice_${Date.now()}.ogg`;

      const buffer = await downloadTelegramFileBuffer(botToken, file.file_path!);
      const result = await transcribeAudio(buffer, fileName);

      if (!result.text || result.text.trim().length === 0) {
        await ctx.reply("Could not transcribe voice message (empty result).");
        return;
      }

      const sessionId = await getOrCreateSession();
      const model = getSelectedModel();
      const system = getSystemPrompt();
      const provider = getProvider();
      const promptParts = [{ type: "text" as const, text: result.text }];

      // Streaming only available for OpenCode (SSE-based)
      if (isStreamingEnabled() && provider.name === "opencode") {
        await streamPrompt({ ctx, sessionId, parts: promptParts, model, system });
      } else {
        await ctx.replyWithChatAction("typing");

        const promptResult = await provider.prompt(sessionId, result.text, {
          parts: promptParts,
          ...(model && { model }),
          system,
        });

        if (!promptResult.text.trim() || promptResult.text === "(empty response)") {
          await ctx.reply(EMPTY_RESPONSE_MSG, { parse_mode: "HTML" });
          return;
        }
        const chunks = chunkMessage(promptResult.text);
        for (const chunk of chunks) {
          try {
            await ctx.reply(chunk, { parse_mode: "Markdown" });
          } catch {
            await ctx.reply(chunk);
          }
        }
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
        const buffer = await downloadTelegramFileBuffer(botToken, file.file_path!);
        const result = await transcribeAudio(buffer, fileName);

        if (result.text && result.text.trim().length > 0) {
          await ctx.replyWithChatAction("typing");

          const sessionId = await getOrCreateSession();
          const provider = getProvider();
          const model = getSelectedModel();
          const system = getSystemPrompt();

          const promptResult = await provider.prompt(sessionId, result.text, {
            parts: [{ type: "text", text: result.text }],
            ...(model && { model }),
            system,
          });

          if (!promptResult.text.trim() || promptResult.text === "(empty response)") {
            await ctx.reply(EMPTY_RESPONSE_MSG, { parse_mode: "HTML" });
            return;
          }
          const chunks = chunkMessage(promptResult.text);
          for (const chunk of chunks) {
            try {
              await ctx.reply(chunk, { parse_mode: "Markdown" });
            } catch {
              await ctx.reply(chunk);
            }
          }
          return;
        }
      }

      // Fallback: download and reference as file
      await downloadTelegramFile(botToken, file.file_path!, fileName);
      const caption = ctx.message.caption ?? `Audio file: ${fileName}`;

      const sessionId = await getOrCreateSession();
      const provider = getProvider();
      const model = getSelectedModel();
      const system = getSystemPrompt();

      const promptResult = await provider.prompt(sessionId, `${caption}\n\n(Audio file: ${fileName})`, {
        parts: [
          {
            type: "text",
            text: `${caption}\n\n(Audio file: ${fileName})`,
          },
        ],
        ...(model && { model }),
        system,
      });

      if (!promptResult.text.trim() || promptResult.text === "(empty response)") {
        await ctx.reply(EMPTY_RESPONSE_MSG, { parse_mode: "HTML" });
        return;
      }
      const chunks = chunkMessage(promptResult.text);
      for (const chunk of chunks) {
        try {
          await ctx.reply(chunk, { parse_mode: "Markdown" });
        } catch {
          await ctx.reply(chunk);
        }
      }
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
