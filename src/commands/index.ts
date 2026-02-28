import type { Bot } from "grammy";
import type { BotCommand } from "grammy/types";
import type { ProviderCapabilities } from "../providers/types.js";
import { registerSessionCommands } from "./session.js";
import { registerMonitorCommands } from "./monitor.js";
import { registerFileCommands } from "./files.js";
import { registerShellCommands } from "./shell.js";
import { registerAdminCommands } from "./admin.js";
import { registerHistoryCommands } from "./history.js";
import { registerMediaHandlers } from "./media.js";
import { registerChat } from "./chat.js";
import { registerMcpCommands } from "./mcp.js";

export function getBotCommands(capabilities: ProviderCapabilities): BotCommand[] {
  const commands: BotCommand[] = [
    // Sessions (always available)
    { command: "new", description: "Create a new session" },
    { command: "sessions", description: "List all sessions" },
    { command: "switch", description: "Switch to a session" },
    { command: "delete", description: "Delete a session" },
    { command: "current", description: "Show active session" },

    // Models (always available)
    { command: "models", description: "List available models" },
    { command: "model", description: "View or change model" },

    // Admin (always available)
    { command: "health", description: "Server status" },
    { command: "config", description: "Show configuration" },
    { command: "system", description: "View system prompt" },
    { command: "help", description: "Show all commands" },
    { command: "project", description: "Project info" },
    { command: "git", description: "Git branch and status" },
    { command: "tools", description: "Available tools" },
    { command: "providers", description: "List providers" },
    { command: "agents", description: "List agents" },

    // Always available
    { command: "abort", description: "Cancel running operation" },
  ];

  // Conditionally included based on capabilities
  if (capabilities.fork) {
    commands.push({ command: "fork", description: "Fork current session" });
  }
  if (capabilities.fileOps) {
    commands.push(
      { command: "read", description: "Read a file" },
      { command: "find", description: "Find files by name" },
      { command: "search", description: "Search in files" },
      { command: "symbols", description: "Find code symbols" },
      { command: "status", description: "Git file status" },
    );
  }
  if (capabilities.history) {
    commands.push({ command: "history", description: "Conversation history" });
  }
  if (capabilities.revert) {
    commands.push(
      { command: "revert", description: "Undo last change" },
      { command: "unrevert", description: "Redo reverted change" },
    );
  }
  if (capabilities.summarize) {
    commands.push({ command: "summarize", description: "Summarize session" });
  }
  if (capabilities.share) {
    commands.push({ command: "share", description: "Share session" });
  }
  if (capabilities.shell) {
    commands.push({ command: "shell", description: "Run a shell command" });
  }
  if (capabilities.todos) {
    commands.push({ command: "todo", description: "AI task checklist" });
  }
  if (capabilities.diff) {
    commands.push({ command: "diff", description: "Session code changes" });
  }
  if (capabilities.commands) {
    commands.push(
      { command: "cmd", description: "Run an OpenCode command" },
      { command: "commands", description: "List OpenCode commands" },
    );
  }
  if (capabilities.mcp) {
    commands.push({ command: "mcp", description: "MCP server management" });
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
