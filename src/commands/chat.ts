import type { Bot } from "grammy";
import { getProvider } from "../providers/index.js";
import { getOrCreateSession, getSelectedModel } from "../session.js";
import { chunkMessage } from "../utils/chunker.js";
import { isStreamingEnabled, streamPrompt } from "../utils/stream.js";
import { getSystemPrompt } from "../utils/system-prompt.js";
import { formatCatchError, EMPTY_RESPONSE_MSG } from "../utils/errors.js";
import { InputFile } from "grammy";

export function registerChat(bot: Bot): void {
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) return;

    try {
      const sessionId = await getOrCreateSession();
      const model = getSelectedModel();
      const system = getSystemPrompt();
      const provider = getProvider();

      // Streaming only available for OpenCode provider (SSE-based)
      if (isStreamingEnabled() && provider.name === "opencode") {
        const parts = [{ type: "text" as const, text }];
        await streamPrompt({ ctx, sessionId, parts, model, system });
        return;
      }

      await ctx.replyWithChatAction("typing");

      const result = await provider.prompt(sessionId, text, {
        parts: [{ type: "text" as const, text }],
        ...(model && { model }),
        system,
      });

      if (!result.text.trim() || result.text === "(empty response)") {
        await ctx.reply(EMPTY_RESPONSE_MSG, { parse_mode: "HTML" });
        return;
      }
      await sendResponse(ctx, result.text);
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
