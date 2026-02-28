/**
 * Shared error formatting for user-facing Telegram messages.
 * All output is HTML-formatted for parse_mode: "HTML".
 */

import { escapeHtml } from "./html.js";

const MAX_ERROR_LENGTH = 200;

/**
 * Format a caught exception into a user-friendly HTML message with context.
 */
export function formatCatchError(err: unknown, context: string): string {
  const msg = extractMessage(err);

  // Connection refused / server unreachable
  if (matchesAny(msg, ["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "fetch failed", "network", "socket"])) {
    return (
      `<b>Server unreachable</b>\n\n` +
      `Cannot reach the AI server. Make sure the coding agent is running and accessible.`
    );
  }

  // Timeout
  if (matchesAny(msg, ["timeout", "timed out", "AbortError", "aborted"])) {
    return (
      `<b>Request timed out</b>\n\n` +
      `The server took too long to respond. The model may be overloaded — try again in a moment.`
    );
  }

  // Rate limit from exceptions
  if (matchesAny(msg, ["rate limit", "too many requests", "429", "413", "tokens per minute"])) {
    return (
      `<b>Rate limit exceeded</b>\n\n` +
      `The AI provider is throttling requests. Wait a moment and try again.\n\n` +
      `<i>${escapeHtml(truncate(msg))}</i>`
    );
  }

  // Model not found from exceptions
  if (matchesAny(msg, ["model not found", "ProviderModelNotFoundError"])) {
    return (
      `<b>Model not found</b>\n\n` +
      `The selected model isn't available. Use /model to check or /providers to see what's available.\n\n` +
      `<i>${escapeHtml(truncate(msg))}</i>`
    );
  }

  // Generic — show what happened and why
  return (
    `<b>Error ${escapeHtml(context)}</b>\n\n` +
    `<i>${escapeHtml(truncate(msg))}</i>`
  );
}

/**
 * Message for empty AI responses (no text returned).
 */
export const EMPTY_RESPONSE_MSG =
  `<b>Empty response</b>\n\n` +
  `The AI returned no text. This can happen when:\n` +
  `• The model's token limit was exceeded\n` +
  `• The provider is overloaded or rate-limiting\n` +
  `• The request was too large for the free tier\n\n` +
  `Try again, or switch to a different model with /model.`;

// --- Helpers ---

function extractMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const e = error as Record<string, any>;
    // SDK error shapes: { message }, { error: { message } }, { error: string }
    if (typeof e.message === "string" && e.message) return e.message;
    if (e.error && typeof e.error === "object" && typeof e.error.message === "string") return e.error.message;
    if (typeof e.error === "string") return e.error;
    // Status code errors — don't include full body (may contain secrets)
    if (e.statusCode || e.status) {
      const code = e.statusCode ?? e.status;
      return `HTTP ${code}`;
    }
    // Last resort — stringify but keep it short
    try {
      const json = JSON.stringify(error);
      return json.length > 300 ? json.slice(0, 300) + "..." : json;
    } catch {
      return String(error);
    }
  }
  return "Unknown error";
}

function matchesAny(text: string, patterns: string[]): boolean {
  const lower = text.toLowerCase();
  return patterns.some((p) => lower.includes(p.toLowerCase()));
}

function truncate(text: string, limit = MAX_ERROR_LENGTH): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + "...";
}
