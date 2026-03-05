export interface RelayConfig {
  // Core
  botToken: string;
  allowedUserId: number;
  botMode: "polling" | "webhook";
  webhookUrl: string;
  webhookPort: number;
  webhookSecret: string;

  // Provider (always "opencode" — only supported value)
  provider: "opencode";
  opencodeHostname: string;
  opencodePort: number;
  opencodeModel: string;

  // STT
  sttProvider: "auto" | "openai" | "groq" | "assemblyai" | "sarvam" | "sarvam-translate";
  groqApiKey: string;
  openaiSttApiKey: string;
  assemblyaiApiKey: string;
  groqSttModel: string;
  openaiSttModel: string;
  sarvamApiKey: string;
  sarvamSttModel: string;

  // MCP Tools
  browserEnabled: boolean;
  fetchEnabled: boolean;
  memoryEnabled: boolean;
  filesystemEnabled: boolean;
  filesystemPaths: string[];
  relayMcpPort: number;

  // Behavior
  streamEditIntervalMs: number;

  // Timezone
  timezone: string; // IANA timezone string, e.g. "Asia/Kolkata", "America/New_York"

  // Paths
  dataDir: string;
  systemPromptFile: string;
}

export const CONFIG_DEFAULTS: RelayConfig = {
  botToken: "",
  allowedUserId: 0,
  botMode: "polling",
  webhookUrl: "",
  webhookPort: 39148,
  webhookSecret: "",

  provider: "opencode",
  opencodeHostname: "127.0.0.1",
  opencodePort: 39147,
  opencodeModel: "",

  sttProvider: "auto",
  groqApiKey: "",
  openaiSttApiKey: "",
  assemblyaiApiKey: "",
  groqSttModel: "whisper-large-v3-turbo",
  openaiSttModel: "gpt-4o-mini-transcribe",
  sarvamApiKey: "",
  sarvamSttModel: "saaras:v3",

  browserEnabled: false,
  fetchEnabled: false,
  memoryEnabled: false,
  filesystemEnabled: false,
  filesystemPaths: [],
  relayMcpPort: 39149,

  streamEditIntervalMs: 2000,

  timezone: "UTC",

  dataDir: "",
  systemPromptFile: "",
};
