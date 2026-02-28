/**
 * Provider abstraction layer for OCBot.
 * Each coding agent platform (OpenCode, Claude, Codex) implements this interface.
 */

// --- Common data types ---

export interface Session {
  id: string;
  title?: string;
}

export interface SessionInfo {
  id: string;
  title?: string;
  lastModified?: number;
}

export interface PromptOptions {
  model?: { providerID: string; modelID: string };
  system?: string;
  parts?: any[];
}

export interface PromptResult {
  text: string;
  parts?: any[];
  raw?: any;
}

export interface StreamChunk {
  type: "text" | "tool_use" | "status" | "done";
  content: string;
}

export interface Todo {
  content: string;
  status: string;
  priority?: string;
  id?: string;
}

export interface FileDiff {
  file: string;
  additions: number;
  deletions: number;
  before?: string;
  after?: string;
}

export interface SearchResult {
  file: string;
  line?: number;
  text?: string;
}

export interface FileStatus {
  path: string;
  status: string;
}

export interface ProjectInfo {
  id?: string;
  worktree?: string;
  directory?: string;
  vcs?: string;
  branch?: string;
}

export interface CommandInfo {
  name: string;
  description?: string;
}

export interface ModelInfo {
  id: string;
  name?: string;
  provider?: string;
}

export interface HealthInfo {
  status: string;
  provider: string;
  model?: string;
  project?: string;
  branch?: string;
  extra?: Record<string, string>;
}

// --- Provider interface ---

export interface Provider {
  /** Provider identifier */
  readonly name: "opencode" | "claude" | "codex";

  // Lifecycle
  init(): Promise<void>;
  shutdown(): void;

  // Sessions
  createSession(title?: string): Promise<Session>;
  listSessions(): Promise<SessionInfo[]>;
  getSession(id: string): Promise<Session | null>;
  deleteSession(id: string): Promise<boolean>;

  // Messaging
  prompt(sessionId: string, text: string, options?: PromptOptions): Promise<PromptResult>;
  abort(sessionId: string): Promise<void>;

  // Streaming (optional — provider may not support it)
  promptStream?(
    sessionId: string,
    text: string,
    options?: PromptOptions
  ): AsyncGenerator<StreamChunk>;

  // Session features (return null if not supported)
  getTodos(sessionId: string): Promise<Todo[] | null>;
  getDiff(sessionId: string): Promise<FileDiff[] | null>;
  forkSession(sessionId: string, messageId?: string): Promise<Session | null>;
  revert(sessionId: string): Promise<boolean>;
  unrevert(sessionId: string): Promise<boolean>;
  share(sessionId: string): Promise<string | null>;
  summarize(sessionId: string): Promise<boolean>;
  getHistory(sessionId: string, limit?: number): Promise<any[] | null>;

  // File operations (return null if not supported)
  readFile(path: string): Promise<string | null>;
  findFiles(query: string): Promise<string[] | null>;
  searchText(pattern: string): Promise<SearchResult[] | null>;
  findSymbols(query: string): Promise<any[] | null>;
  getFileStatus(): Promise<FileStatus[] | null>;

  // Shell
  shell(sessionId: string, command: string): Promise<string | null>;
  runCommand(
    sessionId: string,
    command: string,
    args?: string
  ): Promise<PromptResult | null>;

  // Info
  getProjectInfo(): Promise<ProjectInfo | null>;
  getTools(): Promise<string[] | null>;
  getCommands(): Promise<CommandInfo[] | null>;
  getHealth(): Promise<HealthInfo>;
  getConfig(): Promise<any>;
  getProviders(): Promise<any>;
  getAgents(): Promise<any[] | null>;
}

export type ProviderName = Provider["name"];
