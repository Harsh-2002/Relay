export interface TranscriptionResult {
  text: string;
  provider: "openai" | "groq" | "assemblyai";
}

type SttProvider = "openai" | "groq" | "assemblyai" | "auto";

export function isSttAvailable(): boolean {
  return !!(
    process.env.OPENAI_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.ASSEMBLYAI_API_KEY
  );
}

export function getSttProvider(): string | null {
  const provider = (process.env.STT_PROVIDER ?? "auto") as SttProvider;

  if (provider !== "auto") {
    const keyMap: Record<string, string | undefined> = {
      groq: process.env.GROQ_API_KEY,
      openai: process.env.OPENAI_API_KEY,
      assemblyai: process.env.ASSEMBLYAI_API_KEY,
    };
    return keyMap[provider] ? provider : null;
  }

  // Auto-detect: cheapest first (Groq > AssemblyAI > OpenAI)
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.ASSEMBLYAI_API_KEY) return "assemblyai";
  if (process.env.OPENAI_API_KEY) return "openai";
  return null;
}

export async function transcribeAudio(
  buffer: Buffer,
  filename: string
): Promise<TranscriptionResult> {
  const provider = getSttProvider();
  if (!provider) {
    throw new Error(
      "No STT provider configured. Set GROQ_API_KEY, OPENAI_API_KEY, or ASSEMBLYAI_API_KEY."
    );
  }

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
  const apiKey = process.env.OPENAI_API_KEY!;
  const model = process.env.OPENAI_STT_MODEL ?? "gpt-4o-mini-transcribe";

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
    const errorText = await response.text();
    throw new Error(`OpenAI Whisper error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as { text: string };
  return { text: data.text, provider: "openai" };
}

async function transcribeWithGroq(
  buffer: Buffer,
  filename: string
): Promise<TranscriptionResult> {
  const apiKey = process.env.GROQ_API_KEY!;
  const model = process.env.GROQ_STT_MODEL ?? "whisper-large-v3-turbo";

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
    const errorText = await response.text();
    throw new Error(`Groq Whisper error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as { text: string };
  return { text: data.text, provider: "groq" };
}

async function transcribeWithAssemblyAI(
  buffer: Buffer
): Promise<TranscriptionResult> {
  const apiKey = process.env.ASSEMBLYAI_API_KEY!;

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
    throw new Error(`AssemblyAI upload error: ${uploadResp.status}`);
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
    throw new Error(`AssemblyAI transcript error: ${transcriptResp.status}`);
  }

  const { id } = (await transcriptResp.json()) as { id: string };

  // Step 3: Poll for completion (max 60s)
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const pollResp = await fetch(
      `https://api.assemblyai.com/v2/transcript/${id}`,
      { headers: { Authorization: apiKey } }
    );

    const result = (await pollResp.json()) as {
      status: string;
      text?: string;
      error?: string;
    };

    if (result.status === "completed") {
      return { text: result.text ?? "", provider: "assemblyai" };
    }
    if (result.status === "error") {
      throw new Error(`AssemblyAI error: ${result.error}`);
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  throw new Error("AssemblyAI transcription timed out (60s)");
}
