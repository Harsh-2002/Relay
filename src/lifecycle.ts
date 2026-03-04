/**
 * OpenCode server lifecycle monitor.
 *
 * Periodically pings the OpenCode server and auto-reconnects if it dies.
 * Clears stale sessions after successful reconnection so the next prompt
 * creates a fresh session.
 *
 * Recovery is silent (log-only) — no Telegram alerts for successful reconnects.
 */

import { getProvider, reconnectProvider } from "./providers/index.js";
import { clearActiveSession } from "./session.js";
import { lifecycleLogger } from "./utils/logger.js";

// --- Configuration ---

const HEALTH_CHECK_INTERVAL_MS = 60_000;   // Ping every 60 seconds
const FAILURE_THRESHOLD = 2;               // 2 consecutive failures → trigger reconnect
const MAX_RECONNECT_ATTEMPTS = 3;          // Retry up to 3 times per cycle
const RECONNECT_BACKOFF_BASE_MS = 5_000;   // Exponential backoff: 5s, 10s, 20s

// --- State ---

let healthTimer: ReturnType<typeof setInterval> | null = null;
let consecutiveFailures = 0;
let serverDown = false;
let reconnectPromise: Promise<boolean> | null = null;

// --- Public API ---

/**
 * Start the periodic health check. Call after the bot is running.
 */
export function startLifecycleMonitor(): void {
  stopLifecycleMonitor();
  lifecycleLogger.info(
    { intervalMs: HEALTH_CHECK_INTERVAL_MS, failureThreshold: FAILURE_THRESHOLD },
    "Lifecycle monitor started"
  );
  healthTimer = setInterval(() => {
    healthCheck().catch((err) => {
      lifecycleLogger.error({ err: err?.message }, "Health check unexpected error");
    });
  }, HEALTH_CHECK_INTERVAL_MS);
}

/**
 * Stop the periodic health check. Call during graceful shutdown.
 */
export function stopLifecycleMonitor(): void {
  if (healthTimer) {
    clearInterval(healthTimer);
    healthTimer = null;
  }
}

/**
 * Pre-flight check for callers (e.g. cron jobs) that need a live server.
 * Returns immediately if the server is up.
 * If the server is down, awaits or triggers reconnection.
 * Throws if reconnection fails.
 */
export async function ensureServerAlive(): Promise<void> {
  if (!serverDown) return;

  // If a reconnect is already in progress, wait for it
  if (reconnectPromise) {
    const ok = await reconnectPromise;
    if (!ok) {
      throw new Error("OpenCode server is down and reconnection failed");
    }
    return;
  }

  // Server is down but no reconnect in progress — trigger one
  const ok = await attemptReconnect();
  if (!ok) {
    throw new Error("OpenCode server is down and reconnection failed");
  }
}

/**
 * Check whether the server is currently considered down.
 */
export function isServerDown(): boolean {
  return serverDown;
}

// --- Internal ---

async function healthCheck(): Promise<void> {
  let alive = false;
  try {
    const provider = getProvider();
    alive = await provider.isAlive();
  } catch {
    alive = false;
  }

  if (alive) {
    if (consecutiveFailures > 0) {
      lifecycleLogger.info(
        { previousFailures: consecutiveFailures },
        "Health check passed — server responsive"
      );
    }
    if (serverDown) {
      lifecycleLogger.info("Server recovered (detected by health check)");
      serverDown = false;
    }
    consecutiveFailures = 0;
    return;
  }

  // Server did not respond
  consecutiveFailures++;
  lifecycleLogger.warn(
    { consecutiveFailures, threshold: FAILURE_THRESHOLD },
    "Health check failed — server unresponsive"
  );

  if (consecutiveFailures >= FAILURE_THRESHOLD && !reconnectPromise) {
    serverDown = true;
    lifecycleLogger.warn("Failure threshold reached — attempting reconnection");
    attemptReconnect().catch((err) => {
      lifecycleLogger.error({ err: err?.message }, "Reconnection attempt failed");
    });
  }
}

async function attemptReconnect(): Promise<boolean> {
  // Mutex: if already reconnecting, return the existing promise
  if (reconnectPromise) return reconnectPromise;

  reconnectPromise = (async (): Promise<boolean> => {
    for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
      lifecycleLogger.info(
        { attempt, maxAttempts: MAX_RECONNECT_ATTEMPTS },
        "Reconnection attempt"
      );

      try {
        await reconnectProvider();

        // Verify the new server is alive
        const provider = getProvider();
        const alive = await provider.isAlive();

        if (alive) {
          // Success — clear stale session so next prompt creates a fresh one
          clearActiveSession();
          consecutiveFailures = 0;
          serverDown = false;
          lifecycleLogger.info({ attempt }, "Reconnection successful — stale session cleared");
          return true;
        }

        lifecycleLogger.warn({ attempt }, "Reconnection completed but server still unresponsive");
      } catch (err: any) {
        lifecycleLogger.warn(
          { attempt, err: err?.message },
          "Reconnection attempt failed"
        );
      }

      // Exponential backoff before next attempt
      if (attempt < MAX_RECONNECT_ATTEMPTS) {
        const backoffMs = RECONNECT_BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
        lifecycleLogger.info({ backoffMs }, "Waiting before next reconnection attempt");
        await sleep(backoffMs);
      }
    }

    lifecycleLogger.error(
      { maxAttempts: MAX_RECONNECT_ATTEMPTS },
      "All reconnection attempts failed — server remains down"
    );
    return false;
  })();

  try {
    return await reconnectPromise;
  } finally {
    reconnectPromise = null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
