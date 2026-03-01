import { getProvider } from "./providers/index.js";
import { JsonStore } from "./utils/store.js";
import { getConfig } from "./config/index.js";
import { sessionLogger } from "./utils/logger.js";

interface SessionState {
  activeSessionId: string | null;
  selectedModel: { providerID: string; modelID: string } | null;
  selectedAgent: string | null;
  selectedSttProvider: string | null;
}

const store = new JsonStore<SessionState>("session.json", {
  activeSessionId: null,
  selectedModel: null,
  selectedAgent: null,
  selectedSttProvider: null,
});

// Load persisted state (or fall back to config for model)
const persisted = store.load();

let activeSessionId: string | null = persisted.activeSessionId;
let selectedAgent: string | null = persisted.selectedAgent ?? null;
let selectedSttProvider: string | null = persisted.selectedSttProvider ?? null;
let selectedModel: { providerID: string; modelID: string } | null = persisted.selectedModel ?? (() => {
  const envModel = getConfig().opencodeModel;
  if (envModel && envModel.includes("/")) {
    const [providerID, ...rest] = envModel.split("/");
    return { providerID, modelID: rest.join("/") };
  }
  return null;
})();

// Mutex to prevent double-create race when concurrent messages arrive
let createSessionPromise: Promise<string> | null = null;

// Prompt queue: ensures only one prompt runs at a time per session,
// preventing interleaved SSE responses from concurrent messages.
let promptQueueTail: Promise<void> = Promise.resolve();

/**
 * Queue a prompt-processing function so only one runs at a time.
 * If a previous prompt is still running, this waits for it to finish first.
 * The caller's function receives the session ID.
 */
export async function withPromptQueue<T>(fn: () => Promise<T>): Promise<T> {
  let resolve!: () => void;
  const gate = new Promise<void>((r) => { resolve = r; });
  const previousTail = promptQueueTail;
  promptQueueTail = gate;

  // Wait for previous prompt to finish
  await previousTail;

  try {
    return await fn();
  } finally {
    resolve();
  }
}

export async function getOrCreateSession(): Promise<string> {
  if (activeSessionId) {
    sessionLogger.info({ sessionId: activeSessionId }, "Using existing session");
    return activeSessionId;
  }

  // If another call is already creating a session, wait for it
  if (createSessionPromise) {
    sessionLogger.info("Waiting for concurrent session creation");
    return createSessionPromise;
  }

  sessionLogger.info("Creating new session");
  createSessionPromise = (async () => {
    try {
      const provider = getProvider();
      const session = await provider.createSession("Telegram Session");
      activeSessionId = session.id;
      persist();
      sessionLogger.info({ sessionId: activeSessionId }, "New session created");
      return activeSessionId;
    } finally {
      createSessionPromise = null;
    }
  })();

  return createSessionPromise;
}

export function getActiveSessionId(): string | null {
  return activeSessionId;
}

export function setActiveSessionId(id: string): void {
  const previousId = activeSessionId;
  activeSessionId = id;
  sessionLogger.info({ sessionId: id, previousId }, "Session switched");
  persist();
}

export function clearActiveSession(): void {
  const previousId = activeSessionId;
  activeSessionId = null;
  sessionLogger.info({ previousId }, "Session cleared");
  persist();
}

export function getSelectedModel(): { providerID: string; modelID: string } | null {
  return selectedModel;
}

export function setSelectedModel(providerID: string, modelID: string): void {
  selectedModel = { providerID, modelID };
  sessionLogger.info({ providerID, modelID }, "Model selected");
  persist();
}

export function clearSelectedModel(): void {
  const previous = selectedModel;
  selectedModel = null;
  sessionLogger.info({ previous }, "Model cleared");
  persist();
}

export function getSelectedAgent(): string | null {
  return selectedAgent;
}

export function setSelectedAgent(agent: string): void {
  selectedAgent = agent;
  sessionLogger.info({ agent }, "Agent selected");
  persist();
}

export function clearSelectedAgent(): void {
  const previous = selectedAgent;
  selectedAgent = null;
  sessionLogger.info({ previous }, "Agent cleared");
  persist();
}

export function getSelectedSttProvider(): string | null {
  return selectedSttProvider;
}

export function setSelectedSttProvider(provider: string): void {
  selectedSttProvider = provider;
  persist();
}

export function clearSelectedSttProvider(): void {
  selectedSttProvider = null;
  persist();
}

function persist(): void {
  store.save({ activeSessionId, selectedModel, selectedAgent, selectedSttProvider });
}
