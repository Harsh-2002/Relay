import { Readable } from "stream";
import { getConfig } from "../config/index.js";
import { getSelectedSttProvider as getSessionSttProvider } from "../session.js";
import { sttLogger } from "./logger.js";

export interface TranscriptionResult {
  text: string;
  provider: "openai" | "groq" | "assemblyai" | "sarvam" | "sarvam-translate";
}

type SttProvider = "openai" | "groq" | "assemblyai" | "sarvam" | "sarvam-translate" | "auto";

export function isSttAvailable(): boolean {
  const config = getConfig();
  return !!(
    config.openaiSttApiKey ||
    config.groqApiKey ||
    config.assemblyaiApiKey ||
    config.sarvamApiKey
  );
}

export function getSttProvider(): string | null {
  const config = getConfig();

  // Runtime override from /stt command takes priority
  const sessionProv = getSessionSttProvider();
  const provider = (sessionProv ?? config.sttProvider) as SttProvider;

  if (provider !== "auto") {
    const keyMap: Record<string, string | undefined> = {
      groq: config.groqApiKey,
      openai: config.openaiSttApiKey,
      assemblyai: config.assemblyaiApiKey,
      sarvam: config.sarvamApiKey,
      "sarvam-translate": config.sarvamApiKey,
    };
    return keyMap[provider] ? provider : null;
  }

  // Auto-detect: Groq > Sarvam > AssemblyAI > OpenAI
  if (config.groqApiKey) return "groq";
  if (config.sarvamApiKey) return "sarvam";
  if (config.assemblyaiApiKey) return "assemblyai";
  if (config.openaiSttApiKey) return "openai";
  return null;
}

/** All known STT providers with their configuration status. */
export interface SttProviderInfo {
  id: string;
  name: string;
  configured: boolean;
}

export function listSttProviders(): SttProviderInfo[] {
  const config = getConfig();
  return [
    { id: "groq", name: "Groq", configured: !!config.groqApiKey },
    { id: "openai", name: "OpenAI", configured: !!config.openaiSttApiKey },
    { id: "assemblyai", name: "AssemblyAI", configured: !!config.assemblyaiApiKey },
    { id: "sarvam", name: "Sarvam", configured: !!config.sarvamApiKey },
    { id: "sarvam-translate", name: "Sarvam Translate", configured: !!config.sarvamApiKey },
  ];
}

export async function transcribeAudio(
  buffer: Buffer,
  filename: string
): Promise<TranscriptionResult> {
  const provider = getSttProvider();
  if (!provider) {
    throw new Error(
      "No STT provider configured. Run 'relay onboard' to add STT API keys."
    );
  }

  sttLogger.info({ provider, filename }, "Transcribing audio");

  switch (provider) {
    case "groq":
      return transcribeWithGroq(buffer, filename);
    case "openai":
      return transcribeWithOpenAI(buffer, filename);
    case "assemblyai":
      return transcribeWithAssemblyAI(buffer);
    case "sarvam":
      return transcribeWithSarvam(buffer, filename);
    case "sarvam-translate":
      return translateWithSarvam(buffer, filename);
    default:
      throw new Error(`Unknown STT provider: ${provider}`);
  }
}

async function transcribeWithOpenAI(
  buffer: Buffer,
  filename: string
): Promise<TranscriptionResult> {
  const config = getConfig();
  const apiKey = config.openaiSttApiKey;
  const model = config.openaiSttModel;

  const formData = new FormData();
  formData.append("file", new Blob([new Uint8Array(buffer)]), filename);
  formData.append("model", model);

  const response = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    }
  );

  if (!response.ok) {
    sttLogger.info({ provider: "openai", status: response.status }, "STT HTTP error");
    throw new Error(`Voice transcription failed (OpenAI, HTTP ${response.status})`);
  }

  const data = (await response.json()) as { text: string };
  sttLogger.info({ provider: "openai", chars: data.text.length }, "Transcription complete");
  return { text: data.text, provider: "openai" };
}

async function transcribeWithGroq(
  buffer: Buffer,
  filename: string
): Promise<TranscriptionResult> {
  const config = getConfig();
  const apiKey = config.groqApiKey;
  const model = config.groqSttModel;

  const formData = new FormData();
  formData.append("file", new Blob([new Uint8Array(buffer)]), filename);
  formData.append("model", model);

  const response = await fetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    }
  );

  if (!response.ok) {
    sttLogger.info({ provider: "groq", status: response.status }, "STT HTTP error");
    throw new Error(`Voice transcription failed (Groq, HTTP ${response.status})`);
  }

  const data = (await response.json()) as { text: string };
  sttLogger.info({ provider: "groq", chars: data.text.length }, "Transcription complete");
  return { text: data.text, provider: "groq" };
}

async function transcribeWithAssemblyAI(
  buffer: Buffer
): Promise<TranscriptionResult> {
  const config = getConfig();
  const apiKey = config.assemblyaiApiKey;

  // Step 1: Upload audio
  const uploadResp = await fetch("https://api.assemblyai.com/v2/upload", {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/octet-stream",
    },
    body: new Uint8Array(buffer),
  });

  if (!uploadResp.ok) {
    sttLogger.info({ provider: "assemblyai", status: uploadResp.status, phase: "upload" }, "STT HTTP error");
    throw new Error(`Voice transcription failed (AssemblyAI upload, HTTP ${uploadResp.status})`);
  }

  const { upload_url } = (await uploadResp.json()) as { upload_url: string };

  // Step 2: Create transcript
  const transcriptResp = await fetch(
    "https://api.assemblyai.com/v2/transcript",
    {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ audio_url: upload_url }),
    }
  );

  if (!transcriptResp.ok) {
    sttLogger.info({ provider: "assemblyai", status: transcriptResp.status, phase: "transcript" }, "STT HTTP error");
    throw new Error(`Voice transcription failed (AssemblyAI, HTTP ${transcriptResp.status})`);
  }

  const { id } = (await transcriptResp.json()) as { id: string };

  // Step 3: Poll for completion (max 60s)
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const pollResp = await fetch(
      `https://api.assemblyai.com/v2/transcript/${id}`,
      { headers: { Authorization: apiKey } }
    );

    if (!pollResp.ok) {
      sttLogger.info({ provider: "assemblyai", status: pollResp.status, phase: "polling" }, "STT HTTP error");
      throw new Error(`Voice transcription failed (AssemblyAI polling, HTTP ${pollResp.status})`);
    }

    const result = (await pollResp.json()) as {
      status: string;
      text?: string;
      error?: string;
    };

    if (result.status === "completed") {
      sttLogger.info({ provider: "assemblyai", chars: result.text?.length ?? 0 }, "Transcription complete");
      return { text: result.text ?? "", provider: "assemblyai" };
    }
    if (result.status === "error") {
      throw new Error(`Voice transcription failed (AssemblyAI: ${result.error ?? "unknown"})`);
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  throw new Error("AssemblyAI transcription timed out (60s)");
}

async function transcribeWithSarvam(
  buffer: Buffer,
  filename: string
): Promise<TranscriptionResult> {
  const config = getConfig();
  const apiKey = config.sarvamApiKey;
  const model = config.sarvamSttModel as any;

  try {
    const { SarvamAIClient } = await import("sarvamai");
    const client = new SarvamAIClient({ apiSubscriptionKey: apiKey });
    const stream = Readable.from(buffer);
    const result = await client.speechToText.transcribe({
      file: stream,
      model,
      mode: "transcribe",
    });

    const text = result.transcript ?? "";
    sttLogger.info({ provider: "sarvam", chars: text.length }, "Transcription complete");
    return { text, provider: "sarvam" };
  } catch (err: any) {
    const status = err.statusCode ?? err.status ?? "";
    const message = err.message ?? "unknown error";
    throw new Error(`Voice transcription failed (Sarvam${status ? `, HTTP ${status}` : ""}: ${message})`);
  }
}

async function translateWithSarvam(
  buffer: Buffer,
  filename: string
): Promise<TranscriptionResult> {
  const config = getConfig();
  const apiKey = config.sarvamApiKey;
  const model = config.sarvamSttModel as any;

  try {
    const { SarvamAIClient } = await import("sarvamai");
    const client = new SarvamAIClient({ apiSubscriptionKey: apiKey });
    const stream = Readable.from(buffer);
    // Use saaras:v3 transcribe endpoint with mode=translate (newer than the separate translate endpoint)
    const result = await client.speechToText.transcribe({
      file: stream,
      model,
      mode: "translate",
    });

    const text = result.transcript ?? "";
    sttLogger.info({ provider: "sarvam-translate", chars: text.length }, "Translation complete");
    return { text, provider: "sarvam-translate" };
  } catch (err: any) {
    const status = err.statusCode ?? err.status ?? "";
    const message = err.message ?? "unknown error";
    throw new Error(`Voice translation failed (Sarvam${status ? `, HTTP ${status}` : ""}: ${message})`);
  }
}
