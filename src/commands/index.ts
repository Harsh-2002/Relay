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
import { registerCronCommands } from "./cron.js";
import { registerQuestionHandlers } from "./question.js";
import { registerResearchCommands } from "./research.js";
import { registerWatchCommands } from "./watch.js";

export function getBotCommands(): BotCommand[] {
  return [
    // Sessions
    { command: "new", description: "Create a new session" },
    { command: "sessions", description: "List all sessions" },
    { command: "switch", description: "Switch to a session" },
    { command: "delete", description: "Delete a session" },
    { command: "current", description: "Show active session" },
    { command: "rename", description: "Rename current session" },
    { command: "fork", description: "Fork current session" },

    // Models & Agents
    { command: "models", description: "List available models" },
    { command: "model", description: "View or change model" },
    { command: "stt", description: "Switch voice transcription provider" },
    { command: "agent", description: "View or change agent" },

    // Monitor
    { command: "todo", description: "AI task checklist" },
    { command: "diff", description: "Session code changes" },

    // Files
    { command: "ls", description: "List files in directory" },
    { command: "read", description: "Read a file" },
    { command: "find", description: "Find files by name" },
    { command: "search", description: "Search in files" },
    { command: "symbols", description: "Find code symbols" },
    { command: "status", description: "Git file status" },

    // History
    { command: "history", description: "Conversation history" },
    { command: "revert", description: "Undo last change" },
    { command: "unrevert", description: "Redo reverted change" },
    { command: "summarize", description: "Summarize session" },
    { command: "share", description: "Share session" },
    { command: "unshare", description: "Revoke shared session link" },
    { command: "abort", description: "Cancel running operation" },

    // Shell
    { command: "shell", description: "Run a shell command" },
    { command: "cmd", description: "Run an OpenCode command" },
    { command: "commands", description: "List OpenCode commands" },

    // MCP
    { command: "mcp", description: "MCP server management" },

    // Cron
    { command: "cron", description: "Scheduled tasks" },

    // Watch
    { command: "watch", description: "Web monitors" },

    // Research
    { command: "research", description: "Deep research on a topic" },

    // Admin
    { command: "timezone", description: "View or set timezone" },
    { command: "health", description: "Server status" },
    { command: "config", description: "Show configuration" },
    { command: "system", description: "View system prompt" },
    { command: "help", description: "Show all commands" },
    { command: "project", description: "Project info" },
    { command: "git", description: "Git branch and status" },
    { command: "tools", description: "Available tools" },
    { command: "providers", description: "List providers" },
    { command: "agents", description: "List agents" },
    { command: "restart", description: "Restart the bot" },
    { command: "update", description: "Update and restart" },
  ];
}

export function registerCommands(bot: Bot): void {
  registerAdminCommands(bot);
  registerSessionCommands(bot);
  registerMonitorCommands(bot);
  registerFileCommands(bot);
  registerShellCommands(bot);
  registerHistoryCommands(bot);
  registerMcpCommands(bot);
  registerCronCommands(bot);
  registerWatchCommands(bot);
  registerResearchCommands(bot);
  registerQuestionHandlers(bot);
  registerMediaHandlers(bot);
  registerChat(bot);
}
