import { createOpencode, createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk";

let client: OpencodeClient;
let serverClose: (() => void) | undefined;

export async function initClient(): Promise<OpencodeClient> {
  const mode = process.env.OPENCODE_MODE ?? "start";

  if (mode === "connect") {
    const baseUrl = process.env.OPENCODE_URL ?? "http://localhost:4096";
    client = createOpencodeClient({ baseUrl });
  } else {
    const hostname = process.env.OPENCODE_HOSTNAME ?? "127.0.0.1";
    const port = Number(process.env.OPENCODE_PORT) || 4096;
    const result = await createOpencode({ hostname, port });
    client = result.client;
    serverClose = result.server.close;
  }

  return client;
}

export function getClient(): OpencodeClient {
  if (!client) throw new Error("OpenCode client not initialized. Call initClient() first.");
  return client;
}

export function shutdownServer(): void {
  serverClose?.();
}
