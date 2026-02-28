import { getProvider } from "./providers/index.js";

let activeSessionId: string | null = null;
let selectedModel: { providerID: string; modelID: string } | null = (() => {
  const envModel = process.env.OPENCODE_MODEL;
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
}

export function clearActiveSession(): void {
  activeSessionId = null;
}

export function getSelectedModel(): { providerID: string; modelID: string } | null {
  return selectedModel;
}

export function setSelectedModel(providerID: string, modelID: string): void {
  selectedModel = { providerID, modelID };
}

export function clearSelectedModel(): void {
  selectedModel = null;
}
