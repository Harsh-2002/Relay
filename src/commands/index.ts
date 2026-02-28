import type { Bot } from "grammy";
import type { BotCommand } from "grammy/types";
import { registerSessionCommands } from "./session.js";
import { registerMonitorCommands } from "./monitor.js";
import { registerFileCommands } from "./files.js";
import { registerShellCommands } from "./shell.js";
import { registerAdminCommands } from "./admin.js";
import { registerHistoryCommands } from "./history.js";
import { registerMediaHandlers } from "./media.js";
import { registerChat } from "./chat.js";
import { registerMcpCommands } from "./mcp.js";

export function getBotCommands(provider: string): BotCommand[] {
  const isOpencode = provider === "opencode";
  const isClaude = provider === "claude";
  const hasMcp = isOpencode || isClaude;

  const commands: BotCommand[] = [
    // Sessions
    { command: "new", description: "Create a new session" },
    { command: "sessions", description: "List all sessions" },
    { command: "switch", description: "Switch to a session" },
    { command: "delete", description: "Delete a session" },
    { command: "current", description: "Show active session" },
    { command: "fork", description: "Fork current session" },

    // Files
    { command: "read", description: "Read a file" },
    { command: "find", description: "Find files by name" },
    { command: "search", description: "Search in files" },
    { command: "symbols", description: "Find code symbols" },
    { command: "status", description: "Git file status" },

    // History
    { command: "history", description: "Conversation history" },
    { command: "abort", description: "Cancel running operation" },
    { command: "revert", description: "Undo last change" },
    { command: "unrevert", description: "Redo reverted change" },
    { command: "summarize", description: "Summarize session" },
    { command: "share", description: "Share session" },

    // Shell
    { command: "shell", description: "Run a shell command" },

    // Models
    { command: "models", description: "List available models" },
    { command: "model", description: "View or change model" },

    // Settings
    { command: "health", description: "Server status" },
    { command: "config", description: "Show configuration" },
    { command: "system", description: "View system prompt" },
    { command: "help", description: "Show all commands" },
    { command: "project", description: "Project info" },
    { command: "git", description: "Git branch and status" },
    { command: "tools", description: "Available tools" },
    { command: "providers", description: "List providers" },
    { command: "agents", description: "List agents" },
  ];

  // Provider-specific commands
  if (isOpencode) {
    commands.push(
      { command: "todo", description: "AI task checklist" },
      { command: "diff", description: "Session code changes" },
      { command: "cmd", description: "Run an OpenCode command" },
      { command: "commands", description: "List OpenCode commands" },
    );
  } else {
    commands.push(
      { command: "diff", description: "Session code changes" },
    );
  }

  if (hasMcp) {
    commands.push(
      { command: "mcp", description: "MCP server management" },
    );
  }

  return commands;
}

export function registerCommands(bot: Bot): void {
  registerAdminCommands(bot);
  registerSessionCommands(bot);
  registerMonitorCommands(bot);
  registerFileCommands(bot);
  registerShellCommands(bot);
  registerHistoryCommands(bot);
  registerMcpCommands(bot);
  registerMediaHandlers(bot);
  registerChat(bot);
}
