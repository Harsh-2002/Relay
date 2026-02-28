"use client";

import { Section, SectionHeader } from "@/components/ui/section";
import { Tabs } from "@/components/ui/tabs";
import { AnimateIn } from "@/components/ui/animate-in";

interface Command {
  name: string;
  description: string;
}

const categories: { id: string; label: string; commands: Command[]; example: string }[] = [
  {
    id: "chat",
    label: "Chat",
    commands: [
      { name: "Text message", description: "Send any text to chat with the AI" },
      { name: "Voice note", description: "Transcribed automatically via STT" },
      { name: "Photo", description: "Analyzed by vision-capable models" },
      { name: "File", description: "Text files embedded, binary referenced" },
    ],
    example: "Just type your message and send it!\n\n> Refactor the auth module to use JWT\n\nThe AI will process and respond inline.",
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
      { name: "/fork [msgId]", description: "Fork current session" },
    ],
    example: "/new Refactoring auth module\n\n\u2705 Session created: abc123\n   Title: Refactoring auth module\n   Now active.",
  },
  {
    id: "monitor",
    label: "Monitor",
    commands: [
      { name: "/todo", description: "View AI task checklist" },
      { name: "/diff", description: "Show code changes summary" },
      { name: "/diff full", description: "Download full diff file" },
    ],
    example: "/diff\n\n\ud83d\udcc4 Changes Summary\n   3 files changed\n   +47 insertions\n   -23 deletions",
  },
  {
    id: "files",
    label: "Files",
    commands: [
      { name: "/read <path>", description: "Read file contents" },
      { name: "/find <query>", description: "Find files by name pattern" },
      { name: "/search <pattern>", description: "Search file contents" },
      { name: "/symbols <query>", description: "Find code symbols" },
      { name: "/status", description: "Git file status" },
    ],
    example: "/find *.ts\n\n\ud83d\udcc2 Found 12 files:\n   src/index.ts\n   src/bot.ts\n   src/auth.ts\n   src/session.ts\n   ...",
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
    ],
    example: "/revert\n\n\u21a9\ufe0f Changes reverted successfully.\n   Use /unrevert to restore.",
  },
  {
    id: "shell",
    label: "Shell",
    commands: [
      { name: "/shell <cmd>", description: "Run shell command" },
      { name: "/cmd <command>", description: "Run OpenCode command" },
      { name: "/commands", description: "List available commands" },
    ],
    example: "/shell npm test\n\n\ud83d\udcbb Output:\n   PASS src/auth.test.ts\n   PASS src/session.test.ts\n   All tests passed.",
  },
  {
    id: "models",
    label: "Models",
    commands: [
      { name: "/models", description: "List all available models" },
      { name: "/model [id]", description: "View or change current model" },
    ],
    example: "/models\n\nanthropic\n  claude-sonnet-4 [reasoning] [active]\n  claude-opus-4 [reasoning]\n  claude-haiku-4",
  },
  {
    id: "mcp",
    label: "MCP",
    commands: [
      { name: "/mcp", description: "Show MCP server status" },
      { name: "/mcp add <name> local <cmd>", description: "Add local server" },
      { name: "/mcp add <name> remote <url>", description: "Add remote server" },
      { name: "/mcp remove <name>", description: "Remove a server" },
    ],
    example: "/mcp\n\nMCP Servers (2)\n  memory   \u2705 ok\n  browser  \u2705 ok",
  },
  {
    id: "admin",
    label: "Admin",
    commands: [
      { name: "/health", description: "Server status dashboard" },
      { name: "/config", description: "Show full configuration" },
      { name: "/system", description: "View system prompt" },
      { name: "/help", description: "Command reference" },
    ],
    example: "/health\n\n\ud83d\udfe2 System Status\n   Provider: opencode\n   Model: claude-sonnet-4\n   Uptime: 2h 34m\n   Sessions: 5",
  },
];

function CommandContent({ commands, example }: { commands: Command[]; example: string }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-2">
        {commands.map((cmd) => (
          <div
            key={cmd.name}
            className="flex items-start gap-3 rounded-lg border border-border-primary bg-bg-card px-4 py-3"
          >
            <code className="text-sm font-mono text-accent whitespace-nowrap shrink-0">
              {cmd.name}
            </code>
            <span className="text-sm text-text-secondary">{cmd.description}</span>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-border-primary bg-bg-code p-4">
        <div className="flex items-center gap-2 mb-3 text-xs text-text-tertiary">
          <div className="w-2 h-2 rounded-full bg-accent" />
          Telegram
        </div>
        <pre className="text-sm font-mono text-text-secondary whitespace-pre-wrap leading-relaxed">
          {example}
        </pre>
      </div>
    </div>
  );
}

export function Commands() {
  const tabs = categories.map((cat) => ({
    id: cat.id,
    label: cat.label,
    content: <CommandContent commands={cat.commands} example={cat.example} />,
  }));

  return (
    <Section id="commands" background="secondary">
      <SectionHeader
        title="30+ commands at your fingertips"
        subtitle="Organized command system covering every aspect of your coding workflow"
      />
      <AnimateIn>
        <Tabs tabs={tabs} defaultTab="sessions" />
      </AnimateIn>
    </Section>
  );
}
