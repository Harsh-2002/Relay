import { InputFile, InlineKeyboard, type Api, type RawApi } from "grammy";
import { createHash } from "crypto";
import { getProvider } from "./providers/index.js";
import { getSelectedModel } from "./session.js";
import { markdownToHtml } from "./utils/markdown.js";
import { chunkMessage } from "./utils/chunker.js";
import { escapeHtml } from "./utils/html.js";
import { htmlToReadableText } from "./utils/html-to-text.js";
import { JsonStore } from "./utils/store.js";
import { watchLogger } from "./utils/logger.js";
import { ensureServerAlive } from "./lifecycle.js";
import { getConfig } from "./config/index.js";
import { formatInTimezone, getTimezoneAbbr } from "./cron.js";
import type { ResponseFile } from "./utils/files.js";

const MAX_ERROR_LEN = 500;
const MAX_CONTENT_LEN = 50_000; // 50KB max per snapshot
const MAX_AI_CONTENT_LEN = 3000; // Cap content sent to AI
const SNAPSHOT_RING_SIZE = 3;
const FETCH_TIMEOUT_MS = 30_000;
const MIN_CONTENT_WORDS = 50;

// --- Data Model ---

export interface Snapshot {
  fetchedAt: number;
  hash: string;
  content: string;
}

export interface PendingReanalysis {
  /** Content as it was just before the first failed analysis (last successful state). */
  previousContent: string;
  /** Latest content — updated on every subsequent tick that detects a new change. */
  currentContent: string;
  /** When the original change that kicked this off was first observed. */
  detectedAt: number;
  /** Number of attempts so far (1 = first failure). */
  attempts: number;
  /** Timestamp of the most recent attempt. */
  lastAttemptAt: number;
  /** Human-readable, classified error from the latest attempt. */
  lastError: string;
  /** Model id attempted, e.g. "zai-coding-plan/glm-5.1". */
  modelTried?: string;
  /** Telegram message id of the failure card — so retry edits in place. */
  notificationMsgId?: number;
  notificationChatId?: number;
}

export interface WatchJob {
  id: string;
  name: string;
  url: string;
  task: string;
  intervalMinutes: number;
  enabled: boolean;
  createdAt: number;
  lastCheckAt: number | null;
  lastCheckOk: boolean | null;
  lastChangedAt: number | null;
  nextCheckAt: number;
  checkCount: number;
  changeCount: number;
  consecutiveErrors: number;
  snapshots: Snapshot[];
  /**
   * Set when an analysis attempt fails. Preserves the diff pair so the user
   * can manually retry (e.g. after switching model) without losing the fact
   * that a change needs analyzing. Absent means no pending retry.
   */
  pendingReanalysis?: PendingReanalysis;
}

interface WatchState {
  watches: WatchJob[];
}

// --- Storage ---

const store = new JsonStore<WatchState>("watch.json", { watches: [] });
let watches: WatchJob[] = store.load().watches;

function persist(): void {
  store.save({ watches });
}

// --- Helpers ---

function generateId(): string {
  return crypto.randomUUID();
}

function hashContent(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function getTimezone(): string {
  try {
    return getConfig().timezone || "UTC";
  } catch {
    return "UTC";
  }
}

// --- CRUD ---

export function listWatches(): WatchJob[] {
  return watches;
}

export function getWatch(id: string): WatchJob | undefined {
  return watches.find(w => w.id === id);
}

export interface WatchValidation {
  ok: boolean;
  status?: number;
  wordCount?: number;
  error?: string;
  warning?: string;
  snapshot?: Snapshot;
}

export async function validateWatchUrl(url: string): Promise<WatchValidation> {
  let html: string;
  let status: number;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "Relay-Watch/1.0" },
    });
    status = response.status;
    if (!response.ok) {
      return { ok: false, status, error: `HTTP ${status} ${response.statusText}` };
    }
    html = await response.text();
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Fetch failed" };
  }

  let text = htmlToReadableText(html);
  if (text.length > MAX_CONTENT_LEN) {
    text = text.slice(0, MAX_CONTENT_LEN);
  }

  const wordCount = text.split(/\s+/).filter(w => w).length;
  const snapshot: Snapshot = { fetchedAt: Date.now(), hash: hashContent(text), content: text };

  if (wordCount < MIN_CONTENT_WORDS) {
    return {
      ok: true,
      status,
      wordCount,
      warning: `Page returned very little content (${wordCount} words). It may use JavaScript rendering or have bot protection.`,
      snapshot,
    };
  }

  return { ok: true, status, wordCount, snapshot };
}

export function addWatch(name: string, url: string, task: string, intervalMinutes: number, baseline?: Snapshot): WatchJob {
  if (intervalMinutes < 5) intervalMinutes = 5;
  const now = Date.now();
  const watch: WatchJob = {
    id: generateId(),
    name,
    url,
    task,
    intervalMinutes,
    enabled: true,
    createdAt: now,
    lastCheckAt: baseline ? baseline.fetchedAt : null,
    lastCheckOk: baseline ? true : null,
    lastChangedAt: null,
    nextCheckAt: now + intervalMinutes * 60_000,
    checkCount: baseline ? 1 : 0,
    changeCount: 0,
    consecutiveErrors: 0,
    snapshots: baseline ? [baseline] : [],
  };
  watches.push(watch);
  persist();
  watchLogger.info({ watchId: watch.id, name, url, intervalMinutes, hasBaseline: !!baseline }, "Watch created");
  return watch;
}

export function removeWatch(id: string): boolean {
  const idx = watches.findIndex(w => w.id === id);
  if (idx === -1) return false;
  const [removed] = watches.splice(idx, 1);
  persist();
  watchLogger.info({ watchId: id, name: removed.name }, "Watch removed");
  return true;
}

export function toggleWatch(id: string): WatchJob | null {
  const watch = watches.find(w => w.id === id);
  if (!watch) return null;
  watch.enabled = !watch.enabled;
  if (watch.enabled) {
    watch.nextCheckAt = Date.now() + watch.intervalMinutes * 60_000;
    watch.consecutiveErrors = 0;
  }
  persist();
  watchLogger.info({ watchId: id, enabled: watch.enabled }, "Watch toggled");
  return watch;
}

export function updateWatch(id: string, updates: { name?: string; url?: string; task?: string; intervalMinutes?: number }): WatchJob | null {
  const watch = watches.find(w => w.id === id);
  if (!watch) return null;
  if (updates.name !== undefined) watch.name = updates.name;
  if (updates.url !== undefined) watch.url = updates.url;
  if (updates.task !== undefined) watch.task = updates.task;
  if (updates.intervalMinutes !== undefined) {
    watch.intervalMinutes = Math.max(5, updates.intervalMinutes);
    watch.nextCheckAt = Date.now() + watch.intervalMinutes * 60_000;
  }
  persist();
  watchLogger.info({ watchId: id, name: watch.name }, "Watch updated");
  return watch;
}

// --- Scheduler Engine ---

let tickTimer: ReturnType<typeof setInterval> | null = null;
let schedulerApi: Api<RawApi> | null = null;
let schedulerChatId: number | null = null;
const runningChecks = new Set<string>();

export function startWatchScheduler(api: Api<RawApi>, chatId: number): void {
  schedulerApi = api;
  schedulerChatId = chatId;

  // Startup recovery: advance stale nextCheckAt
  const now = Date.now();
  let recovered = 0;
  for (const watch of watches) {
    if (watch.enabled && watch.nextCheckAt <= now) {
      watch.nextCheckAt = now + watch.intervalMinutes * 60_000;
      recovered++;
    }
  }
  if (recovered > 0) {
    persist();
    watchLogger.info({ recovered }, "Advanced stale watch schedules on startup");
  }

  watchLogger.info({ watchCount: watches.length }, "Watch scheduler started (30s tick)");
  tickTimer = setInterval(() => watchTick(), 30_000);
}

export function stopWatchScheduler(): void {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  watchLogger.info("Watch scheduler stopped");
}

function watchTick(): void {
  const now = Date.now();
  for (const watch of watches) {
    if (!watch.enabled) continue;
    if (watch.nextCheckAt > now) continue;
    if (runningChecks.has(watch.id)) continue;

    // Advance nextCheckAt immediately to prevent double-fire
    watch.nextCheckAt = now + watch.intervalMinutes * 60_000;
    persist();

    runningChecks.add(watch.id);
    checkWatch(watch).catch(err => {
      watchLogger.info({ watchId: watch.id, err: err?.message }, "Watch check failed");
    }).finally(() => {
      runningChecks.delete(watch.id);
    });
  }
}

// --- Core Check Pipeline ---

async function checkWatch(watch: WatchJob): Promise<void> {
  watchLogger.info({ watchId: watch.id, name: watch.name, url: watch.url }, "Checking watch");

  let text: string;
  try {
    const response = await fetch(watch.url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "Relay-Watch/1.0" },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const html = await response.text();
    text = htmlToReadableText(html);
    if (text.length > MAX_CONTENT_LEN) {
      text = text.slice(0, MAX_CONTENT_LEN);
    }
  } catch (err: any) {
    handleFetchError(watch, err);
    return;
  }

  // Success — reset error counter
  watch.consecutiveErrors = 0;
  watch.lastCheckAt = Date.now();
  watch.lastCheckOk = true;
  watch.checkCount++;

  const hash = hashContent(text);
  const latestSnapshot = watch.snapshots[watch.snapshots.length - 1];

  if (latestSnapshot && latestSnapshot.hash === hash) {
    // No change — done
    watchLogger.info({ watchId: watch.id }, "No change detected");
    persist();
    return;
  }

  // Content changed — store snapshot
  const snapshot: Snapshot = { fetchedAt: Date.now(), hash, content: text };
  watch.snapshots.push(snapshot);
  if (watch.snapshots.length > SNAPSHOT_RING_SIZE) {
    watch.snapshots = watch.snapshots.slice(-SNAPSHOT_RING_SIZE);
  }
  watch.changeCount++;
  watch.lastChangedAt = Date.now();

  // If a previous analysis is still pending retry, don't kick off a fresh one —
  // just update the latest content so whenever the user hits Retry, the diff
  // covers everything from the last successful state through right now.
  // The user opted into manual-only retries; we never auto-fire a fresh attempt
  // while pending is outstanding.
  if (watch.pendingReanalysis) {
    watch.pendingReanalysis.currentContent = text;
    persist();
    watchLogger.info(
      { watchId: watch.id, changeCount: watch.changeCount, attempts: watch.pendingReanalysis.attempts },
      "Change detected while retry pending — updated pendingReanalysis.currentContent",
    );
    return;
  }

  persist();
  watchLogger.info({ watchId: watch.id, changeCount: watch.changeCount }, "Change detected");

  // First snapshot = baseline, no AI analysis needed
  if (!latestSnapshot) {
    watchLogger.info({ watchId: watch.id }, "Baseline snapshot stored");
    return;
  }

  // Analyze change with AI
  await analyzeChange(watch, latestSnapshot.content, text);
}

function handleFetchError(watch: WatchJob, err: any): void {
  watch.consecutiveErrors++;
  watch.lastCheckAt = Date.now();
  watch.lastCheckOk = false;
  watch.checkCount++;

  watchLogger.info(
    { watchId: watch.id, consecutiveErrors: watch.consecutiveErrors, err: err?.message },
    "Watch fetch error",
  );

  // Notify on error #1 and #3
  if (schedulerApi && schedulerChatId && (watch.consecutiveErrors === 1 || watch.consecutiveErrors === 3)) {
    const errText = (err?.message ?? "unknown").slice(0, MAX_ERROR_LEN);
    schedulerApi.sendMessage(
      schedulerChatId,
      `<b>Watch: ${escapeHtml(watch.name)}</b>\n\n` +
      `<b>Error fetching URL</b> (attempt ${watch.consecutiveErrors})\n` +
      `<code>${escapeHtml(errText)}</code>\n\n` +
      `URL: ${escapeHtml(watch.url)}`,
      { parse_mode: "HTML" },
    ).catch(() => {});
  }

  // Auto-disable at 5 consecutive errors
  if (watch.consecutiveErrors >= 5) {
    watch.enabled = false;
    watchLogger.info({ watchId: watch.id }, "Watch auto-disabled after 5 consecutive errors");
    if (schedulerApi && schedulerChatId) {
      schedulerApi.sendMessage(
        schedulerChatId,
        `<b>Watch: ${escapeHtml(watch.name)}</b>\n\n` +
        `<b>Auto-disabled</b> after 5 consecutive fetch errors.\n` +
        `Use /watch to re-enable.`,
        { parse_mode: "HTML" },
      ).catch(() => {});
    }
  }

  persist();
}

/**
 * Map a raw analysis error into a short, user-actionable reason string.
 * Kept as message-based pattern matching for now; the provider does not yet
 * tag errors with a distinct `reason` field.
 */
export function classifyAnalysisError(err: any): string {
  const msg = String(err?.message ?? err ?? "").trim();
  const lower = msg.toLowerCase();

  if (lower.includes("session not found") || lower.includes("no response received")) {
    return "Model didn't respond in 120s. Likely unavailable or rate-limited.";
  }
  if (lower.includes("model not found")) {
    const match = msg.match(/Model not found:\s*([^\s.]+)/i);
    return match ? `Model unavailable: ${match[1]}` : "Model unavailable.";
  }
  if (lower.includes("rate limit") || lower.includes(" 429") || lower.endsWith("429")) {
    return "Rate limited by provider. Wait a minute, then retry.";
  }
  if (lower.includes("unauthorized") || lower.includes(" 401") || lower.includes("invalid api key")) {
    return "Provider rejected the API key. Check your OpenCode auth.";
  }
  if (lower.includes("server unreachable") || lower.includes("econnrefused")) {
    return "OpenCode server unreachable.";
  }

  return msg.slice(0, 200) || "Unknown error.";
}

function buildFailureCard(watch: WatchJob, pending: PendingReanalysis): string {
  const header = `<b>Watch: ${escapeHtml(watch.name.slice(0, 100))}</b>`;
  const model = pending.modelTried ? escapeHtml(pending.modelTried) : "(default)";
  const reason = escapeHtml(pending.lastError);
  return (
    `${header}\n` +
    `<i>Analysis failed.</i>\n\n` +
    `Reason: ${reason}\n` +
    `Model tried: <code>${model}</code>\n` +
    `Attempt ${pending.attempts}. Tap ↻ Retry to try again (uses your current /model).`
  );
}

function buildFailureKeyboard(watchId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("↻ Retry", `watch_retry:${watchId}`)
    .text("Dismiss", `watch_dismiss:${watchId}`);
}

/**
 * Shared inner logic for a single analysis attempt against a given before/after
 * content pair. Handles session creation, streaming, rendering to Telegram, and
 * file attachments. Throws on failure so the caller can decide whether the
 * failure should populate pendingReanalysis or (on retry) update the existing
 * one. Resolves normally on AI success.
 *
 * `msgId` is the Telegram message id of the "Analyzing…" header that we edit
 * in place. Caller creates/owns that message so both first-run and retry can
 * reuse the same card.
 */
async function runAnalysisAttempt(
  watch: WatchJob,
  previousContent: string,
  currentContent: string,
  api: Api<RawApi>,
  chatId: number,
  msgId: number,
): Promise<{ ok: boolean; modelTried?: string }> {
  const header = `<b>Watch: ${escapeHtml(watch.name.slice(0, 100))}</b>`;

  // Animated dots
  let dotPhase = 0;
  const dotTimer = setInterval(() => {
    dotPhase = (dotPhase % 3) + 1;
    api.editMessageText(chatId, msgId, `${header}\n\nAnalyzing${".".repeat(dotPhase)}`, { parse_mode: "HTML" })
      .catch(() => {});
  }, 500);

  const provider = getProvider();
  let watchSessionId: string | null = null;
  const model = getSelectedModel();
  const modelId = model ? `${model.providerID}/${model.modelID}` : undefined;

  try {
    const session = await provider.createSession(`Watch: ${watch.name}`);
    watchSessionId = session.id;
    watchLogger.info({ watchId: watch.id, sessionId: watchSessionId, model: modelId }, "Created watch analysis session");

    const prompt = buildAnalysisPrompt(watch, previousContent, currentContent);

    let accumulated = "";
    const collectedFiles: ResponseFile[] = [];
    const stream = provider.promptStream(watchSessionId, prompt, {
      parts: [{ type: "text" as const, text: prompt }],
      ...(model && { model }),
      agent: "build",
      cronMode: true,
    });

    for await (const chunk of stream) {
      if (chunk.type === "text") {
        accumulated += chunk.content;
      } else if (chunk.type === "file" && chunk.file) {
        collectedFiles.push(chunk.file as ResponseFile);
      } else if (chunk.type === "done") {
        break;
      }
    }

    clearInterval(dotTimer);

    const trimmed = accumulated.trim();
    if (!trimmed || trimmed.toLowerCase().includes("no relevant changes")) {
      try {
        await api.editMessageText(chatId, msgId, `${header}\n\n<i>Change detected but not relevant to task.</i>`, { parse_mode: "HTML" });
      } catch {}
    } else {
      const html = markdownToHtml(trimmed);
      const chunks = chunkMessage(html);
      const firstWithHeader = `${header}\n\n${chunks[0]}`;
      if (firstWithHeader.length <= 4096) {
        try {
          await api.editMessageText(chatId, msgId, firstWithHeader, { parse_mode: "HTML" });
        } catch {
          try { await api.sendMessage(chatId, chunks[0], { parse_mode: "HTML" }); } catch {}
        }
      } else {
        try { await api.editMessageText(chatId, msgId, header, { parse_mode: "HTML" }); } catch {}
        try { await api.sendMessage(chatId, chunks[0], { parse_mode: "HTML" }); } catch {}
      }
      for (let i = 1; i < chunks.length; i++) {
        try { await api.sendMessage(chatId, chunks[i], { parse_mode: "HTML" }); } catch {}
      }
    }

    // Send file attachments
    for (const f of collectedFiles) {
      try {
        const buf = await resolveFileUrl(f.url);
        const input = new InputFile(buf, f.filename);
        if (f.mime?.startsWith("image/")) {
          await api.sendPhoto(chatId, input);
        } else {
          await api.sendDocument(chatId, input);
        }
      } catch (err: any) {
        watchLogger.info({ watchId: watch.id, err: err?.message }, "Failed to send watch file attachment");
      }
    }

    return { ok: true, modelTried: modelId };
  } finally {
    clearInterval(dotTimer);
    if (watchSessionId) {
      provider.deleteSession(watchSessionId).catch((err: any) => {
        watchLogger.info({ watchId: watch.id, sessionId: watchSessionId, err: err?.message }, "Failed to delete watch session");
      });
    }
  }
}

async function analyzeChange(watch: WatchJob, previousContent: string, currentContent: string): Promise<void> {
  if (!schedulerApi || !schedulerChatId) return;

  const api = schedulerApi;
  const chatId = schedulerChatId;

  // Pre-flight: ensure server is alive
  try {
    await ensureServerAlive();
  } catch (err: any) {
    watchLogger.info({ watchId: watch.id, err: err?.message }, "Watch analysis skipped: server down");
    try {
      await api.sendMessage(
        chatId,
        `<b>Watch: ${escapeHtml(watch.name)}</b>\n\n` +
        `Change detected but AI analysis skipped — server unreachable.`,
        { parse_mode: "HTML" },
      );
    } catch {}
    return;
  }

  // Send header message (owned here; runAnalysisAttempt edits it in place)
  let msgId: number | null = null;
  try {
    const msg = await api.sendMessage(chatId, `<b>Watch: ${escapeHtml(watch.name)}</b>\n\nAnalyzing change...`, { parse_mode: "HTML" });
    msgId = msg.message_id;
  } catch (err: any) {
    watchLogger.info({ watchId: watch.id, err: err?.message }, "Failed to send watch header");
    return;
  }

  const model = getSelectedModel();
  const modelId = model ? `${model.providerID}/${model.modelID}` : undefined;

  try {
    await runAnalysisAttempt(watch, previousContent, currentContent, api, chatId, msgId);
    // Success — clear any lingering pendingReanalysis (shouldn't normally exist here,
    // but if the user somehow triggered a new change while pending, the success path
    // replaces the old pending state.)
    if (watch.pendingReanalysis) {
      delete watch.pendingReanalysis;
      persist();
    }
  } catch (err: any) {
    const reason = classifyAnalysisError(err);
    watchLogger.info({ watchId: watch.id, err: err?.message, reason }, "Watch analysis error — pending retry");

    watch.pendingReanalysis = {
      previousContent,
      currentContent,
      detectedAt: Date.now(),
      attempts: 1,
      lastAttemptAt: Date.now(),
      lastError: reason,
      modelTried: modelId,
      notificationMsgId: msgId!,
      notificationChatId: chatId,
    };
    persist();

    try {
      await api.editMessageText(
        chatId,
        msgId!,
        buildFailureCard(watch, watch.pendingReanalysis),
        { parse_mode: "HTML", reply_markup: buildFailureKeyboard(watch.id) },
      );
    } catch {}
  }
}

/**
 * Re-run analysis for a watch that has a pendingReanalysis, using the stored
 * previous/current content pair. Uses whatever model is currently selected via
 * /model — so the user can switch first and retry to pick up the new model.
 *
 * Edits the same Telegram card that the original failure was posted to. On
 * success, clears pendingReanalysis and the result replaces the card. On
 * failure, bumps attempts and re-renders the failure card.
 */
export async function retryPendingAnalysis(id: string): Promise<"ok" | "not_found" | "nothing_pending" | "no_scheduler"> {
  const watch = watches.find(w => w.id === id);
  if (!watch) return "not_found";
  if (!watch.pendingReanalysis) return "nothing_pending";
  if (!schedulerApi || !schedulerChatId) return "no_scheduler";

  const api = schedulerApi;
  const pending = watch.pendingReanalysis;
  const chatId = pending.notificationChatId ?? schedulerChatId;

  // Resolve the card we edit: prefer the stored failure-card id, but if that
  // message was deleted or we somehow lost the id, post a fresh one so the
  // retry is still visible to the user.
  let msgId = pending.notificationMsgId;
  const header = `<b>Watch: ${escapeHtml(watch.name.slice(0, 100))}</b>`;
  if (!msgId) {
    try {
      const fresh = await api.sendMessage(chatId, `${header}\n\nAnalyzing...`, { parse_mode: "HTML" });
      msgId = fresh.message_id;
      pending.notificationMsgId = msgId;
      pending.notificationChatId = chatId;
      persist();
    } catch {
      return "no_scheduler";
    }
  } else {
    try {
      await api.editMessageText(chatId, msgId, `${header}\n\nAnalyzing...`, { parse_mode: "HTML" });
    } catch {
      // Stored msg was deleted / stale — fall back to a fresh card.
      try {
        const fresh = await api.sendMessage(chatId, `${header}\n\nAnalyzing...`, { parse_mode: "HTML" });
        msgId = fresh.message_id;
        pending.notificationMsgId = msgId;
        pending.notificationChatId = chatId;
        persist();
      } catch {
        return "no_scheduler";
      }
    }
  }

  // Pre-flight
  try {
    await ensureServerAlive();
  } catch (err: any) {
    const reason = classifyAnalysisError(err);
    pending.attempts++;
    pending.lastAttemptAt = Date.now();
    pending.lastError = reason;
    persist();
    try {
      await api.editMessageText(chatId, msgId, buildFailureCard(watch, pending), {
        parse_mode: "HTML",
        reply_markup: buildFailureKeyboard(watch.id),
      });
    } catch {}
    return "ok";
  }

  const model = getSelectedModel();
  const modelId = model ? `${model.providerID}/${model.modelID}` : undefined;

  try {
    await runAnalysisAttempt(watch, pending.previousContent, pending.currentContent, api, chatId, msgId);
    delete watch.pendingReanalysis;
    persist();
    watchLogger.info({ watchId: watch.id, attempts: pending.attempts, modelTried: modelId }, "Watch retry succeeded");
  } catch (err: any) {
    const reason = classifyAnalysisError(err);
    pending.attempts++;
    pending.lastAttemptAt = Date.now();
    pending.lastError = reason;
    pending.modelTried = modelId;
    persist();
    watchLogger.info({ watchId: watch.id, attempts: pending.attempts, err: err?.message, reason }, "Watch retry failed");
    try {
      await api.editMessageText(chatId, msgId, buildFailureCard(watch, pending), {
        parse_mode: "HTML",
        reply_markup: buildFailureKeyboard(watch.id),
      });
    } catch {}
  }
  return "ok";
}

/**
 * Clear pendingReanalysis without analyzing. Edits the failure card in place
 * to acknowledge the dismissal and removes the keyboard.
 */
export async function dismissPendingAnalysis(id: string): Promise<"ok" | "not_found" | "nothing_pending"> {
  const watch = watches.find(w => w.id === id);
  if (!watch) return "not_found";
  if (!watch.pendingReanalysis) return "nothing_pending";

  const pending = watch.pendingReanalysis;
  const chatId = pending.notificationChatId;
  const msgId = pending.notificationMsgId;

  delete watch.pendingReanalysis;
  persist();
  watchLogger.info({ watchId: watch.id }, "Watch retry dismissed");

  if (schedulerApi && chatId && msgId) {
    const header = `<b>Watch: ${escapeHtml(watch.name.slice(0, 100))}</b>`;
    try {
      await schedulerApi.editMessageText(chatId, msgId, `${header}\n\n<i>Dismissed.</i>`, { parse_mode: "HTML" });
    } catch {}
  }
  return "ok";
}

function buildAnalysisPrompt(watch: WatchJob, previousContent: string, currentContent: string): string {
  const prevTruncated = previousContent.length > MAX_AI_CONTENT_LEN
    ? previousContent.slice(0, MAX_AI_CONTENT_LEN) + "\n...[truncated]"
    : previousContent;
  const currTruncated = currentContent.length > MAX_AI_CONTENT_LEN
    ? currentContent.slice(0, MAX_AI_CONTENT_LEN) + "\n...[truncated]"
    : currentContent;

  return `[AUTOMATED WATCH — Execute directly. Do not ask questions.]

Monitoring URL: ${watch.url}
User's task: ${watch.task}

The page content has changed. Analyze ONLY changes relevant to the task.

Previous content:
${prevTruncated}

Current content:
${currTruncated}

Instructions:
- Focus ONLY on changes relevant to the user's task
- Ignore irrelevant changes (timestamps, ads, session tokens, layout)
- If changes are relevant, describe them clearly and concisely
- If no changes are relevant, respond: "No relevant changes."
- Keep response under 3000 characters`;
}

async function resolveFileUrl(url: string): Promise<Buffer> {
  if (url.startsWith("data:")) {
    const commaIdx = url.indexOf(",");
    if (commaIdx === -1) throw new Error("Invalid data URL");
    const data = url.slice(commaIdx + 1);
    const isBase64 = url.slice(0, commaIdx).includes(";base64");
    return Buffer.from(data, isBase64 ? "base64" : "utf-8");
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function runWatchNow(id: string): Promise<"ok" | "not_found" | "no_scheduler"> {
  const watch = watches.find(w => w.id === id);
  if (!watch) return "not_found";
  if (!schedulerApi || !schedulerChatId) return "no_scheduler";
  if (runningChecks.has(watch.id)) return "ok"; // Already running
  watchLogger.info({ watchId: id, name: watch.name }, "Manual watch check");
  runningChecks.add(watch.id);
  checkWatch(watch).catch(err => {
    watchLogger.info({ watchId: id, err: err?.message }, "Manual watch check failed");
  }).finally(() => {
    runningChecks.delete(watch.id);
  });
  return "ok";
}
