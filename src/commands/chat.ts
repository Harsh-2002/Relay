import type { Bot } from "grammy";
import { getClient } from "../client.js";
import { getOrCreateSession, getSelectedModel } from "../session.js";
import { formatParts } from "../utils/formatter.js";
import { chunkMessage } from "../utils/chunker.js";
import { isStreamingEnabled, streamPrompt } from "../utils/stream.js";
import { getSystemPrompt } from "../utils/system-prompt.js";
import { formatSdkError, formatCatchError, EMPTY_RESPONSE_MSG } from "../utils/errors.js";
import { InputFile } from "grammy";

export function registerChat(bot: Bot): void {
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) return;

    try {
      const sessionId = await getOrCreateSession();
      const model = getSelectedModel();
      const system = getSystemPrompt();
      const parts = [{ type: "text" as const, text }];

      if (isStreamingEnabled()) {
        await streamPrompt({ ctx, sessionId, parts, model, system });
        return;
      }

      await ctx.replyWithChatAction("typing");
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
        await ctx.reply(formatSdkError(result.error), { parse_mode: "HTML" });
        return;
      }

      const response = formatParts(result.data?.parts ?? []);
      if (!response.trim()) {
        await ctx.reply(EMPTY_RESPONSE_MSG, { parse_mode: "HTML" });
        return;
      }
      await sendResponse(ctx, response);
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "sending message"), { parse_mode: "HTML" });
    }
  });
}

async function sendResponse(ctx: any, text: string): Promise<void> {
  if (text.length > 20000) {
    const buffer = Buffer.from(text, "utf-8");
    await ctx.replyWithDocument(new InputFile(buffer, "response.txt"));
    return;
  }

  const chunks = chunkMessage(text);
  for (const chunk of chunks) {
    try {
      await ctx.reply(chunk, { parse_mode: "Markdown" });
    } catch {
      await ctx.reply(chunk);
    }
  }
}
