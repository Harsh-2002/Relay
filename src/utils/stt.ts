import { getConfig } from "../config/index.js";
import { sttLogger } from "./logger.js";

export interface TranscriptionResult {
  text: string;
  provider: "openai" | "groq" | "assemblyai";
}

type SttProvider = "openai" | "groq" | "assemblyai" | "auto";

export function isSttAvailable(): boolean {
  const config = getConfig();
  return !!(
    config.openaiSttApiKey ||
    config.groqApiKey ||
    config.assemblyaiApiKey
  );
}

export function getSttProvider(): string | null {
  const config = getConfig();
  const provider = config.sttProvider as SttProvider;

  if (provider !== "auto") {
    const keyMap: Record<string, string | undefined> = {
      groq: config.groqApiKey,
      openai: config.openaiSttApiKey,
      assemblyai: config.assemblyaiApiKey,
    };
    return keyMap[provider] ? provider : null;
  }

  // Auto-detect: cheapest first (Groq > AssemblyAI > OpenAI)
  if (config.groqApiKey) return "groq";
  if (config.assemblyaiApiKey) return "assemblyai";
  if (config.openaiSttApiKey) return "openai";
  return null;
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

  sttLogger.debug({ provider, filename }, "Transcribing audio");

  switch (provider) {
    case "groq":
      return transcribeWithGroq(buffer, filename);
    case "openai":
      return transcribeWithOpenAI(buffer, filename);
    case "assemblyai":
      return transcribeWithAssemblyAI(buffer);
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
    throw new Error(`Voice transcription failed (OpenAI, HTTP ${response.status})`);
  }

  const data = (await response.json()) as { text: string };
  sttLogger.debug({ provider: "openai", chars: data.text.length }, "Transcription complete");
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
    throw new Error(`Voice transcription failed (Groq, HTTP ${response.status})`);
  }

  const data = (await response.json()) as { text: string };
  sttLogger.debug({ provider: "groq", chars: data.text.length }, "Transcription complete");
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
      throw new Error(`Voice transcription failed (AssemblyAI polling, HTTP ${pollResp.status})`);
    }

    const result = (await pollResp.json()) as {
      status: string;
      text?: string;
      error?: string;
    };

    if (result.status === "completed") {
      sttLogger.debug({ provider: "assemblyai", chars: result.text?.length ?? 0 }, "Transcription complete");
      return { text: result.text ?? "", provider: "assemblyai" };
    }
    if (result.status === "error") {
      throw new Error(`Voice transcription failed (AssemblyAI: ${result.error ?? "unknown"})`);
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  throw new Error("AssemblyAI transcription timed out (60s)");
}
