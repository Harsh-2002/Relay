import type { Context, NextFunction } from "grammy";

const allowedUserId = Number(process.env.ALLOWED_USER_ID) || 0;

export async function authMiddleware(ctx: Context, next: NextFunction): Promise<void> {
  if (!allowedUserId) {
    await next();
    return;
  }

  if (ctx.from?.id === allowedUserId) {
    await next();
    return;
  }

  await ctx.reply("Unauthorized.");
}
