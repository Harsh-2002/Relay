import type { Bot } from "grammy";
import { getClient } from "../client.js";
import { getOrCreateSession, getSelectedModel } from "../session.js";
import { formatParts } from "../utils/formatter.js";
import { chunkMessage } from "../utils/chunker.js";
import { downloadTelegramFile, downloadTelegramFileBuffer } from "../utils/media.js";
import { transcribeAudio, isSttAvailable } from "../utils/stt.js";
import { isStreamingEnabled, streamPrompt } from "../utils/stream.js";
import { getSystemPrompt } from "../utils/system-prompt.js";
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
      let parts: any[];

      if (isTextFile && doc.file_size && doc.file_size < 100_000) {
        const content = readFileSync(localPath, "utf-8");
        parts = [
          {
            type: "text" as const,
            text: `${caption}\n\nFile: ${fileName}\n\`\`\`\n${content}\n\`\`\``,
          },
        ];
      } else {
        parts = [
          {
            type: "text" as const,
            text: `${caption}\n\n(File saved to: ${localPath})`,
          },
        ];
      }

      const sessionId = await getOrCreateSession();
      const client = getClient();
      const model = getSelectedModel();
      const system = getSystemPrompt();

      const result = await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts,
          ...(model && { model }),
          system,
        },
      });

      if (result.error) {
        await ctx.reply(`Error: ${JSON.stringify(result.error)}`);
        return;
      }

      const response = formatParts(result.data?.parts ?? []);
      const chunks = chunkMessage(response);
      for (const chunk of chunks) {
        try {
          await ctx.reply(chunk, { parse_mode: "Markdown" });
        } catch {
          await ctx.reply(chunk);
        }
      }
    } catch (err: any) {
      await ctx.reply(`Error handling file: ${err.message}`);
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
      const localPath = await downloadTelegramFile(botToken, file.file_path!, fileName);

      const sessionId = await getOrCreateSession();
      const model = getSelectedModel();
      const system = getSystemPrompt();

      if (isStreamingEnabled()) {
        await streamPrompt({ ctx, sessionId, parts, model, system });
      } else {
        const client = getClient();

        const result = await client.session.prompt({
          path: { id: sessionId },
          body: {
            parts,
            ...(model && { model }),
            system,
          },
        });

        if (result.error) {
          await ctx.reply(`Error: ${JSON.stringify(result.error)}`);
          return;
        }

        const response = formatParts(result.data?.parts ?? []);
        const chunks = chunkMessage(response);
        for (const chunk of chunks) {
          try {
            await ctx.reply(chunk, { parse_mode: "Markdown" });
          } catch {
            await ctx.reply(chunk);
          }
        }
      }
    } catch (err: any) {
      await ctx.reply(`Error handling photo: ${err.message}`);
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

      const voice = ctx.message.voice;
      const file = await ctx.getFile();
      const fileName = `voice_${Date.now()}.ogg`;

      const buffer = await downloadTelegramFileBuffer(botToken, file.file_path!);
      const result = await transcribeAudio(buffer, fileName);

      if (!result.text || result.text.trim().length === 0) {
        await ctx.reply("Could not transcribe voice message (empty result).");
        return;
      }

      const duration = voice.duration;
      await ctx.reply(
        `Transcription (${duration}s, ${result.provider}):\n"${result.text}"`
      );

      const sessionId = await getOrCreateSession();
      const model = getSelectedModel();
      const system = getSystemPrompt();
      const promptParts = [{ type: "text" as const, text: result.text }];

      if (isStreamingEnabled()) {
        await streamPrompt({ ctx, sessionId, parts: promptParts, model, system });
      } else {
        await ctx.replyWithChatAction("typing");
        const client = getClient();

        const promptResult = await client.session.prompt({
          path: { id: sessionId },
          body: {
            parts: promptParts,
            ...(model && { model }),
            system,
          },
        });

        if (promptResult.error) {
          await ctx.reply(`Error: ${JSON.stringify(promptResult.error)}`);
          return;
        }

        const response = formatParts(promptResult.data?.parts ?? []);
        const chunks = chunkMessage(response);
        for (const chunk of chunks) {
          try {
            await ctx.reply(chunk, { parse_mode: "Markdown" });
          } catch {
            await ctx.reply(chunk);
          }
        }
      }
    } catch (err: any) {
      await ctx.reply(`Error handling voice message: ${err.message}`);
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
          const duration = audio.duration;
          await ctx.reply(
            `Transcription (${duration}s, ${result.provider}):\n"${result.text}"`
          );

          await ctx.replyWithChatAction("typing");

          const sessionId = await getOrCreateSession();
          const client = getClient();
          const model = getSelectedModel();
          const system = getSystemPrompt();

          const promptResult = await client.session.prompt({
            path: { id: sessionId },
            body: {
              parts: [{ type: "text", text: result.text }],
              ...(model && { model }),
              system,
            },
          });

          if (promptResult.error) {
            await ctx.reply(`Error: ${JSON.stringify(promptResult.error)}`);
            return;
          }

          const response = formatParts(promptResult.data?.parts ?? []);
          const chunks = chunkMessage(response);
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
      const localPath = await downloadTelegramFile(botToken, file.file_path!, fileName);
      const caption = ctx.message.caption ?? `Audio file: ${fileName}`;

      const sessionId = await getOrCreateSession();
      const client = getClient();
      const model = getSelectedModel();
      const system = getSystemPrompt();

      const promptResult = await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [
            {
              type: "text",
              text: `${caption}\n\n(Audio saved to: ${localPath})`,
            },
          ],
          ...(model && { model }),
          system,
        },
      });

      if (promptResult.error) {
        await ctx.reply(`Error: ${JSON.stringify(promptResult.error)}`);
        return;
      }

      const response = formatParts(promptResult.data?.parts ?? []);
      const chunks = chunkMessage(response);
      for (const chunk of chunks) {
        try {
          await ctx.reply(chunk, { parse_mode: "Markdown" });
        } catch {
          await ctx.reply(chunk);
        }
      }
    } catch (err: any) {
      await ctx.reply(`Error handling audio: ${err.message}`);
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
