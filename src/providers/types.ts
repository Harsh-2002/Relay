/**
 * Provider abstraction layer for Relay.
 * OpenCode is the sole backend — it supports 75+ AI providers through a single interface.
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

export type MessagePart =
  | { type: "text"; text: string }
  | { type: "file"; mime: string; filename?: string; url: string };

export interface PromptOptions {
  model?: { providerID: string; modelID: string };
  system?: string;
  parts?: MessagePart[];
  agent?: string;
}

export interface PromptResult {
  text: string;
  reasoning?: string;
  parts?: unknown[];
  raw?: unknown;
}

export interface StreamChunk {
  type: "text" | "tool_use" | "status" | "done" | "file" | "reasoning";
  content: string;
  file?: { mime: string; filename: string; url: string };
}

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  ignored: boolean;
}

export interface ToolInfo {
  id: string;
  description?: string;
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

export interface ModelDetail {
  id: string;
  name: string;
  provider: string;
  family?: string;
  reasoning: boolean;
  attachment: boolean;
  free: boolean;
  modalities?: { input: string[]; output: string[] };
  active: boolean;
}

export interface HealthInfo {
  status: string;
  provider: string;
  model?: string;
  project?: string;
  branch?: string;
  extra?: Record<string, string>;
}

// --- MCP types ---

export interface McpServerConfig {
  type: "local" | "remote";
  command?: string[];
  environment?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  timeout?: number;
}

export interface McpServerStatus {
  name: string;
  status: "connected" | "disabled" | "failed" | "needs_auth" | "unknown";
  error?: string;
}

// --- Provider interface ---

export interface Provider {
  /** Provider identifier */
  readonly name: "opencode";

  // Lifecycle
  init(): Promise<void>;
  shutdown(): void;

  // Sessions
  createSession(title?: string): Promise<Session>;
  listSessions(): Promise<SessionInfo[]>;
  getSession(id: string): Promise<Session | null>;
  deleteSession(id: string): Promise<boolean>;
  renameSession(id: string, title: string): Promise<boolean>;
  getSessionStatuses(): Promise<Record<string, string>>;

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
  unshare(sessionId: string): Promise<boolean>;
  summarize(sessionId: string): Promise<boolean>;
  getHistory(sessionId: string, limit?: number): Promise<unknown[] | null>;

  // File operations (return null if not supported)
  readFile(path: string): Promise<string | null>;
  listFiles(path: string): Promise<FileNode[] | null>;
  findFiles(query: string): Promise<string[] | null>;
  searchText(pattern: string): Promise<SearchResult[] | null>;
  findSymbols(query: string): Promise<unknown[] | null>;
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
  getTools(): Promise<ToolInfo[] | null>;
  getCommands(): Promise<CommandInfo[] | null>;
  getHealth(): Promise<HealthInfo>;
  getConfig(): Promise<unknown>;
  getProviders(): Promise<unknown>;
  getAgents(): Promise<unknown[] | null>;

  // Models
  listModels(): Promise<ModelDetail[]>;

  // MCP (return null if not supported)
  getMcpStatus(): Promise<McpServerStatus[] | null>;
  addMcpServer(name: string, config: McpServerConfig): Promise<boolean>;
  removeMcpServer(name: string): Promise<boolean>;
  connectMcpServer(name: string): Promise<boolean>;
}

