# Relay

[![npm version](https://img.shields.io/npm/v/@4via6/relay)](https://www.npmjs.com/package/@4via6/relay)
[![npm downloads](https://img.shields.io/npm/dm/@4via6/relay)](https://www.npmjs.com/package/@4via6/relay)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Your AI coding agent, always on — always in Telegram. Powered by [OpenCode](https://github.com/opencode-ai/opencode) with 75+ AI providers including Anthropic, OpenAI, Google, and local models.

## Features

- **75+ AI providers** -- Anthropic, OpenAI, Google, local models, and more via OpenCode
- **Interactive setup** -- `relay onboard` wizard for first-time configuration
- **Structured logging** -- pino-based JSON logging with full visibility
- **Text, voice, photo, and file input** -- send messages in any format
- **Reply context** -- reply to any bot message to reference it in your next prompt
- **Edited messages** -- edit a sent message to re-prompt the AI with the correction
- **Reasoning display** -- AI thinking is shown in collapsible blockquotes, separate from the answer
- **File output** -- receive screenshots, generated files, and artifacts as Telegram attachments
- **Streaming responses** -- live-streamed via `editMessageText` with smooth animation
- **Session management** -- create, switch, fork, delete, rename, and list sessions
- **Dynamic model selection** -- models fetched from provider APIs, always up to date
- **MCP tools** -- Browser, Fetch, Memory, and Filesystem via MCP; add custom servers at runtime
- **Scheduled tasks** -- cron jobs that run AI prompts on a schedule (interval, daily, weekly)
- **Shell access** -- run commands on the coding agent's machine
- **Voice transcription** -- Groq, Sarvam, OpenAI, or AssemblyAI speech-to-text
- **Custom system prompts** -- load from `.relay/SKILL.md`, hot-reload on change
- **File operations** -- list, read, find, search, and browse project files
- **Code diffs** -- view git diffs from sessions
- **State persistence** -- sessions, model selection, cron jobs, and MCP configs survive restarts
- **Webhook mode** -- deploy with webhooks for lower latency in production
- **Large file support** -- text files up to 500KB fully included, larger files chunked

## Documentation

| Guide | Description |
|-------|-------------|
| [Getting Started](docs/getting-started.md) | Installation, prerequisites, first steps |
| [Configuration](docs/configuration.md) | All config options and CLI flags |
| [Providers](docs/providers.md) | Detailed setup for each provider |
| [Commands](docs/commands.md) | Full command reference with examples |
| [Features](docs/features.md) | Streaming, file attachments, voice, MCP, models |
| [Troubleshooting](docs/troubleshooting.md) | Common issues and solutions |

## Install

```bash
npm install -g @4via6/relay
relay onboard
```

The setup wizard walks through OpenCode installation, bot token, user ID, MCP tools, and voice transcription, then saves everything to `~/.relay/config.json`.

### With npx (no install)

```bash
npx @4via6/relay onboard
```

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18 (or [Bun](https://bun.sh/))
- [OpenCode](https://github.com/opencode-ai/opencode) (`npm i -g opencode-ai@latest`) -- the AI backend
- A Telegram bot token (from [@BotFather](https://t.me/BotFather))
- Provider credentials (see below)

## Running

### Foreground (default)

```bash
relay
```

Close the terminal and the bot stops.

### Background (daemon)

```bash
relay start                  # Start as background daemon
relay status                 # Show PID, uptime, memory
relay logs                   # Tail logs (Ctrl+C to exit)
relay restart                # Restart the daemon
relay stop                   # Stop the daemon
```

The daemon uses [pm2](https://pm2.keymetrics.io/) under the hood (auto-installed on first `relay start`). CLI flags are forwarded.

### Updating

```bash
relay update
```

Updates to the latest version. If the daemon is running, it's automatically restarted after the update.

## Configuration

Config is stored in `~/.relay/config.json` (global). Use `--dev` for local development (stores in `./.relay/` instead). Memory MCP data is stored in `<data-dir>/memory.jsonl`.

```bash
relay onboard                    # Interactive wizard
relay --bot-token=xxx --allowed-user-id=123  # CLI flags
```

Re-running `relay onboard` on an existing config enters update mode — shows current values, press Enter to keep them.

### CLI flags

| Flag | Description |
|------|-------------|
| `--help` | Show help |
| `--version` | Show version |
| `--bot-token` | Telegram bot token |
| `--allowed-user-id` | Telegram user ID |
| `--bot-mode` | `polling` (default) or `webhook` |
| `--dev` | Use `./.relay/` in current directory instead of `~/.relay/` |
| `--data-dir` | Custom data directory (default: `~/.relay/`) |
| `--system-prompt-file` | Custom system prompt file path |

## Backend

Relay is powered by [OpenCode](https://github.com/opencode-ai/opencode), which supports 75+ AI providers (Anthropic, OpenAI, Google, local models, etc.) through a single unified interface. The OpenCode SDK (`@opencode-ai/sdk`) is bundled — no extra installation needed. Install OpenCode with `npm i -g opencode-ai@latest`.

Supports both `start` mode (spawns local server) and `connect` mode (remote URL). See [Providers](docs/providers.md) for detailed setup.

## Commands

### Chat

Send any text message, voice note, photo, or file to chat with the AI. File attachments from the AI (screenshots, generated files) are automatically sent back as Telegram documents or photos.

- **Reply context** -- reply to any bot message to include it as context in your prompt
- **Edit to re-prompt** -- edit a sent message to re-prompt with the corrected text
- **Voice notes** -- automatically transcribed to text using the configured STT provider
- **Photos** -- sent as image attachments to the AI (supports vision-capable models)
- **Files** -- text files embedded in prompt, images/PDFs as attachments

### Sessions

| Command | Description | Example |
|---------|-------------|---------|
| `/new [title]` | Create a new session | `/new Bug fix session` |
| `/sessions` | List all sessions (interactive picker) | `/sessions` |
| `/switch <id>` | Switch to a session by ID | `/switch abc123` |
| `/delete <id>` | Delete a session by ID | `/delete abc123` |
| `/current` | Show active session info | `/current` |
| `/rename <title>` | Rename active session | `/rename API refactor` |
| `/fork [messageId]` | Fork session (optionally from a message) | `/fork` |

### Monitor

| Command | Description | Example |
|---------|-------------|---------|
| `/todo` | View AI task checklist | `/todo` |
| `/diff` | Session code changes summary | `/diff` |
| `/diff full` | Download complete diff as file | `/diff full` |

### Files

| Command | Description | Example |
|---------|-------------|---------|
| `/ls [path]` | List directory contents | `/ls src/utils` |
| `/read <path>` | Read a file (code block or document) | `/read src/index.ts` |
| `/find <pattern>` | Find files by name | `/find *.ts` |
| `/search <pattern>` | Search file contents | `/search TODO` |
| `/symbols <query>` | Find code symbols | `/symbols handleMessage` |
| `/status` | Git file status | `/status` |

### History

| Command | Description | Example |
|---------|-------------|---------|
| `/history` | Last 10 messages with fork buttons | `/history` |
| `/summarize` | Session summary with stats | `/summarize` |
| `/revert` | Undo last AI change | `/revert` |
| `/unrevert` | Redo reverted change | `/unrevert` |
| `/abort` | Cancel running operation | `/abort` |
| `/share` | Generate shareable session link | `/share` |
| `/unshare` | Revoke shared session link | `/unshare` |

### Shell

| Command | Description | Example |
|---------|-------------|---------|
| `/shell <command>` | Run a shell command on the server | `/shell git log --oneline -5` |
| `/cmd [command]` | Run OpenCode command (picker if no args) | `/cmd stats` |
| `/commands` | List available OpenCode commands | `/commands` |

Available `/cmd` commands: `init`, `review`, `stats`, `version`, `upgrade`, `sessions`

### Models & Agents

| Command | Description | Example |
|---------|-------------|---------|
| `/models` | Interactive model picker (grouped by provider) | `/models` |
| `/model [provider/model]` | View or set model (supports partial match) | `/model anthropic/claude-sonnet-4-20250514` |
| `/agent [name\|clear]` | View or change agent (picker if no args) | `/agent clear` |
| `/agents` | List all agents with descriptions | `/agents` |
| `/stt` | Switch voice transcription provider (picker) | `/stt` |

Models show capability badges: `[reasoning]` for thinking support, `[vision]` for image input, `[free]` for free-tier models.

### MCP (Model Context Protocol)

| Command | Description | Example |
|---------|-------------|---------|
| `/mcp` | Show MCP server status with action buttons | `/mcp` |
| `/mcp add <name> local <cmd>` | Add a local MCP server | `/mcp add myserver local npx my-mcp` |
| `/mcp add <name> remote <url>` | Add a remote MCP server | `/mcp add api remote https://mcp.example.com` |
| `/mcp remove <name>` | Remove an MCP server | `/mcp remove myserver` |
| `/mcp connect <name>` | Reconnect an MCP server | `/mcp connect myserver` |

Four built-in MCP tools are available via `relay onboard`:

| Tool | Description |
|------|-------------|
| **Browser** | Playwright-based web browsing and screenshots |
| **Fetch** | Fetch web pages as markdown |
| **Memory** | Persistent knowledge graph (`memory.jsonl`) |
| **Filesystem** | Read/write access to specified directories |

Additional servers can be added at runtime. All MCP configs persist in OpenCode's configuration.

### Cron (Scheduled Tasks)

| Command | Description | Example |
|---------|-------------|---------|
| `/cron` | Show scheduled jobs with action buttons | `/cron` |
| `/cron add daily HH:MM Title: prompt` | Schedule a daily job | `/cron add daily 09:00 Git summary: Summarize recent git commits` |
| `/cron add every Nm Title: prompt` | Schedule a recurring job | `/cron add every 30m Health: Check server health` |
| `/cron add every Nh Title: prompt` | Schedule hourly recurring job | `/cron add every 2h Status: Report system status` |
| `/cron add weekly days HH:MM Title: prompt` | Schedule a weekly job | `/cron add weekly mon,wed,fri 14:30 Review: Summarize open PRs` |

The interactive picker (`/cron` → Add Job) walks through schedule type, time, and days, then shows a ready-to-copy `/cron add` command.

Each job in the list shows:
- Enable/disable toggle
- Run now button
- Delete button
- Last run time and result (ok/fail)
- Total run count

Jobs are persisted to `cron.json` in the data directory and survive restarts.

### Settings & Info

| Command | Description | Example |
|---------|-------------|---------|
| `/health` | Server status (provider, model, voice, project) | `/health` |
| `/config` | Show configuration (sensitive values masked) | `/config` |
| `/system` | View current system prompt | `/system` |
| `/system reload` | Reload system prompt from disk | `/system reload` |
| `/providers` | List AI providers with status and model count | `/providers` |
| `/tools` | List available tools | `/tools` |
| `/project` | Project info (path, VCS, branch) | `/project` |
| `/git` | Git branch and changed files | `/git` |
| `/help` | Show all commands | `/help` |

## Voice / STT

Configure speech-to-text providers during `relay onboard` or pass API keys via CLI flags. The cheapest configured provider is auto-selected. If it fails, other configured providers are tried automatically. Use `/stt` to switch providers manually.

## System Prompt

The bot loads a system prompt from `~/.relay/SKILL.md` (or `./SKILL.md` in cwd for backward compatibility, or a custom path via `--system-prompt-file`). If no file exists, a default prompt is used. The file is watched for changes and reloaded automatically. Use `/system reload` to force a reload.

## Architecture

```
src/
  config/
    schema.ts      -- Config type definitions
    loader.ts      -- Config resolution (CLI > file > defaults)
    setup.ts       -- Interactive setup wizard
    index.ts       -- Config singleton
  providers/
    types.ts       -- Provider interface, capabilities, MCP/model types
    index.ts       -- Provider factory
    opencode.ts    -- OpenCode SDK provider
  commands/
    chat.ts        -- Text message handler
    session.ts     -- Session management commands
    media.ts       -- Photo, voice, audio, file handlers
    admin.ts       -- Health, config, model, agent, stt, help commands
    monitor.ts     -- Todo, diff, fork commands
    files.ts       -- File listing, read, find, search commands
    history.ts     -- History, revert, share commands
    shell.ts       -- Shell and OpenCode command execution
    mcp.ts         -- MCP server management
    cron.ts        -- Scheduled task commands and UI
  cron.ts          -- Cron scheduler engine, job execution, storage
  utils/
    logger.ts      -- Pino-based structured logging
    store.ts       -- JSON file-backed persistence (data directory)
    stream.ts      -- Streaming response handler (reasoning, chunking)
    files.ts       -- Outbound file attachment handling
    chunker.ts     -- HTML-aware Telegram message chunking
    markdown.ts    -- Markdown to Telegram HTML conversion
    errors.ts      -- Error formatting
    html.ts        -- HTML escaping for Telegram
    media.ts       -- File upload/download
    stt.ts         -- Speech-to-text with provider fallback
    system-prompt.ts -- System prompt loading with MCP tool instructions
    opencode-config.ts -- MCP injection into OpenCode config
```

The provider implements the `Provider` interface with sessions, prompts, streaming, file operations, and MCP management. Messages are processed through a serial prompt queue to prevent interleaved responses.

### Key Internals

- **HTML-aware chunker** -- splits messages at the 4096-char limit without breaking HTML tags
- **Prompt queue** -- serializes concurrent messages to prevent SSE stream interleaving
- **Reasoning display** -- AI thinking shown in expandable `<blockquote>`, collapsed by default
- **Streaming** -- live-streamed via `editMessageText` with automatic code fence closure and tail-end display for long responses

## License

MIT
