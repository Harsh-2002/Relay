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
- **Session management** -- create, switch, fork, delete, and list sessions
- **Dynamic model selection** -- models fetched from provider APIs, always up to date
- **MCP tools** -- Browser, Fetch, Memory, and Filesystem via MCP; add custom servers at runtime
- **Shell access** -- run commands on the coding agent's machine
- **Voice transcription** -- Groq, OpenAI, or AssemblyAI speech-to-text
- **Custom system prompts** -- load from `.relay/SKILL.md`, hot-reload on change
- **File operations** -- read, find, search, and browse project files
- **Code diffs** -- view git diffs from sessions
- **State persistence** -- sessions, model selection, and MCP configs survive restarts
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

Config is stored in `~/.relay/config.json` (global). Memory MCP data is stored in `~/.relay/memory.jsonl`. Use the setup wizard or CLI flags:

```bash
relay onboard                    # Interactive wizard
relay --bot-token=xxx --allowed-user-id=123  # CLI flags
```

### CLI flags

| Flag | Description |
|------|-------------|
| `--help` | Show help |
| `--version` | Show version |
| `--bot-token` | Telegram bot token |
| `--allowed-user-id` | Telegram user ID |
| `--bot-mode` | `polling` or `webhook` |
| `--dev` | Use `./.relay/` in current directory instead of `~/.relay/` |
| `--data-dir` | Data directory (default: `~/.relay/`) |
| `--system-prompt-file` | Custom system prompt file |


## Backend

Relay is powered by [OpenCode](https://github.com/opencode-ai/opencode), which supports 75+ AI providers (Anthropic, OpenAI, Google, local models, etc.) through a single unified interface. The OpenCode SDK (`@opencode-ai/sdk`) is bundled — no extra installation needed. Install OpenCode with `npm i -g opencode-ai@latest`.

Supports both `start` mode (spawns local server) and `connect` mode (remote URL). See [Providers](docs/providers.md) for detailed setup.

## Commands

### Chat
Send any text message, voice note, photo, or file to chat with the AI. File attachments from the AI (screenshots, generated files) are automatically sent back as Telegram documents or photos.

### Sessions
| Command | Description |
|---------|-------------|
| `/new` | Create a new session |
| `/sessions` | List all sessions |
| `/switch <id>` | Switch to a session |
| `/delete <id>` | Delete a session |
| `/current` | Show active session |
| `/fork [messageId]` | Fork the current session |

### Monitor
| Command | Description |
|---------|-------------|
| `/todo` | View AI task checklist |
| `/diff` | Session code changes summary |
| `/diff full` | Download full diff |

### Files
| Command | Description |
|---------|-------------|
| `/read <path>` | Read a file |
| `/find <query>` | Find files by name |
| `/search <pattern>` | Search file contents |
| `/symbols <query>` | Find code symbols |
| `/status` | Git file status |

### History
| Command | Description |
|---------|-------------|
| `/history` | View conversation history |
| `/summarize` | Summarize the session |
| `/revert` | Undo last AI change |
| `/abort` | Cancel running operation |
| `/share` | Share session |

### Shell
| Command | Description |
|---------|-------------|
| `/shell <cmd>` | Run a shell command |
| `/cmd <command>` | Run an OpenCode command |
| `/commands` | List available commands |

### Models
| Command | Description |
|---------|-------------|
| `/models` | List available models with capabilities |
| `/model <provider/model>` | Set the AI model |
| `/model <name>` | Set model by partial match |

Models show capability badges: `[reasoning]` for thinking/reasoning support, `[vision]` for image input, and `[active]` for the currently selected model.

### MCP
| Command | Description |
|---------|-------------|
| `/mcp` | Show MCP server status (numbered list with action buttons) |
| `/mcp add <name> local <command...>` | Add a local MCP server |
| `/mcp add <name> remote <url>` | Add a remote MCP server |
| `/mcp remove <name>` | Remove an MCP server |

Four built-in MCP tools are available via `relay onboard`: **Browser** (Playwright), **Fetch** (web pages as markdown), **Memory** (persistent knowledge graph), and **Filesystem** (external file access). Additional servers can be added at runtime. Servers persist in the OpenCode configuration.

### Settings
| Command | Description |
|---------|-------------|
| `/system` | View system prompt |
| `/system reload` | Reload system prompt |
| `/health` | Server status (with reasoning badge) |
| `/config` | Show configuration |
| `/providers` | List available providers |
| `/agents` | List available agents |
| `/tools` | Available tools |
| `/project` | Project info |
| `/git` | Git branch and status |
| `/help` | Show all commands |

## Voice / STT

Configure speech-to-text providers during `relay onboard` or pass API keys via CLI flags. The cheapest available provider is auto-selected.

## System Prompt

The bot loads a system prompt from `~/.relay/SKILL.md` (or `./SKILL.md` in cwd for backward compatibility, or a custom path via `--system-prompt-file`). If no file exists, a default prompt is used. The file is watched for changes and reloaded automatically. Use `/system reload` to force a reload.

## Architecture

```
src/
  config/
    schema.ts      -- Config type definitions
    loader.ts      -- Config resolution (CLI > file > env > defaults)
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
    admin.ts       -- Health, config, model, models, help commands
    monitor.ts     -- Todo, diff, fork commands
    files.ts       -- File read, find, search commands
    history.ts     -- History, revert, share commands
    shell.ts       -- Shell and command execution
    mcp.ts         -- MCP server management
  utils/
    logger.ts      -- Pino-based structured logging
    store.ts       -- JSON file-backed persistence (~/.relay/)
    stream.ts      -- Streaming response handler (reasoning, chunking)
    files.ts       -- Outbound file attachment handling
    chunker.ts     -- HTML-aware Telegram message chunking
    markdown.ts    -- Markdown to Telegram HTML conversion
    errors.ts      -- Error formatting
    html.ts        -- HTML escaping for Telegram
    media.ts       -- File upload/download
    stt.ts         -- Speech-to-text
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
