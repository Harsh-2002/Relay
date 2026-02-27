import type { Bot } from "grammy";
import { getClient } from "../client.js";
import { getOrCreateSession, getSelectedModel } from "../session.js";
import { formatParts } from "../utils/formatter.js";
import { chunkMessage } from "../utils/chunker.js";
import { InputFile } from "grammy";

export function registerChat(bot: Bot): void {
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) return;

    try {
      await ctx.replyWithChatAction("typing");

      const sessionId = await getOrCreateSession();
      const client = getClient();
      const model = getSelectedModel();

      const result = await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text }],
          ...(model && { model }),
        },
      });

      if (result.error) {
        await ctx.reply(`Error: ${JSON.stringify(result.error)}`);
        return;
      }

      const response = formatParts(result.data?.parts ?? []);
      await sendResponse(ctx, response);
    } catch (err: any) {
      await ctx.reply(`Error: ${err.message ?? "Unknown error"}`);
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
