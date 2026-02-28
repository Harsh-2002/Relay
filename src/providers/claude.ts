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
  ModelDetail,
  McpServerConfig,
  McpServerStatus,
} from "./types.js";
import { JsonStore } from "../utils/store.js";
import { getConfig } from "../config/index.js";

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
    diff: true,
    fork: true,
    revert: false,
    share: false,
    summarize: false,
    history: true,
    fileOps: true,
    shell: true,
    commands: false,
    fileOutput: false,
    mcp: true,
  };
  private model: string;
  private permissionMode: string;
  private cwd: string;
  private mcpServers = new Map<string, any>();
  private mcpStore = new JsonStore<Record<string, any>>("claude-mcp.json", {});

  constructor() {
    const config = getConfig();
    this.model = config.claudeModel;
    this.permissionMode = config.claudePermissionMode;
    this.cwd = config.claudeCwd || process.cwd();
  }

  async init(): Promise<void> {
    try {
      const sdk = await import("@anthropic-ai/claude-code");
      queryFn = sdk.query;
      listSessionsFn = sdk.listSessions;
    } catch {
      throw new Error(
        "Claude Code SDK is not installed.\n\n" +
          "  Install it with:\n\n" +
          "    npm install @anthropic-ai/claude-code\n"
      );
    }

    // Load persisted MCP configs
    const saved = this.mcpStore.load();
    for (const [name, config] of Object.entries(saved)) {
      this.mcpServers.set(name, config);
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
    const sessions = await this.listSessions();
    const found = sessions.find((s) => s.id === id);
    return found ? { id: found.id, title: found.title } : null;
  }

  async deleteSession(_id: string): Promise<boolean> {
    // SDK doesn't expose a direct delete — acknowledge locally
    return true;
  }

  // --- Messaging ---

  private buildQueryOpts(sessionId: string, options?: PromptOptions): any {
    const queryOpts: any = {
      model: options?.model?.modelID ?? this.model,
      permissionMode: this.permissionMode,
      cwd: this.cwd,
      resume: sessionId,
    };
    if (options?.system) {
      queryOpts.systemPrompt = options.system;
    }
    if (this.mcpServers.size > 0) {
      queryOpts.mcpServers = Object.fromEntries(this.mcpServers);
    }
    return queryOpts;
  }

  async prompt(
    sessionId: string,
    text: string,
    options?: PromptOptions
  ): Promise<PromptResult> {
    let resultText = "";

    const queryOpts = this.buildQueryOpts(sessionId, options);

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
    const queryOpts = this.buildQueryOpts(sessionId, options);

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

  // --- Session features ---

  async getTodos(): Promise<Todo[] | null> {
    return null;
  }

  async getDiff(sessionId: string): Promise<FileDiff[] | null> {
    try {
      const result = await this.delegatePrompt(
        sessionId,
        "Run `git diff` and return the output. Show the raw diff output only, no commentary."
      );
      if (!result) return null;
      return [{ file: "(git diff)", additions: 0, deletions: 0, after: result }];
    } catch {
      return null;
    }
  }

  async forkSession(
    sessionId: string,
  ): Promise<Session | null> {
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
    return false;
  }

  async unrevert(): Promise<boolean> {
    return false;
  }

  async share(): Promise<string | null> {
    return null;
  }

  async summarize(): Promise<boolean> {
    return false;
  }

  async getHistory(sessionId: string): Promise<unknown[] | null> {
    try {
      const history: unknown[] = [];

      const messages = queryFn({
        prompt: "",
        options: {
          model: this.model,
          permissionMode: this.permissionMode,
          cwd: this.cwd,
          resume: sessionId,
          maxTurns: 0,
        },
      });

      for await (const msg of messages) {
        if (msg.type === "assistant" || msg.type === "user") {
          history.push(msg);
        }
      }

      return history.length > 0 ? history : null;
    } catch {
      return null;
    }
  }

  // --- File operations (via prompt delegation) ---

  /**
   * Delegate a task to Claude with maxTurns: 1 and extract the text result.
   */
  private async delegatePrompt(sessionId: string, instruction: string): Promise<string | null> {
    let resultText = "";

    const messages = queryFn({
      prompt: instruction,
      options: {
        model: this.model,
        permissionMode: this.permissionMode,
        cwd: this.cwd,
        resume: sessionId,
        maxTurns: 1,
      },
    });

    try {
      for await (const msg of messages) {
        if (msg.type === "assistant" && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === "text") resultText += block.text;
          }
        } else if (msg.type === "result") {
          if (msg.result) resultText = msg.result;
        }
      }
    } catch {
      return null;
    }

    return resultText || null;
  }

  async readFile(path: string): Promise<string | null> {
    const sessionId = `claude-fileop-${Date.now()}`;
    return this.delegatePrompt(
      sessionId,
      `Read the file at "${path}" and return its contents verbatim. Output ONLY the file content, nothing else.`
    );
  }

  async findFiles(query: string): Promise<string[] | null> {
    const sessionId = `claude-fileop-${Date.now()}`;
    const result = await this.delegatePrompt(
      sessionId,
      `Find files matching the pattern "${query}" using Glob. List each matching file path on its own line. Output ONLY the file paths, nothing else.`
    );
    if (!result) return null;
    return result.split("\n").map((l) => l.trim()).filter(Boolean);
  }

  async searchText(pattern: string): Promise<SearchResult[] | null> {
    const sessionId = `claude-fileop-${Date.now()}`;
    const result = await this.delegatePrompt(
      sessionId,
      `Search the codebase for the pattern "${pattern}" using Grep. For each match, output the file path, line number, and matching text separated by colons (file:line:text). Output ONLY the matches, nothing else.`
    );
    if (!result) return null;
    return result
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const [file, lineStr, ...rest] = line.split(":");
        return { file: file ?? line, line: Number(lineStr) || undefined, text: rest.join(":") || undefined };
      });
  }

  async findSymbols(): Promise<unknown[] | null> {
    return null;
  }

  async getFileStatus(): Promise<FileStatus[] | null> {
    const sessionId = `claude-fileop-${Date.now()}`;
    const result = await this.delegatePrompt(
      sessionId,
      `Run "git status --porcelain" and return the output. Output ONLY the raw git status output, nothing else.`
    );
    if (!result) return null;
    return result
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const status = line.slice(0, 2).trim();
        const path = line.slice(3).trim();
        return { path, status };
      });
  }

  // --- Shell ---

  async shell(sessionId: string, command: string): Promise<string | null> {
    const result = await this.prompt(
      sessionId,
      `Run this shell command and show the output: ${command}`
    );
    return result.text;
  }

  async runCommand(): Promise<PromptResult | null> {
    return null;
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
    return null;
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

  // --- Models ---

  async listModels(): Promise<ModelDetail[]> {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (apiKey) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
        });

        if (res.ok) {
          const body = await res.json() as any;
          const models: ModelDetail[] = (body.data ?? []).map((m: any) => ({
            id: m.id,
            name: m.display_name ?? m.id,
            provider: "anthropic",
            reasoning: /opus|sonnet-4/i.test(m.id),
            attachment: false,
            active: this.model === m.id,
          }));

          if (models.length > 0) return models;
        }
      } catch {
        // API unavailable — return empty list
      }
    }

    return [];
  }

  // --- MCP ---

  async getMcpStatus(): Promise<McpServerStatus[] | null> {
    return Array.from(this.mcpServers.entries()).map(([name]) => ({
      name,
      status: "connected" as const,
    }));
  }

  async addMcpServer(name: string, config: McpServerConfig): Promise<boolean> {
    if (config.type === "local") {
      this.mcpServers.set(name, {
        command: config.command?.[0] ?? "",
        args: config.command?.slice(1) ?? [],
        env: config.environment ?? {},
      });
    } else {
      this.mcpServers.set(name, {
        url: config.url ?? "",
        headers: config.headers ?? {},
      });
    }
    this.persistMcp();
    return true;
  }

  async removeMcpServer(name: string): Promise<boolean> {
    const deleted = this.mcpServers.delete(name);
    if (deleted) this.persistMcp();
    return deleted;
  }

  private persistMcp(): void {
    this.mcpStore.save(Object.fromEntries(this.mcpServers));
  }
}
