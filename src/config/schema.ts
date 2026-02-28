export interface RelayConfig {
  // Core
  botToken: string;
  allowedUserId: number;
  botMode: "polling" | "webhook";
  webhookUrl: string;
  webhookPort: number;
  webhookSecret: string;

  // Provider
  provider: "opencode";
  opencodeMode: "start" | "connect";
  opencodeUrl: string;
  opencodeHostname: string;
  opencodePort: number;
  opencodeModel: string;

  // STT
  sttProvider: "auto" | "openai" | "groq" | "assemblyai";
  groqApiKey: string;
  openaiSttApiKey: string;
  assemblyaiApiKey: string;
  groqSttModel: string;
  openaiSttModel: string;

  // Behavior
  streamingEnabled: boolean;
  streamEditIntervalMs: number;
  promptTimeoutMs: number;
  logLevel: string;

  // Paths
  dataDir: string;
  systemPromptFile: string;
}

export const CONFIG_DEFAULTS: RelayConfig = {
  botToken: "",
  allowedUserId: 0,
  botMode: "polling",
  webhookUrl: "",
  webhookPort: 3000,
  webhookSecret: "",

  provider: "opencode",
  opencodeMode: "start",
  opencodeUrl: "http://localhost:4096",
  opencodeHostname: "127.0.0.1",
  opencodePort: 4096,
  opencodeModel: "",

  sttProvider: "auto",
  groqApiKey: "",
  openaiSttApiKey: "",
  assemblyaiApiKey: "",
  groqSttModel: "whisper-large-v3-turbo",
  openaiSttModel: "gpt-4o-mini-transcribe",

  streamingEnabled: false,
  streamEditIntervalMs: 2000,
  promptTimeoutMs: 300_000,
  logLevel: "info",

  dataDir: "",
  systemPromptFile: "",
};
