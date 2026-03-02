import type { Context } from "grammy";
import { InputFile } from "grammy";
import logger from "./logger.js";

export interface ResponseFile {
  mime: string;
  filename: string;
  url: string;
}

/**
 * Extract file parts from a provider response's parts array.
 * Handles both top-level file parts and tool attachment file parts.
 */
export function extractFileParts(parts: unknown[]): ResponseFile[] {
  const files: ResponseFile[] = [];
  if (!Array.isArray(parts)) return files;

  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const p = part as Record<string, any>;

    if (p.type === "file" && p.url) {
      files.push({
        mime: p.mime ?? "application/octet-stream",
        filename: p.filename ?? "file",
        url: p.url,
      });
    }

    // Tool parts may have attachments (e.g. OpenCode ToolStateCompleted)
    if (p.type === "tool" && p.state?.attachments) {
      for (const att of p.state.attachments) {
        if (att?.type === "file" && att.url) {
          files.push({
            mime: att.mime ?? "application/octet-stream",
            filename: att.filename ?? "file",
            url: att.url,
          });
        }
      }
    }
  }

  return files;
}

/**
 * Send extracted files to the Telegram chat as photos or documents.
 */
export async function sendResponseFiles(
  ctx: Context,
  files: ResponseFile[],
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  for (const file of files) {
    try {
      const buffer = await resolveFileBuffer(file.url);
      const input = new InputFile(buffer, file.filename);

      if (file.mime.startsWith("image/")) {
        await ctx.api.sendPhoto(chatId, input);
      } else {
        await ctx.api.sendDocument(chatId, input, {
          caption: file.filename,
        });
      }
    } catch (err: any) {
      // Log but don't fail the whole response for one bad file
      logger.error({ filename: file.filename, err: err?.message ?? err }, "Failed to send file");
    }
  }
}

async function resolveFileBuffer(url: string): Promise<Buffer> {
  if (url.startsWith("data:")) {
    // data:[<mediatype>][;base64],<data>
    const commaIdx = url.indexOf(",");
    if (commaIdx === -1) throw new Error("Invalid data URL");
    const data = url.slice(commaIdx + 1);
    const isBase64 = url.slice(0, commaIdx).includes(";base64");
    return Buffer.from(data, isBase64 ? "base64" : "utf-8");
  }

  // HTTP(S) URL
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}
