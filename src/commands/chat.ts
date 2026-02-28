import type { Bot } from "grammy";
import { getProvider } from "../providers/index.js";
import { getOrCreateSession, getSelectedModel } from "../session.js";
import { chunkMessage } from "../utils/chunker.js";
import { isStreamingEnabled, streamPrompt } from "../utils/stream.js";
import { getSystemPrompt } from "../utils/system-prompt.js";
import { formatCatchError, EMPTY_RESPONSE_MSG } from "../utils/errors.js";
import { withTimeout, getPromptTimeout } from "../utils/timeout.js";
import { extractFileParts, sendResponseFiles } from "../utils/files.js";
import { InputFile } from "grammy";

const MAX_INPUT_LENGTH = 32_000;

export function registerChat(bot: Bot): void {
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) return;

    if (text.length > MAX_INPUT_LENGTH) {
      await ctx.reply(
        `Message too long (${text.toLocaleString().length} chars). ` +
        `Maximum is ${MAX_INPUT_LENGTH.toLocaleString()} characters. ` +
        `Send the content as a file instead.`
      );
      return;
    }

    try {
      const sessionId = await getOrCreateSession();
      const model = getSelectedModel();
      const system = getSystemPrompt();
      const provider = getProvider();

      // Streaming: use provider's promptStream if available
      if (isStreamingEnabled() && provider.promptStream) {
        const parts = [{ type: "text" as const, text }];
        await streamPrompt({ ctx, sessionId, parts, model, system });
        return;
      }

      // Keep typing indicator active while waiting for response
      const typingInterval = setInterval(() => {
        ctx.replyWithChatAction("typing").catch(() => {});
      }, 4000);
      await ctx.replyWithChatAction("typing");

      try {
        const result = await withTimeout(
          provider.prompt(sessionId, text, {
            parts: [{ type: "text" as const, text }],
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
        await sendResponse(ctx, result.text);

        // Send any file attachments from the response
        const files = extractFileParts(result.parts ?? []);
        if (files.length > 0) {
          await sendResponseFiles(ctx, files);
        }
      } finally {
        clearInterval(typingInterval);
      }
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
