/**
 * Shared error formatting for user-facing Telegram messages.
 * All output is HTML-formatted for parse_mode: "HTML".
 */

const HOST = process.env.OPENCODE_HOSTNAME ?? "127.0.0.1";
const PORT = process.env.OPENCODE_PORT ?? "4096";

/**
 * Format an SDK result.error into a user-friendly HTML message.
 */
export function formatSdkError(error: unknown): string {
  const msg = extractMessage(error);

  // Rate limit / token limit
  if (matchesAny(msg, ["rate limit", "too many requests", "429", "413", "tokens per minute", "tpm"])) {
    return (
      `<b>Rate limit exceeded</b>\n\n` +
      `The AI provider is throttling requests. This usually means the model's token limit was exceeded.\n\n` +
      `<i>${escapeHtml(msg)}</i>`
    );
  }

  // Model not found
  if (matchesAny(msg, ["model not found", "ProviderModelNotFoundError", "model_not_found", "does not exist"])) {
    return (
      `<b>Model not found</b>\n\n` +
      `The selected model isn't available. Use /model to check or /providers to see what's available.\n\n` +
      `<i>${escapeHtml(msg)}</i>`
    );
  }

  // Session not found
  if (matchesAny(msg, ["session not found", "session_not_found", "invalid session"])) {
    return (
      `<b>Session not found</b>\n\n` +
      `The session may have expired. Use /new to start a fresh one.`
    );
  }

  // Authentication
  if (matchesAny(msg, ["unauthorized", "401", "403", "forbidden", "authentication", "api key"])) {
    return (
      `<b>Authentication error</b>\n\n` +
      `The AI provider rejected the request. Check your API keys and provider configuration.\n\n` +
      `<i>${escapeHtml(msg)}</i>`
    );
  }

  // Generic — show the actual error
  return `<b>Error</b>\n\n<i>${escapeHtml(msg)}</i>`;
}

/**
 * Format a caught exception into a user-friendly HTML message with context.
 */
export function formatCatchError(err: unknown, context: string): string {
  const msg = extractMessage(err);

  // Connection refused / server unreachable
  if (matchesAny(msg, ["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "fetch failed", "network", "socket"])) {
    return (
      `<b>Server unreachable</b>\n\n` +
      `Cannot connect to OpenCode at <code>${HOST}:${PORT}</code>. Make sure the server is running.`
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
      `<i>${escapeHtml(msg)}</i>`
    );
  }

  // Model not found from exceptions
  if (matchesAny(msg, ["model not found", "ProviderModelNotFoundError"])) {
    return (
      `<b>Model not found</b>\n\n` +
      `The selected model isn't available. Use /model to check or /providers to see what's available.\n\n` +
      `<i>${escapeHtml(msg)}</i>`
    );
  }

  // Generic — show what happened and why
  return (
    `<b>Error ${escapeHtml(context)}</b>\n\n` +
    `<i>${escapeHtml(msg)}</i>`
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
    // Status code errors
    if (e.statusCode || e.status) {
      const code = e.statusCode ?? e.status;
      const body = e.body ?? e.data ?? "";
      return `HTTP ${code}${body ? `: ${typeof body === "string" ? body : JSON.stringify(body)}` : ""}`;
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
