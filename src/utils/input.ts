import type { Context } from "grammy";

type InputHandler = (text: string, ctx: Context) => Promise<void>;

const pendingInputs = new Map<number, { handler: InputHandler; createdAt: number }>();

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

export function clearPendingInput(chatId: number): void {
  pendingInputs.delete(chatId);
}

export async function promptForInput(
  ctx: Context,
  message: string,
  handler: InputHandler,
): Promise<void> {
  setPendingInput(ctx.chat!.id, handler);
  await ctx.reply(message, {
    parse_mode: "HTML",
    reply_markup: { force_reply: true, selective: true },
  });
}
