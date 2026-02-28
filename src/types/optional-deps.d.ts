// Type declarations for optional provider SDKs.
// These are only loaded at runtime when the corresponding provider is selected.

declare module "@anthropic-ai/claude-code" {
  export function query(options: {
    prompt: string;
    options?: Record<string, any>;
  }): AsyncGenerator<any, any, unknown> & { abort?: () => void };

  export function listSessions(options?: {
    dir?: string;
    limit?: number;
  }): Promise<any[]>;
}

declare module "@openai/codex" {
  export class Codex {
    constructor(options?: Record<string, any>);
    startThread(options?: Record<string, any>): Promise<any>;
    resumeThread(threadId: string): Promise<any>;
    listThreads?(): Promise<any[]>;
  }
  export default Codex;
}
