import type { RelayConfig } from "./schema.js";
import { loadConfig } from "./loader.js";

let cachedConfig: RelayConfig | null = null;

export function getConfig(): RelayConfig {
  if (!cachedConfig) {
    const { config } = loadConfig();
    cachedConfig = config;
  }
  return cachedConfig;
}

export function setConfig(config: RelayConfig): void {
  cachedConfig = config;
}

export { loadConfig } from "./loader.js";
export { runSetupWizard, saveConfig } from "./setup.js";
export type { RelayConfig } from "./schema.js";
export { CONFIG_DEFAULTS } from "./schema.js";
