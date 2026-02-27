import type { Bot } from "grammy";
import { getClient } from "../client.js";
import { getOrCreateSession, getSelectedModel } from "../session.js";
import { formatParts } from "../utils/formatter.js";
import { chunkMessage } from "../utils/chunker.js";
import { downloadTelegramFile } from "../utils/media.js";
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

      const result = await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts,
          ...(model && { model }),
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

      const localPath = await downloadTelegramFile(botToken, file.file_path!, fileName);
      const caption = ctx.message.caption ?? `I've shared a photo. Please review it.`;

      const sessionId = await getOrCreateSession();
      const client = getClient();
      const model = getSelectedModel();

      const result = await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [
            {
              type: "text",
              text: `${caption}\n\n(Photo saved to: ${localPath})`,
            },
          ],
          ...(model && { model }),
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
      await ctx.reply(`Error handling photo: ${err.message}`);
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
