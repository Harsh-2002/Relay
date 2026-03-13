import type { Bot } from "grammy";
import { withPromptQueue, getSelectedModel, getSelectedAgent } from "../session.js";
import { streamPromptWithRetry } from "../utils/stream.js";
import { getSystemPrompt } from "../utils/system-prompt.js";
import { promptForInput } from "../utils/input.js";
import { formatCatchError } from "../utils/errors.js";
import { researchLogger } from "../utils/logger.js";
import { getProvider } from "../providers/index.js";

function buildResearchPrompt(topic: string): string {
  const now = new Date();
  const date = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return `[RESEARCH MODE - Execute systematically. No disclaimers, unless critical.]

Current date: ${date}

Research topic: ${topic}

Instructions:
- Conduct thorough, multi-step research on this topic
- Prioritize recent and up-to-date information (${now.getFullYear()})
- Use available tools (web search, fetch, etc.) to gather information
- Synthesize findings into a clear, comprehensive response
- Cite sources where possible
- If the topic is ambiguous, make reasonable assumptions and note them`;
}

async function doResearch(topic: string, ctx: any): Promise<void> {
  const provider = getProvider();
  let sessionId: string | null = null;

  try {
    const session = await provider.createSession(`Research: ${topic.slice(0, 60)}`);
    sessionId = session.id;
    researchLogger.info({ sessionId, topic }, "Created research session");

    const prompt = buildResearchPrompt(topic);
    const model = getSelectedModel();
    const agent = getSelectedAgent();
    const system = getSystemPrompt();

    await withPromptQueue(async () => {
      await streamPromptWithRetry({
        ctx,
        sessionId: sessionId!,
        parts: [{ type: "text" as const, text: prompt }],
        ...(model && { model }),
        system,
        ...(agent && { agent }),
      });
    });
  } catch (err: any) {
    researchLogger.info({ err: err?.message, topic }, "Research error");
    await ctx.reply(formatCatchError(err, "running research"), { parse_mode: "HTML" });
  } finally {
    if (sessionId) {
      provider.deleteSession(sessionId).catch((err: any) => {
        researchLogger.info({ sessionId, err: err?.message }, "Failed to delete research session");
      });
    }
  }
}

export function registerResearchCommands(bot: Bot): void {
  bot.command("research", async (ctx) => {
    const input = ctx.match?.trim();

    if (!input) {
      await promptForInput(ctx, "Enter the research topic:", async (topic, topicCtx) => {
        await doResearch(topic.trim(), topicCtx);
      });
      return;
    }

    await doResearch(input, ctx);
  });
}
