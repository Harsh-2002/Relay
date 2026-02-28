import { getProvider } from "./providers/index.js";
import { JsonStore } from "./utils/store.js";
import { getConfig } from "./config/index.js";

interface SessionState {
  activeSessionId: string | null;
  selectedModel: { providerID: string; modelID: string } | null;
}

const store = new JsonStore<SessionState>("session.json", {
  activeSessionId: null,
  selectedModel: null,
});

// Load persisted state (or fall back to config for model)
const persisted = store.load();

let activeSessionId: string | null = persisted.activeSessionId;
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

export async function getOrCreateSession(): Promise<string> {
  if (activeSessionId) return activeSessionId;

  // If another call is already creating a session, wait for it
  if (createSessionPromise) return createSessionPromise;

  createSessionPromise = (async () => {
    try {
      const provider = getProvider();
      const session = await provider.createSession("Telegram Session");
      activeSessionId = session.id;
      persist();
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
  activeSessionId = id;
  persist();
}

export function clearActiveSession(): void {
  activeSessionId = null;
  persist();
}

export function getSelectedModel(): { providerID: string; modelID: string } | null {
  return selectedModel;
}

export function setSelectedModel(providerID: string, modelID: string): void {
  selectedModel = { providerID, modelID };
  persist();
}

export function clearSelectedModel(): void {
  selectedModel = null;
  persist();
}

function persist(): void {
  store.save({ activeSessionId, selectedModel });
}
