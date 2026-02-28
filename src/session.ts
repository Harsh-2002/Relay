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

export async function getOrCreateSession(): Promise<string> {
  if (activeSessionId) return activeSessionId;

  const provider = getProvider();
  const session = await provider.createSession("Telegram Session");
  activeSessionId = session.id;
  return activeSessionId;
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
