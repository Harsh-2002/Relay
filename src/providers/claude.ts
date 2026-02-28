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

// Dynamic import — only loads when PROVIDER=claude
let queryFn: any;
let listSessionsFn: any;
// Per-session active query tracking (keyed by session ID)
const activeQueries = new Map<string, any>();

export class ClaudeProvider implements Provider {
  readonly name = "claude" as const;
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    todos: false,
    diff: false,
    fork: true,
    revert: false,
    share: false,
    summarize: false,
    history: false,
    fileOps: false,
    shell: true,
    commands: false,
  };
  private model: string;
  private permissionMode: string;
  private cwd: string;

  constructor() {
    this.model = process.env.CLAUDE_MODEL ?? "sonnet";
    this.permissionMode = process.env.CLAUDE_PERMISSION_MODE ?? "acceptEdits";
    this.cwd = process.env.CLAUDE_CWD ?? process.cwd();
  }

  async init(): Promise<void> {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY is required for Claude provider. Set it in your environment."
      );
    }

    try {
      const sdk = await import("@anthropic-ai/claude-code");
      queryFn = sdk.query;
      listSessionsFn = sdk.listSessions;
    } catch (err: any) {
      throw new Error(
        `Failed to load @anthropic-ai/claude-code: ${err.message}\n` +
          `Install it: bun add @anthropic-ai/claude-code`
      );
    }
  }

  shutdown(): void {
    for (const query of activeQueries.values()) {
      try { query.abort?.(); } catch {}
    }
    activeQueries.clear();
  }

  // --- Sessions ---

  async createSession(title?: string): Promise<Session> {
    // Generate a local ID. Claude will create the actual session
    // implicitly on the first prompt() call via the resume option.
    const sessionId = `claude-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return { id: sessionId, title: title ?? "Claude Session" };
  }

  async listSessions(): Promise<SessionInfo[]> {
    if (!listSessionsFn) return [];
    try {
      const sessions = await listSessionsFn();
      return (sessions ?? []).map((s: any) => ({
        id: s.sessionId ?? s.id,
        title: s.title ?? s.sessionId ?? s.id,
        lastModified: s.timestamp ? new Date(s.timestamp).getTime() : undefined,
      }));
    } catch {
      return [];
    }
  }

  async getSession(id: string): Promise<Session | null> {
    // Claude doesn't have a direct "get session" API.
    // Check if it exists in the sessions list.
    const sessions = await this.listSessions();
    const found = sessions.find((s) => s.id === id);
    return found ? { id: found.id, title: found.title } : null;
  }

  async deleteSession(): Promise<boolean> {
    // Claude doesn't support session deletion
    return false;
  }

  // --- Messaging ---

  async prompt(
    sessionId: string,
    text: string,
    options?: PromptOptions
  ): Promise<PromptResult> {
    let resultText = "";
    const toolResults: any[] = [];

    const queryOpts: any = {
      model: options?.model?.modelID ?? this.model,
      permissionMode: this.permissionMode,
      cwd: this.cwd,
      resume: sessionId,
    };
    if (options?.system) {
      queryOpts.systemPrompt = options.system;
    }

    const messages = queryFn({
      prompt: text,
      options: queryOpts,
    });

    activeQueries.set(sessionId, messages);

    try {
      for await (const msg of messages) {
        if (msg.type === "assistant" && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === "text") {
              resultText += block.text;
            }
          }
        } else if (msg.type === "result") {
          if (msg.result) resultText = msg.result;
        }
      }
    } finally {
      activeQueries.delete(sessionId);
    }

    return { text: resultText || "(empty response)" };
  }

  async *promptStream(
    sessionId: string,
    text: string,
    options?: PromptOptions
  ): AsyncGenerator<StreamChunk> {
    const queryOpts: any = {
      model: options?.model?.modelID ?? this.model,
      permissionMode: this.permissionMode,
      cwd: this.cwd,
      resume: sessionId,
    };
    if (options?.system) {
      queryOpts.systemPrompt = options.system;
    }

    const messages = queryFn({
      prompt: text,
      options: queryOpts,
    });

    activeQueries.set(sessionId, messages);

    try {
      for await (const msg of messages) {
        if (msg.type === "assistant" && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === "text") {
              yield { type: "text", content: block.text };
            } else if (block.type === "tool_use") {
              yield {
                type: "tool_use",
                content: `[${block.name}]`,
              };
            }
          }
        } else if (msg.type === "result") {
          if (msg.result) {
            yield { type: "text", content: msg.result };
          }
          yield { type: "done", content: "" };
        }
      }
    } finally {
      activeQueries.delete(sessionId);
    }
  }

  async abort(sessionId: string): Promise<void> {
    const query = activeQueries.get(sessionId);
    if (query) {
      try { query.abort?.(); } catch {}
      activeQueries.delete(sessionId);
    }
  }

  // --- Session features (limited support) ---

  async getTodos(): Promise<Todo[] | null> {
    return null; // Not supported
  }

  async getDiff(): Promise<FileDiff[] | null> {
    return null; // Not supported
  }

  async forkSession(
    sessionId: string,
  ): Promise<Session | null> {
    // Claude supports forking via forkSession option
    try {
      let newSessionId: string | undefined;

      const messages = queryFn({
        prompt: "Session forked. Acknowledge briefly.",
        options: {
          model: this.model,
          permissionMode: this.permissionMode,
          cwd: this.cwd,
          resume: sessionId,
          forkSession: true,
          maxTurns: 1,
        },
      });

      for await (const msg of messages) {
        if (msg.type === "system" && msg.session_id) {
          newSessionId = msg.session_id;
        }
      }

      if (newSessionId) {
        return { id: newSessionId, title: "Forked Session" };
      }
    } catch {
      // Fall through
    }
    return null;
  }

  async revert(): Promise<boolean> {
    return false; // Not directly supported via simple API
  }

  async unrevert(): Promise<boolean> {
    return false; // Not supported
  }

  async share(): Promise<string | null> {
    return null; // Not supported
  }

  async summarize(): Promise<boolean> {
    return false; // Not supported
  }

  async getHistory(): Promise<unknown[] | null> {
    return null; // Not directly supported
  }

  // --- File operations (routed through prompt) ---

  async readFile(path: string): Promise<string | null> {
    // Ask Claude to read the file using its built-in Read tool
    // This works because Claude has access to file system tools
    return null; // Not directly supported — commands handle this via prompt
  }

  async findFiles(): Promise<string[] | null> {
    return null; // Not directly supported
  }

  async searchText(): Promise<SearchResult[] | null> {
    return null; // Not directly supported
  }

  async findSymbols(): Promise<unknown[] | null> {
    return null; // Not directly supported
  }

  async getFileStatus(): Promise<FileStatus[] | null> {
    return null; // Not directly supported
  }

  // --- Shell ---

  async shell(sessionId: string, command: string): Promise<string | null> {
    // Route through prompt — Claude will use its Bash tool
    const result = await this.prompt(
      sessionId,
      `Run this shell command and show the output: ${command}`
    );
    return result.text;
  }

  async runCommand(): Promise<PromptResult | null> {
    return null; // Not supported (OpenCode-specific)
  }

  // --- Info ---

  async getProjectInfo(): Promise<ProjectInfo | null> {
    return {
      directory: this.cwd,
    };
  }

  async getTools(): Promise<string[] | null> {
    return [
      "Read", "Write", "Edit", "Bash", "Glob", "Grep",
      "WebSearch", "WebFetch", "NotebookEdit",
    ];
  }

  async getCommands(): Promise<CommandInfo[] | null> {
    return null; // Not directly accessible
  }

  async getHealth(): Promise<HealthInfo> {
    return {
      status: "Healthy",
      provider: "claude",
      model: this.model,
      extra: {
        permissionMode: this.permissionMode,
        cwd: this.cwd,
      },
    };
  }

  async getConfig(): Promise<unknown> {
    return {
      provider: "claude",
      model: this.model,
      permissionMode: this.permissionMode,
      cwd: this.cwd,
    };
  }

  async getProviders(): Promise<unknown> {
    return { anthropic: { models: [this.model] } };
  }

  async getAgents(): Promise<unknown[] | null> {
    return null;
  }
}
