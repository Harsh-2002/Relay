import { getClient } from "./client.js";

let activeSessionId: string | null = null;
let selectedModel: { providerID: string; modelID: string } | null = null;

export async function getOrCreateSession(): Promise<string> {
  if (activeSessionId) return activeSessionId;

  const client = getClient();
  const result = await client.session.create({ body: { title: "Telegram Session" } });
  if (result.data) {
    activeSessionId = result.data.id;
    return activeSessionId;
  }
  throw new Error("Failed to create session");
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
