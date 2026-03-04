import type { Provider } from "./types.js";
import { getConfig } from "../config/index.js";

let activeProvider: Provider | null = null;

export function getProviderName(): Provider["name"] {
  const name = getConfig().provider;
  if (name === "opencode") {
    return name;
  }
  throw new Error(
    `Unknown provider: "${name}". Only "opencode" is supported.`
  );
}

export async function initProvider(): Promise<Provider> {
  if (activeProvider) {
    activeProvider.shutdown();
    activeProvider = null;
  }
  getProviderName(); // validates

  const { OpenCodeProvider } = await import("./opencode.js");
  activeProvider = new OpenCodeProvider();

  await activeProvider.init();
  return activeProvider;
}

export function getProvider(): Provider {
  if (!activeProvider) {
    throw new Error("Provider not initialized. Call initProvider() first.");
  }
  return activeProvider;
}

export function shutdownProvider(): void {
  activeProvider?.shutdown();
}

export async function reconnectProvider(): Promise<void> {
  if (!activeProvider) {
    throw new Error("Provider not initialized. Call initProvider() first.");
  }
  await activeProvider.reconnect();
}

export type { Provider } from "./types.js";
