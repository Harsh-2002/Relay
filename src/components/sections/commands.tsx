"use client";

import { Section, SectionHeader } from "@/components/ui/section";
import { Tabs } from "@/components/ui/tabs";
import { AnimateIn } from "@/components/ui/animate-in";

interface Command {
  name: string;
  description: string;
}

const categories: { id: string; label: string; commands: Command[] }[] = [
  {
    id: "chat",
    label: "Chat",
    commands: [
      { name: "Text message", description: "Send any text to chat with the AI" },
      { name: "Voice note", description: "Transcribed automatically via STT" },
      { name: "Photo", description: "Analyzed by vision-capable models" },
      { name: "File", description: "Text files embedded, binary referenced" },
    ],
  },
  {
    id: "sessions",
    label: "Sessions",
    commands: [
      { name: "/new [title]", description: "Create a new session" },
      { name: "/sessions", description: "List all sessions" },
      { name: "/switch <id>", description: "Switch to a session" },
      { name: "/delete <id>", description: "Delete a session" },
      { name: "/current", description: "Show active session info" },
      { name: "/rename <title>", description: "Rename the current session" },
      { name: "/fork [msgId]", description: "Fork current session" },
    ],
  },
  {
    id: "monitor",
    label: "Monitor",
    commands: [
      { name: "/todo", description: "View AI task checklist" },
      { name: "/diff", description: "Show code changes summary" },
      { name: "/diff full", description: "Download full diff file" },
    ],
  },
  {
    id: "files",
    label: "Files",
    commands: [
      { name: "/ls [path]", description: "List files and directories" },
      { name: "/read <path>", description: "Read file contents" },
      { name: "/find <query>", description: "Find files by name pattern" },
      { name: "/search <pattern>", description: "Search file contents" },
      { name: "/symbols <query>", description: "Find code symbols" },
      { name: "/status", description: "Git file status" },
    ],
  },
  {
    id: "history",
    label: "History",
    commands: [
      { name: "/history", description: "View last 10 messages" },
      { name: "/summarize", description: "Summarize current session" },
      { name: "/revert", description: "Undo last AI change" },
      { name: "/unrevert", description: "Redo reverted change" },
      { name: "/abort", description: "Cancel running operation" },
      { name: "/share", description: "Share session URL" },
      { name: "/unshare", description: "Revoke shared session URL" },
    ],
  },
  {
    id: "shell",
    label: "Shell",
    commands: [
      { name: "/shell <cmd>", description: "Run shell command" },
      { name: "/cmd [command]", description: "Run OpenCode command (interactive picker without args)" },
      { name: "/commands", description: "List available commands" },
    ],
  },
  {
    id: "models",
    label: "Models",
    commands: [
      { name: "/models", description: "List models with [free], [reasoning], [vision] badges" },
      { name: "/model [id]", description: "View or change current model" },
    ],
  },
  {
    id: "mcp",
    label: "MCP",
    commands: [
      { name: "/mcp", description: "Show MCP server status (4 built-in tools)" },
      { name: "/mcp add <name> local <cmd>", description: "Add local server" },
      { name: "/mcp add <name> remote <url>", description: "Add remote server" },
      { name: "/mcp remove <name>", description: "Remove a server" },
      { name: "/mcp connect <name>", description: "Reconnect a server" },
    ],
  },
  {
    id: "cron",
    label: "Cron",
    commands: [
      { name: "/cron", description: "View scheduled jobs with action buttons" },
      { name: "/cron add daily HH:MM Title: prompt", description: "Schedule a daily job" },
      { name: "/cron add every Nm Title: prompt", description: "Schedule a recurring job (e.g. 30m, 2h)" },
      { name: "/cron add weekly days HH:MM Title: prompt", description: "Schedule a weekly job (e.g. mon,wed,fri)" },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    commands: [
      { name: "/health", description: "Server status dashboard" },
      { name: "/config", description: "Show full configuration" },
      { name: "/agent [name]", description: "View or change agent mode" },
      { name: "/agents", description: "List available agents" },
      { name: "/tools", description: "List available tools" },
      { name: "/providers", description: "Show AI providers" },
      { name: "/project", description: "Show project info" },
      { name: "/git", description: "Show git status" },
      { name: "/system", description: "View system prompt" },
      { name: "/stt", description: "Show STT provider info" },
      { name: "/help", description: "Command reference" },
      { name: "/start", description: "Show welcome message" },
    ],
  },
];

function CommandContent({ commands, isInputTypes }: { commands: Command[]; isInputTypes?: boolean }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {commands.map((cmd) => (
        <div
          key={cmd.name}
          className="flex items-start gap-3 rounded-lg border border-border-primary bg-bg-card/80 backdrop-blur-xl px-4 py-3 transition-colors duration-200 hover:border-border-hover hover:bg-bg-card-hover/80"
        >
          {isInputTypes ? (
            <span className="text-sm font-medium text-text-primary whitespace-nowrap shrink-0">
              {cmd.name}
            </span>
          ) : (
            <code className="text-sm font-mono text-accent whitespace-nowrap shrink-0">
              {cmd.name}
            </code>
          )}
          <span className="text-sm text-text-secondary">{cmd.description}</span>
        </div>
      ))}
    </div>
  );
}

export function Commands() {
  const tabs = categories.map((cat) => ({
    id: cat.id,
    label: cat.label,
    content: <CommandContent commands={cat.commands} isInputTypes={cat.id === "chat"} />,
  }));

  return (
    <Section id="commands" background="secondary" gridOpacity={0.4}>
      <SectionHeader
        overline="Commands"
        title="40+ commands at your fingertips"
        subtitle="Organized command system covering every aspect of your AI workflow"
      />
      <AnimateIn>
        <Tabs tabs={tabs} defaultTab="chat" />
      </AnimateIn>
    </Section>
  );
}
