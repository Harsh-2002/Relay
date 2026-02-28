import {
  createOpencode,
  createOpencodeClient,
  type OpencodeClient,
} from "@opencode-ai/sdk";
import type {
  Provider,
  ProviderCapabilities,
  Session,
  SessionInfo,
  PromptOptions,
  PromptResult,
  StreamChunk,
  Todo,
  FileDiff,
  SearchResult,
  FileStatus,
  ProjectInfo,
  CommandInfo,
  HealthInfo,
} from "./types.js";
import type { Event as OcEvent } from "@opencode-ai/sdk";

let client: OpencodeClient;
let serverClose: (() => void) | undefined;

export class OpenCodeProvider implements Provider {
  readonly name = "opencode" as const;
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    todos: true,
    diff: true,
    fork: true,
    revert: true,
    share: true,
    summarize: true,
    history: true,
    fileOps: true,
    shell: true,
    commands: true,
  };

  async init(): Promise<void> {
    const mode = process.env.OPENCODE_MODE ?? "start";

    if (mode === "connect") {
      const baseUrl = process.env.OPENCODE_URL ?? "http://localhost:4096";
      try {
        const url = new URL(baseUrl);
        if (
          url.protocol === "http:" &&
          !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
        ) {
          console.warn(
            "WARNING: Connecting to remote OpenCode server over HTTP (unencrypted). Use HTTPS for production."
          );
        }
      } catch {
        // Invalid URL — will fail on createOpencodeClient
      }
      client = createOpencodeClient({ baseUrl });
    } else {
      const hostname = process.env.OPENCODE_HOSTNAME ?? "127.0.0.1";
      const port = Number(process.env.OPENCODE_PORT) || 4096;
      const result = await createOpencode({ hostname, port });
      client = result.client;
      serverClose = result.server.close;
    }
  }

  shutdown(): void {
    serverClose?.();
  }

  // --- Sessions ---

  async createSession(title?: string): Promise<Session> {
    const result = await client.session.create({
      body: { title: title ?? "Telegram Session" },
    });
    if (result.data) {
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
    try {
      await client.session.delete({ path: { id } });
      return true;
    } catch {
      return false;
    }
  }

  // --- Messaging ---

  async prompt(
    sessionId: string,
    text: string,
    options?: PromptOptions
  ): Promise<PromptResult> {
    const body: any = {
      parts: options?.parts ?? [{ type: "text", text }],
    };
    if (options?.model) body.model = options.model;
    if (options?.system) body.system = options.system;

    const result = await client.session.prompt({
      path: { id: sessionId },
      body,
    });

    if (result.error) throw sdkError(result.error);

    return {
      text: formatPartsToText(result.data?.parts ?? []),
      parts: result.data?.parts,
      raw: result.data,
    };
  }

  async abort(sessionId: string): Promise<void> {
    await client.session.abort({ path: { id: sessionId } });
  }

  // --- Streaming ---

  async *promptStream(
    sessionId: string,
    text: string,
    options?: PromptOptions
  ): AsyncGenerator<StreamChunk> {
    const body: any = {
      parts: options?.parts ?? [{ type: "text", text }],
    };
    if (options?.model) body.model = options.model;
    if (options?.system) body.system = options.system;

    await client.session.promptAsync({
      path: { id: sessionId },
      body,
    });

    const sseResult = await client.event.subscribe();

    for await (const event of sseResult.stream) {
      const evt = event as OcEvent;
      if (!matchesSession(evt, sessionId)) continue;

      if (evt.type === "message.part.updated") {
        const { part, delta } = evt.properties;
        if (part.type === "text") {
          if (delta) {
            yield { type: "text", content: delta };
          }
        } else if (part.type === "tool") {
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
        yield { type: "text", content: `Error: ${rawError}` };
        yield { type: "done", content: "" };
        break;
      }
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
    const result = await client.session.shell({
      path: { id: sessionId },
      body: { command, agent: "default" },
    });
    if (result.error) throw sdkError(result.error);
    const data = result.data as any;
    return data?.modelID
      ? `Shell command completed (model: ${data.modelID}).`
      : "Shell command completed.";
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

  async getTools(): Promise<string[] | null> {
    const result = await client.tool.ids();
    if (result.error) throw sdkError(result.error);
    return (result.data ?? []) as string[];
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
