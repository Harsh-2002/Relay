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
  const year = now.getFullYear();

  return `<role>You are an expert research analyst. Your job is to produce a thorough, accurate, and well-sourced research report on the topic below.</role>

<context>
Current date: ${date}
Target year for recency: ${year}
</context>

<topic>${topic}</topic>

<instructions>
Execute this research systematically in the following steps:

1. **Decompose** — Break the topic into 3-5 specific sub-questions that, when answered together, fully address the research topic.

2. **Gather** — For each sub-question, search for and fetch information from multiple sources. Prioritize recent sources (${year}). Use web search, fetch, and any available tools aggressively in parallel.

3. **Verify** — Cross-reference key claims across at least 2 sources. If sources conflict, note the disagreement and explain which is more credible and why.

4. **Synthesize** — Combine findings into a structured report.

5. **Self-critique** — Before finalizing, review your report: Are there gaps? Did you rely on a single source for any major claim? Is anything outdated? Fix issues found.
</instructions>

<output_format>
Structure your final response as:

**Key Findings** — The 3-5 most important takeaways, each in 1-2 sentences.

**Analysis** — Detailed discussion organized by sub-topic. Integrate evidence naturally and cite sources inline.

**Sources** — List all sources consulted with URLs where available.

If you are uncertain about any finding, say so explicitly rather than presenting speculation as fact.
</output_format>`;
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
