import type { Context, NextFunction } from "grammy";
import { authLogger } from "./utils/logger.js";

// Initialized by initAuth() from index.ts
let allowedUserId = NaN;

// Simple in-memory rate limiter: max requests per minute per user
const RATE_LIMIT = 30;
const rateBuckets = new Map<number, number[]>();

export function initAuth(userId: number): boolean {
  allowedUserId = userId;
  const configured = isAuthConfigured();
  authLogger.info({ userId, configured }, "Auth initialized");
  return configured;
}

export function isAuthConfigured(): boolean {
  return !isNaN(allowedUserId) && allowedUserId > 0;
}

export async function authMiddleware(ctx: Context, next: NextFunction): Promise<void> {
  // Fail-secure: if ALLOWED_USER_ID is not set or invalid, block everyone
  if (!isAuthConfigured()) {
    await ctx.reply("Bot is misconfigured — ALLOWED_USER_ID is not set.");
    return;
  }

  if (!ctx.from) return;  // channel posts, etc. — silently ignore
  const userId = ctx.from.id;
  if (userId !== allowedUserId) {
    authLogger.info({ userId }, "Unauthorized access attempt");
    await ctx.reply("Unauthorized.");
    return;
  }

  // Rate limiting
  const now = Date.now();
  const bucket = (rateBuckets.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (bucket.length >= RATE_LIMIT) {
    authLogger.info({ userId, bucketSize: bucket.length }, "Rate limit hit");
    await ctx.reply("Too many requests — wait a moment.");
    return;
  }
  bucket.push(now);
  rateBuckets.set(userId, bucket);

  await next();
}
