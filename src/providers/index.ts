import type { Provider, ProviderName } from "./types.js";

let activeProvider: Provider | null = null;

export function getProviderName(): ProviderName {
  const name = (process.env.PROVIDER ?? "opencode").toLowerCase();
  if (name === "opencode" || name === "claude" || name === "codex") {
    return name;
  }
  throw new Error(
    `Unknown provider: "${name}". Supported: opencode, claude, codex`
  );
}

export async function initProvider(): Promise<Provider> {
  const name = getProviderName();

  switch (name) {
    case "opencode": {
      const { OpenCodeProvider } = await import("./opencode.js");
      activeProvider = new OpenCodeProvider();
      break;
    }
    case "claude": {
      const { ClaudeProvider } = await import("./claude.js");
      activeProvider = new ClaudeProvider();
      break;
    }
    case "codex": {
      const { CodexProvider } = await import("./codex.js");
      activeProvider = new CodexProvider();
      break;
    }
  }

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

export type { Provider, ProviderName } from "./types.js";
