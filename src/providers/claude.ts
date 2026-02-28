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
  ProjectInfo,
  CommandInfo,
  HealthInfo,
} from "./types.js";

// Dynamic import — only loads when PROVIDER=claude
let queryFn: any;
let listSessionsFn: any;
let activeQuery: any = null;

export class ClaudeProvider implements Provider {
  readonly name = "claude" as const;
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
    if (activeQuery) {
      try {
        activeQuery.abort?.();
      } catch {
        // ignore
      }
      activeQuery = null;
    }
  }

  // --- Sessions ---

  async createSession(title?: string): Promise<Session> {
    // Claude creates sessions implicitly on first query.
    // We send a minimal prompt to get a session_id back.
    let sessionId: string | undefined;

    const messages = queryFn({
      prompt: title
        ? `Session started: ${title}. Acknowledge briefly.`
        : "New session started. Acknowledge briefly.",
      options: {
        model: this.model,
        permissionMode: this.permissionMode,
        cwd: this.cwd,
        maxTurns: 1,
      },
    });

    for await (const msg of messages) {
      if (msg.type === "system" && msg.session_id) {
        sessionId = msg.session_id;
      }
    }

    if (!sessionId) {
      throw new Error("Failed to create Claude session (no session_id received)");
    }

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

    activeQuery = messages;

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
      activeQuery = null;
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

    activeQuery = messages;

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
      activeQuery = null;
    }
  }

  async abort(): Promise<void> {
    if (activeQuery) {
      try {
        activeQuery.abort?.();
      } catch {
        // ignore
      }
      activeQuery = null;
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

  async getHistory(): Promise<any[] | null> {
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

  async findSymbols(): Promise<any[] | null> {
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

  async getConfig(): Promise<any> {
    return {
      provider: "claude",
      model: this.model,
      permissionMode: this.permissionMode,
      cwd: this.cwd,
    };
  }

  async getProviders(): Promise<any> {
    return { anthropic: { models: [this.model] } };
  }

  async getAgents(): Promise<any[] | null> {
    return null;
  }
}
