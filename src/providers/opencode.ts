import {
  createOpencode,
  createOpencodeClient,
  type OpencodeClient,
} from "@opencode-ai/sdk";
import type {
  Provider,
  Session,
  SessionInfo,
  PromptOptions,
  PromptResult,
  StreamChunk,
  Todo,
  FileDiff,
  SearchResult,
  FileStatus,
  FileNode,
  ProjectInfo,
  CommandInfo,
  ToolInfo,
  HealthInfo,
  ModelDetail,
  McpServerConfig,
  McpServerStatus,
} from "./types.js";
import type { Event as OcEvent } from "@opencode-ai/sdk";
import { getConfig } from "../config/index.js";
import { providerLogger } from "../utils/logger.js";

let client: OpencodeClient;
let serverClose: (() => void) | undefined;

export class OpenCodeProvider implements Provider {
  readonly name = "opencode" as const;

  async init(): Promise<void> {
    const config = getConfig();
    const mode = config.opencodeMode;

    if (mode === "connect") {
      const baseUrl = config.opencodeUrl;
      providerLogger.info({ mode, baseUrl }, "Initializing provider");
      try {
        const url = new URL(baseUrl);
        if (
          url.protocol === "http:" &&
          !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
        ) {
          providerLogger.warn(
            "Connecting to remote OpenCode server over HTTP (unencrypted). Use HTTPS for production."
          );
        }
      } catch {
        // Invalid URL — will fail on createOpencodeClient
      }
      client = createOpencodeClient({ baseUrl });
    } else {
      const hostname = config.opencodeHostname;
      const port = config.opencodePort;
      providerLogger.info({ mode, hostname, port }, "Initializing provider");
      const result = await createOpencode({ hostname, port });
      client = result.client;
      serverClose = result.server.close;
    }
  }

  shutdown(): void {
    providerLogger.info("Shutting down provider");
    serverClose?.();
  }

  // --- Sessions ---

  async createSession(title?: string): Promise<Session> {
    providerLogger.info({ title: title ?? "Telegram Session" }, "Creating session");
    const result = await client.session.create({
      body: { title: title ?? "Telegram Session" },
    });
    if (result.error) throw sdkError(result.error);
    if (result.data) {
      providerLogger.info({ sessionId: result.data.id }, "Session created");
      return { id: result.data.id, title: result.data.title };
    }
    throw new Error("Failed to create session");
  }

  async listSessions(): Promise<SessionInfo[]> {
    const result = await client.session.list();
    if (result.error) throw sdkError(result.error);
    return ((result.data ?? []) as any[]).map((s: any) => ({
      id: s.id,
      title: s.title,
      lastModified: s.time?.updated,
    }));
  }

  async getSession(id: string): Promise<Session | null> {
    const result = await client.session.get({ path: { id } });
    if (result.error) return null;
    const s = result.data as any;
    return { id: s.id, title: s.title };
  }

  async deleteSession(id: string): Promise<boolean> {
    providerLogger.info({ sessionId: id }, "Deleting session");
    try {
      await client.session.delete({ path: { id } });
      providerLogger.info({ sessionId: id }, "Session deleted");
      return true;
    } catch (err: any) {
      providerLogger.info({ sessionId: id, err: err?.message }, "Session delete failed");
      return false;
    }
  }

  async renameSession(id: string, title: string): Promise<boolean> {
    try {
      await client.session.update({ path: { id }, body: { title } });
      return true;
    } catch {
      return false;
    }
  }

  async getSessionStatuses(): Promise<Record<string, string>> {
    try {
      const result = await client.session.status();
      if (result.error) return {};
      const data = result.data as Record<string, any> | undefined;
      if (!data) return {};
      const statuses: Record<string, string> = {};
      for (const [id, status] of Object.entries(data)) {
        statuses[id] = status?.type ?? "unknown";
      }
      return statuses;
    } catch {
      return {};
    }
  }

  // --- Messaging ---

  async prompt(
    sessionId: string,
    text: string,
    options?: PromptOptions
  ): Promise<PromptResult> {
    const startMs = Date.now();
    providerLogger.info(
      { sessionId, textLen: text.length, model: options?.model, agent: options?.agent },
      "Starting prompt"
    );

    const body: any = {
      parts: options?.parts ?? [{ type: "text", text }],
    };
    if (options?.model) body.model = options.model;
    if (options?.system) body.system = options.system;
    if (options?.agent) body.agent = options.agent;

    const result = await client.session.prompt({
      path: { id: sessionId },
      body,
    });

    if (result.error) throw sdkError(result.error);

    const responseText = formatPartsToText(result.data?.parts ?? []);
    providerLogger.info(
      { sessionId, durationMs: Date.now() - startMs, responseLen: responseText.length },
      "Prompt completed"
    );

    return {
      text: responseText,
      parts: result.data?.parts,
      raw: result.data,
    };
  }

  async abort(sessionId: string): Promise<void> {
    providerLogger.info({ sessionId }, "Aborting session");
    await client.session.abort({ path: { id: sessionId } });
  }

  // --- Streaming ---

  async *promptStream(
    sessionId: string,
    text: string,
    options?: PromptOptions
  ): AsyncGenerator<StreamChunk> {
    const startMs = Date.now();
    providerLogger.info(
      { sessionId, textLen: text.length, model: options?.model, agent: options?.agent },
      "Starting streaming prompt"
    );

    const body: any = {
      parts: options?.parts ?? [{ type: "text", text }],
    };
    if (options?.model) body.model = options.model;
    if (options?.system) body.system = options.system;
    if (options?.agent) body.agent = options.agent;

    await client.session.promptAsync({
      path: { id: sessionId },
      body,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    const sseResult = await client.event.subscribe();
    providerLogger.info({ sessionId }, "SSE subscription opened");

    let chunkCount = 0;
    let toolEvents = 0;

    try {
      for await (const event of sseResult.stream) {
        if (controller.signal.aborted) break;
        const evt = event as OcEvent;
        if (!matchesSession(evt, sessionId)) continue;

        if (evt.type === "message.part.updated") {
          const { part, delta } = evt.properties;
          if (part.type === "text") {
            if (delta) {
              chunkCount++;
              yield { type: "text", content: delta };
            }
          } else if (part.type === "file") {
            yield {
              type: "file" as const,
              content: part.filename ?? "file",
              file: { mime: part.mime, filename: part.filename ?? "file", url: part.url },
            };
          } else if (part.type === "reasoning") {
            if (delta) {
              yield { type: "reasoning", content: delta };
            }
          } else if (part.type === "tool") {
            toolEvents++;
            const toolName = part.tool;
            if (part.state.status === "running") {
              yield { type: "tool_use", content: `[${part.state.title || toolName}...]` };
            } else if (part.state.status === "completed") {
              yield { type: "tool_use", content: `[${part.state.title || toolName} done]` };
            } else if (part.state.status === "error") {
              yield { type: "tool_use", content: `[${toolName} error]` };
            }
          }
        } else if (evt.type === "session.idle") {
          yield { type: "done", content: "" };
          break;
        } else if (evt.type === "session.error") {
          const rawError = (evt.properties as any).error ?? "Unknown session error";
          throw new Error(rawError);
        }
      }
    } finally {
      clearTimeout(timeout);
      providerLogger.info(
        { sessionId, durationMs: Date.now() - startMs, chunkCount, toolEvents },
        "Stream completed"
      );
      try { sseResult.stream?.return?.(undefined as any); } catch {}
    }
  }

  // --- Session features ---

  async getTodos(sessionId: string): Promise<Todo[] | null> {
    const result = await client.session.todo({ path: { id: sessionId } });
    if (result.error) throw sdkError(result.error);
    return ((result.data ?? []) as any[]).map((t: any) => ({
      content: t.content,
      status: t.status,
      priority: t.priority,
      id: t.id,
    }));
  }

  async getDiff(sessionId: string): Promise<FileDiff[] | null> {
    const result = await client.session.diff({ path: { id: sessionId } });
    if (result.error) throw sdkError(result.error);
    return ((result.data ?? []) as any[]).map((d: any) => ({
      file: d.file,
      additions: d.additions ?? 0,
      deletions: d.deletions ?? 0,
      before: d.before,
      after: d.after,
    }));
  }

  async forkSession(
    sessionId: string,
    messageId?: string
  ): Promise<Session | null> {
    const result = await client.session.fork({
      path: { id: sessionId },
      body: { messageID: messageId },
    });
    if (result.error) throw sdkError(result.error);
    const forked = result.data as any;
    return { id: forked.id, title: forked.title };
  }

  async revert(sessionId: string): Promise<boolean> {
    // Get last assistant message ID
    const msgsResult = await client.session.messages({
      path: { id: sessionId },
    });
    const messages = msgsResult.data ?? [];
    const lastAssistant = [...messages]
      .reverse()
      .find((m: any) => m.info?.role === "assistant");
    if (!lastAssistant) return false;

    const messageID = (lastAssistant as any).info?.id;
    if (!messageID) return false;

    const result = await client.session.revert({
      path: { id: sessionId },
      body: { messageID },
    });
    if (result.error) throw sdkError(result.error);
    return true;
  }

  async unrevert(sessionId: string): Promise<boolean> {
    try {
      await client.session.unrevert({ path: { id: sessionId } });
      return true;
    } catch {
      return false;
    }
  }

  async share(sessionId: string): Promise<string | null> {
    const result = await client.session.share({
      path: { id: sessionId },
    });
    if (result.error) throw sdkError(result.error);
    return (result.data as any)?.share?.url ?? null;
  }

  async unshare(sessionId: string): Promise<boolean> {
    try {
      await client.session.unshare({ path: { id: sessionId } });
      return true;
    } catch {
      return false;
    }
  }

  async summarize(sessionId: string): Promise<boolean> {
    try {
      await client.session.summarize({ path: { id: sessionId } });
      return true;
    } catch {
      return false;
    }
  }

  async getHistory(sessionId: string): Promise<unknown[] | null> {
    const result = await client.session.messages({
      path: { id: sessionId },
    });
    if (result.error) throw sdkError(result.error);
    return result.data ?? [];
  }

  // --- File operations ---

  async readFile(path: string): Promise<string | null> {
    const result = await client.file.read({ query: { path } });
    if (result.error) throw sdkError(result.error);
    const fileData = result.data as any;
    return fileData?.content ?? JSON.stringify(fileData, null, 2);
  }

  async listFiles(path: string): Promise<FileNode[] | null> {
    try {
      const result = await client.file.list({ query: { path } });
      if (result.error) return null;
      return ((result.data ?? []) as any[]).map((f: any) => ({
        name: f.name,
        path: f.path,
        type: f.type === "directory" ? "directory" : "file",
        ignored: f.ignored ?? false,
      }));
    } catch {
      return null;
    }
  }

  async findFiles(query: string): Promise<string[] | null> {
    const result = await client.find.files({ query: { query } });
    if (result.error) throw sdkError(result.error);
    return (result.data ?? []) as string[];
  }

  async searchText(pattern: string): Promise<SearchResult[] | null> {
    const result = await client.find.text({ query: { pattern } } as any);
    if (result.error) throw sdkError(result.error);
    return ((result.data ?? []) as any[]).map((m: any) => ({
      file: m.path?.text ?? "",
      line: m.line_number,
      text: m.lines?.text?.trim(),
    }));
  }

  async findSymbols(query: string): Promise<unknown[] | null> {
    const result = await client.find.symbols({ query: { query } });
    if (result.error) throw sdkError(result.error);
    return result.data ?? [];
  }

  async getFileStatus(): Promise<FileStatus[] | null> {
    const result = await client.file.status();
    if (result.error) throw sdkError(result.error);
    return ((result.data ?? []) as any[]).map((f: any) => ({
      path: f.path ?? String(f),
      status: f.status ?? "?",
    }));
  }

  // --- Shell ---

  async shell(sessionId: string, command: string): Promise<string | null> {
    providerLogger.info({ sessionId, command }, "Executing shell command");
    const result = await client.session.shell({
      path: { id: sessionId },
      body: { command, agent: "default" },
    });
    if (result.error) throw sdkError(result.error);
    const data = result.data as any;
    const output = data?.output ?? data?.result ?? data?.text;
    const resultStr = output ? String(output) : (data?.modelID
      ? `Shell command completed (model: ${data.modelID}).`
      : "Shell command completed.");
    providerLogger.info({ sessionId, resultLen: resultStr.length }, "Shell command completed");
    return resultStr;
  }

  async runCommand(
    sessionId: string,
    command: string,
    args?: string
  ): Promise<PromptResult | null> {
    const result = await client.session.command({
      path: { id: sessionId },
      body: { command, arguments: args ?? "", agent: "build" },
    });
    if (result.error) throw sdkError(result.error);
    return {
      text: formatPartsToText(result.data?.parts ?? []),
      parts: result.data?.parts,
      raw: result.data,
    };
  }

  // --- Info ---

  async getProjectInfo(): Promise<ProjectInfo | null> {
    const [projResult, pathResult, vcsResult] = await Promise.all([
      client.project.current(),
      client.path.get(),
      client.vcs.get(),
    ]);
    if (projResult.error) throw sdkError(projResult.error);

    const proj = projResult.data as any;
    const paths = pathResult.data as any;
    const vcs = vcsResult.data as any;

    return {
      id: proj?.id,
      worktree: proj?.worktree,
      directory: paths?.directory,
      vcs: proj?.vcs,
      branch: vcs?.branch,
    };
  }

  async getTools(): Promise<ToolInfo[] | null> {
    // Try tool.list with current model for descriptions; fall back to tool.ids
    const config = getConfig();
    const envModel = config.opencodeModel;
    if (envModel && envModel.includes("/")) {
      const [providerID, ...rest] = envModel.split("/");
      try {
        const result = await client.tool.list({
          query: { provider: providerID, model: rest.join("/") },
        });
        if (!result.error && result.data) {
          return ((result.data ?? []) as any[]).map((t: any) => ({
            id: t.id ?? t.name ?? String(t),
            description: t.description,
          }));
        }
      } catch {
        // Fall through to tool.ids
      }
    }

    // Fallback: tool IDs without descriptions
    const result = await client.tool.ids();
    if (result.error) throw sdkError(result.error);
    return ((result.data ?? []) as string[]).map((id) => ({ id }));
  }

  async getCommands(): Promise<CommandInfo[] | null> {
    const result = await client.command.list();
    if (result.error) throw sdkError(result.error);
    return ((result.data ?? []) as any[]).map((c: any) => ({
      name: c.name,
      description: c.description,
    }));
  }

  async getHealth(): Promise<HealthInfo> {
    const [configResult, projResult, vcsResult] = await Promise.all([
      client.config.get(),
      client.project.current(),
      client.vcs.get(),
    ]);

    const proj = projResult.data as any;
    const vcs = vcsResult.data as any;

    return {
      status: configResult.error ? "Error" : "Healthy",
      provider: "opencode",
      project: proj?.worktree,
      branch: vcs?.branch,
    };
  }

  async getConfig(): Promise<unknown> {
    const result = await client.config.get();
    if (result.error) throw sdkError(result.error);
    return result.data;
  }

  async getProviders(): Promise<unknown> {
    const result = await client.config.providers();
    if (result.error) throw sdkError(result.error);
    return result.data;
  }

  async getAgents(): Promise<unknown[] | null> {
    const result = await client.app.agents();
    if (result.error) throw sdkError(result.error);
    const agents = result.data ?? [];
    return Array.isArray(agents) ? agents : [];
  }

  // --- Models ---

  async listModels(): Promise<ModelDetail[]> {
    const result = await client.config.providers();
    if (result.error) throw sdkError(result.error);

    const data = result.data as any;
    const providers: any[] = data?.all ?? data?.providers ?? [];
    const models: ModelDetail[] = [];

    for (const prov of providers) {
      if (!prov.models) continue;
      for (const [key, m] of Object.entries(prov.models) as [string, any][]) {
        const cost = m.cost;
        const isFree = cost != null && cost.input === 0 && cost.output === 0;
        models.push({
          id: m.id ?? key,
          name: m.name ?? key,
          provider: prov.id ?? prov.name ?? "unknown",
          reasoning: m.reasoning ?? m.capabilities?.reasoning ?? false,
          attachment: m.attachment ?? m.capabilities?.attachment ?? false,
          free: isFree,
          modalities: m.modalities,
          active: false, // Caller checks against selected model
        });
      }
    }

    return models;
  }

  // --- MCP ---

  async getMcpStatus(): Promise<McpServerStatus[] | null> {
    const result = await client.mcp.status();
    if (result.error) throw sdkError(result.error);

    const data = result.data as Record<string, any> | undefined;
    if (!data) return [];

    return Object.entries(data).map(([name, status]) => {
      let statusStr: McpServerStatus["status"] = "unknown";
      if (status?.status === "connected") statusStr = "connected";
      else if (status?.status === "disabled") statusStr = "disabled";
      else if (status?.status === "failed") statusStr = "failed";
      else if (status?.status === "needs_auth") statusStr = "needs_auth";

      return {
        name,
        status: statusStr,
        error: status?.error,
      };
    });
  }

  async addMcpServer(name: string, config: McpServerConfig): Promise<boolean> {
    const sdkConfig: any = config.type === "local"
      ? { type: "local", command: config.command ?? [], environment: config.environment, enabled: config.enabled ?? true, timeout: config.timeout }
      : { type: "remote", url: config.url ?? "", headers: config.headers, enabled: config.enabled ?? true, timeout: config.timeout };

    const result = await client.mcp.add({ body: { name, config: sdkConfig } });
    if (result.error) throw sdkError(result.error);
    return true;
  }

  async removeMcpServer(name: string): Promise<boolean> {
    try {
      await client.mcp.disconnect({ path: { name } });
      return true;
    } catch {
      return false;
    }
  }

  async connectMcpServer(name: string): Promise<boolean> {
    try {
      await client.mcp.connect({ path: { name } });
      return true;
    } catch {
      return false;
    }
  }
}

// --- Helpers ---

function sdkError(error: any): Error {
  if (typeof error === "string") return new Error(error);
  if (error?.message) return new Error(error.message);
  return new Error(JSON.stringify(error));
}

function matchesSession(evt: OcEvent, sessionId: string): boolean {
  const props = evt.properties as any;
  return props?.sessionID === sessionId || props?.session_id === sessionId;
}

function formatPartsToText(parts: any[]): string {
  const sections: string[] = [];
  for (const part of parts) {
    if (part.type === "text") {
      sections.push(part.text);
    } else if (part.type === "tool") {
      const toolName = part.tool;
      if (part.state?.status === "completed") {
        const output = part.state.output;
        const title = part.state.title || toolName;
        if (output && output.length > 0) {
          sections.push(
            `**[${title}]**\n\`\`\`\n${output.length > 1000 ? output.slice(0, 1000) + "\n... (truncated)" : output}\n\`\`\``
          );
        } else {
          sections.push(`**[${title}]** ✓`);
        }
      } else if (part.state?.status === "error") {
        sections.push(`**[${toolName}]** Error: ${part.state.error}`);
      }
    } else if (part.type === "file") {
      sections.push(`📄 ${part.filename ?? "file"}`);
    }
  }
  return sections.join("\n\n") || "(empty response)";
}
