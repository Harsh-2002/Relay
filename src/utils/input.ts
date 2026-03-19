import type { Context } from "grammy";

type InputHandler = (text: string, ctx: Context) => Promise<void>;

const pendingInputs = new Map<number, { handler: InputHandler; createdAt: number; messageId?: number; api?: Context["api"] }>();

// Cross-system clear hook (set by question.ts to avoid circular imports)
let crossClearFn: ((chatId: number, api?: Context["api"]) => void) | null = null;

export function setCrossClear(fn: (chatId: number, api?: Context["api"]) => void): void {
  crossClearFn = fn;
}

export function setPendingInput(chatId: number, handler: InputHandler): void {
  pendingInputs.set(chatId, { handler, createdAt: Date.now() });
}

export function consumePendingInput(chatId: number): InputHandler | null {
  const entry = pendingInputs.get(chatId);
  if (!entry) return null;
  pendingInputs.delete(chatId);
  // Expire after 5 minutes to prevent stale handlers
  if (Date.now() - entry.createdAt > 5 * 60_000) return null;
  return entry.handler;
}

export function clearPendingInput(chatId: number, api?: Context["api"]): void {
  const entry = pendingInputs.get(chatId);
  if (entry) {
    // Delete the orphaned force_reply message if we can
    if (entry.messageId && (api ?? entry.api)) {
      const deleteApi = api ?? entry.api!;
      deleteApi.deleteMessage(chatId, entry.messageId).catch(() => {});
    }
    pendingInputs.delete(chatId);
  }
}

export async function promptForInput(
  ctx: Context,
  message: string,
  handler: InputHandler,
): Promise<void> {
  const chatId = ctx.chat!.id;

  // Self-clean: clear any previous pending input (+ delete its force_reply message)
  clearPendingInput(chatId, ctx.api);

  // Cross-system clear: clear any pending text questions from question.ts
  crossClearFn?.(chatId, ctx.api);

  const sent = await ctx.reply(message, {
    parse_mode: "HTML",
    reply_markup: { force_reply: true, selective: true },
  });

  pendingInputs.set(chatId, { handler, createdAt: Date.now(), messageId: sent.message_id, api: ctx.api });
}
