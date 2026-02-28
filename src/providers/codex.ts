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

// Dynamic import — only loads when PROVIDER=codex
let CodexClass: any;
let codexInstance: any;

// Per-session abort controllers (keyed by session ID)
const abortControllers = new Map<string, AbortController>();

// Map session IDs to thread objects (bounded to prevent memory leaks)
const threads = new Map<string, any>();
const MAX_THREADS = 500;

// Persist thread IDs so sessions survive restarts
const threadStore = new JsonStore<string[]>("codex-threads.json", []);

export class CodexProvider implements Provider {
  readonly name = "codex" as const;
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    todos: false,
    diff: true,
    fork: false,
    revert: false,
    share: false,
    summarize: false,
    history: false,
    fileOps: true,
    shell: true,
    commands: false,
    fileOutput: false,
    mcp: false,
  };
  private model: string;
  private cwd: string;

  constructor() {
    this.model = process.env.CODEX_MODEL ?? "o3";
    this.cwd = process.env.CODEX_CWD ?? process.cwd();
  }

  async init(): Promise<void> {
    if (!process.env.CODEX_API_KEY && !process.env.OPENAI_API_KEY) {
      throw new Error(
        "CODEX_API_KEY or OPENAI_API_KEY is required for Codex provider."
      );
    }

    try {
      const sdk = await import("@openai/codex");
      CodexClass = sdk.Codex ?? sdk.default;
      codexInstance = new CodexClass();
    } catch (err: any) {
      throw new Error(
        `Failed to load @openai/codex: ${err.message}\n` +
          `Install it: bun add @openai/codex`
      );
    }
  }

  shutdown(): void {
    for (const controller of abortControllers.values()) {
      controller.abort();
    }
    abortControllers.clear();
    threads.clear();
  }

  // --- Sessions ---

  async createSession(title?: string): Promise<Session> {
    const thread = await codexInstance.startThread({
      workingDirectory: this.cwd,
    });

    const threadId = thread.id ?? thread.threadId ?? `codex-${Date.now()}`;

    // Evict oldest entries if map exceeds limit
    if (threads.size >= MAX_THREADS) {
      const oldest = threads.keys().next().value;
      if (oldest) threads.delete(oldest);
    }
    threads.set(threadId, thread);
    this.persistThreadIds();

    return { id: threadId, title: title ?? "Codex Thread" };
  }

  async listSessions(): Promise<SessionInfo[]> {
    // Codex stores sessions on filesystem (~/.codex/sessions)
    // Try listing them via the SDK if available
    try {
      if (codexInstance.listThreads) {
        const threadList = await codexInstance.listThreads();
        return (threadList ?? []).map((t: any) => ({
          id: t.id ?? t.threadId,
          title: t.title ?? t.id ?? t.threadId,
          lastModified: t.timestamp ? new Date(t.timestamp).getTime() : undefined,
        }));
      }
    } catch {
      // Fall through
    }

    // Return in-memory threads + persisted IDs
    const persistedIds = threadStore.load();
    const allIds = new Set([...threads.keys(), ...persistedIds]);
    return Array.from(allIds).map((id) => ({
      id,
      title: `Thread ${id}`,
    }));
  }

  async getSession(id: string): Promise<Session | null> {
    if (threads.has(id)) {
      return { id, title: `Thread ${id}` };
    }

    // Try to resume from SDK
    try {
      if (codexInstance.resumeThread) {
        const thread = await codexInstance.resumeThread(id);
        threads.set(id, thread);
        return { id, title: `Thread ${id}` };
      }
    } catch {
      // Thread doesn't exist
    }

    return null;
  }

  async deleteSession(id: string): Promise<boolean> {
    threads.delete(id);
    threadStore.update((ids) => ids.filter((tid) => tid !== id));
    return true;
  }

  // --- Messaging ---

  private async getOrResumeThread(sessionId: string): Promise<any> {
    let thread = threads.get(sessionId);
    if (!thread) {
      if (codexInstance.resumeThread) {
        thread = await codexInstance.resumeThread(sessionId);
        threads.set(sessionId, thread);
      } else {
        throw new Error(`Thread ${sessionId} not found. Create a new session first.`);
      }
    }
    return thread;
  }

  async prompt(
    sessionId: string,
    text: string,
    options?: PromptOptions
  ): Promise<PromptResult> {
    const thread = await this.getOrResumeThread(sessionId);

    const controller = new AbortController();
    abortControllers.set(sessionId, controller);

    try {
      const result = await thread.run(text, {
        signal: controller.signal,
        model: options?.model?.modelID ?? this.model,
      });

      const responseText =
        result.finalResponse ??
        result.response ??
        (result.items ?? [])
          .filter((i: any) => i.type === "message")
          .map((i: any) => i.content ?? i.text ?? "")
          .join("\n") ??
        "(empty response)";

      return { text: responseText, raw: result };
    } finally {
      abortControllers.delete(sessionId);
    }
  }

  async *promptStream(
    sessionId: string,
    text: string,
    options?: PromptOptions
  ): AsyncGenerator<StreamChunk> {
    const thread = await this.getOrResumeThread(sessionId);

    const controller = new AbortController();
    abortControllers.set(sessionId, controller);

    try {
      if (!thread.runStreamed) {
        // Fallback: non-streaming
        const result = await this.prompt(sessionId, text, options);
        yield { type: "text", content: result.text };
        yield { type: "done", content: "" };
        return;
      }

      const { events } = await thread.runStreamed(text, {
        signal: controller.signal,
        model: options?.model?.modelID ?? this.model,
      });

      for await (const event of events) {
        if (event.type === "item.completed") {
          const item = event.item;
          if (item?.type === "message") {
            yield { type: "text", content: item.content ?? item.text ?? "" };
          } else if (item?.type === "function_call") {
            yield { type: "tool_use", content: `[${item.name ?? "tool"}]` };
          }
        } else if (event.type === "turn.completed") {
          yield { type: "done", content: "" };
        } else if (event.type === "error") {
          yield { type: "text", content: `Error: ${event.message ?? "unknown"}` };
          yield { type: "done", content: "" };
        }
      }
    } finally {
      abortControllers.delete(sessionId);
    }
  }

  async abort(sessionId: string): Promise<void> {
    const controller = abortControllers.get(sessionId);
    if (controller) {
      controller.abort();
      abortControllers.delete(sessionId);
    }
  }

  // --- Session features ---

  async getTodos(): Promise<Todo[] | null> {
    return null;
  }

  async getDiff(sessionId: string): Promise<FileDiff[] | null> {
    try {
      const result = await this.prompt(
        sessionId,
        "Run `git diff` and return the raw diff output only, no commentary."
      );
      if (!result.text || result.text === "(empty response)") return null;
      return [{ file: "(git diff)", additions: 0, deletions: 0, after: result.text }];
    } catch {
      return null;
    }
  }

  async forkSession(): Promise<Session | null> {
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

  async getHistory(): Promise<unknown[] | null> {
    return null;
  }

  // --- File operations (via prompt delegation) ---

  async readFile(path: string): Promise<string | null> {
    const sessionId = `codex-fileop-${Date.now()}`;
    try {
      const thread = await codexInstance.startThread({ workingDirectory: this.cwd });
      const threadId = thread.id ?? thread.threadId ?? sessionId;
      threads.set(threadId, thread);

      const result = await this.prompt(
        threadId,
        `Read the file at "${path}" and return its contents verbatim. Output ONLY the file content, nothing else.`
      );
      threads.delete(threadId);
      return result.text === "(empty response)" ? null : result.text;
    } catch {
      return null;
    }
  }

  async findFiles(query: string): Promise<string[] | null> {
    const sessionId = `codex-fileop-${Date.now()}`;
    try {
      const thread = await codexInstance.startThread({ workingDirectory: this.cwd });
      const threadId = thread.id ?? thread.threadId ?? sessionId;
      threads.set(threadId, thread);

      const result = await this.prompt(
        threadId,
        `Find files matching "${query}". List each matching file path on its own line. Output ONLY the file paths, nothing else.`
      );
      threads.delete(threadId);
      if (result.text === "(empty response)") return null;
      return result.text.split("\n").map((l) => l.trim()).filter(Boolean);
    } catch {
      return null;
    }
  }

  async searchText(pattern: string): Promise<SearchResult[] | null> {
    const sessionId = `codex-fileop-${Date.now()}`;
    try {
      const thread = await codexInstance.startThread({ workingDirectory: this.cwd });
      const threadId = thread.id ?? thread.threadId ?? sessionId;
      threads.set(threadId, thread);

      const result = await this.prompt(
        threadId,
        `Search the codebase for "${pattern}". For each match output file:line:text. Output ONLY the matches, nothing else.`
      );
      threads.delete(threadId);
      if (result.text === "(empty response)") return null;
      return result.text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => {
          const [file, lineStr, ...rest] = line.split(":");
          return { file: file ?? line, line: Number(lineStr) || undefined, text: rest.join(":") || undefined };
        });
    } catch {
      return null;
    }
  }

  async findSymbols(): Promise<unknown[] | null> {
    return null;
  }

  async getFileStatus(): Promise<FileStatus[] | null> {
    const sessionId = `codex-fileop-${Date.now()}`;
    try {
      const thread = await codexInstance.startThread({ workingDirectory: this.cwd });
      const threadId = thread.id ?? thread.threadId ?? sessionId;
      threads.set(threadId, thread);

      const result = await this.prompt(
        threadId,
        `Run "git status --porcelain" and return the output. Output ONLY the raw git status output, nothing else.`
      );
      threads.delete(threadId);
      if (result.text === "(empty response)") return null;
      return result.text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => {
          const status = line.slice(0, 2).trim();
          const path = line.slice(3).trim();
          return { path, status };
        });
    } catch {
      return null;
    }
  }

  // --- Shell ---

  async shell(sessionId: string, command: string): Promise<string | null> {
    // Route through prompt — Codex will execute via its tools
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
    return ["shell", "file_read", "file_write", "file_edit"];
  }

  async getCommands(): Promise<CommandInfo[] | null> {
    return null;
  }

  async getHealth(): Promise<HealthInfo> {
    return {
      status: "Healthy",
      provider: "codex",
      model: this.model,
      extra: {
        cwd: this.cwd,
      },
    };
  }

  async getConfig(): Promise<unknown> {
    return {
      provider: "codex",
      model: this.model,
      cwd: this.cwd,
    };
  }

  async getProviders(): Promise<unknown> {
    return { openai: { models: [this.model] } };
  }

  async getAgents(): Promise<unknown[] | null> {
    return null;
  }

  // --- Models ---

  async listModels(): Promise<ModelDetail[]> {
    // Fetch models dynamically from OpenAI API
    const apiKey = process.env.CODEX_API_KEY ?? process.env.OPENAI_API_KEY;
    if (!apiKey) return this.fallbackModels();

    try {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) return this.fallbackModels();

      const body = await res.json() as any;
      const models: ModelDetail[] = (body.data ?? [])
        .map((m: any) => ({
          id: m.id,
          name: m.id,
          provider: "openai",
          reasoning: /^(o[0-9]|gpt-5)/i.test(m.id),
          attachment: false,
          active: this.model === m.id,
        }))
        .sort((a: ModelDetail, b: ModelDetail) => a.id.localeCompare(b.id));

      return models.length > 0 ? models : this.fallbackModels();
    } catch {
      return this.fallbackModels();
    }
  }

  private fallbackModels(): ModelDetail[] {
    return [
      { id: "o3", name: "o3", provider: "openai", reasoning: true, attachment: false, active: this.model === "o3" },
      { id: "o4-mini", name: "o4 Mini", provider: "openai", reasoning: true, attachment: false, active: this.model === "o4-mini" },
    ];
  }

  // --- MCP (not supported) ---

  async getMcpStatus(): Promise<McpServerStatus[] | null> {
    return null;
  }

  async addMcpServer(): Promise<boolean> {
    return false;
  }

  async removeMcpServer(): Promise<boolean> {
    return false;
  }

  private persistThreadIds(): void {
    threadStore.save(Array.from(threads.keys()));
  }
}
