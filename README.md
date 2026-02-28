# Relay

Telegram bot for managing AI coding agents remotely. Supports [OpenCode](https://github.com/opencode-ai/opencode), [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview), and [OpenAI Codex](https://github.com/openai/codex).

## Features

- **Multi-provider** -- switch between OpenCode, Claude Code, and Codex with a single env var
- **Text, voice, photo, and file input** -- send messages in any format
- **File output** -- receive screenshots, generated files, and artifacts as Telegram attachments (OpenCode)
- **Streaming responses** -- progressive message editing for real-time output
- **Session management** -- create, switch, fork, delete, and list sessions
- **Dynamic model selection** -- models fetched from provider APIs, always up to date
- **MCP servers** -- add, remove, and monitor MCP servers at runtime (OpenCode, Claude)
- **Shell access** -- run commands on the coding agent's machine
- **Voice transcription** -- Groq, OpenAI, or AssemblyAI speech-to-text
- **Custom system prompts** -- load from file, hot-reload on change
- **File operations** -- read, find, search, and browse project files (all providers)
- **Code diffs** -- view git diffs from sessions (all providers)
- **State persistence** -- sessions, model selection, and MCP configs survive restarts
- **Webhook mode** -- deploy with webhooks for lower latency in production
- **Large file support** -- text files up to 500KB fully included, larger files chunked

## Documentation

| Guide | Description |
|-------|-------------|
| [Getting Started](docs/getting-started.md) | Installation, prerequisites, first steps |
| [Configuration](docs/configuration.md) | All environment variables and options |
| [Providers](docs/providers.md) | Detailed setup for each provider |
| [Commands](docs/commands.md) | Full command reference with examples |
| [Features](docs/features.md) | Streaming, file attachments, voice, MCP, models |
| [Troubleshooting](docs/troubleshooting.md) | Common issues and solutions |

## Install

### From npm

```bash
npm install -g @4via6/relay
```

Then create a `.env` file in your working directory (see [Configuration](docs/configuration.md)):

```bash
curl -O https://raw.githubusercontent.com/Harsh-2002/Relay/main/.env.example
# Edit .env with your BOT_TOKEN, ALLOWED_USER_ID, and provider config
relay
```

### From source

```bash
git clone https://github.com/Harsh-2002/Relay.git
cd Relay
npm install
npm run build
cp .env.example .env
# Edit .env with your BOT_TOKEN, ALLOWED_USER_ID, and provider config
npm start
```

### With npx (no install)

```bash
npx @4via6/relay
```

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18 (or [Bun](https://bun.sh/))
- A Telegram bot token (from [@BotFather](https://t.me/BotFather))
- Provider credentials (see below)

## Providers

Set `PROVIDER` in `.env` to select your coding agent backend.

| Provider | `PROVIDER=` | Required env vars | Install |
|----------|-------------|-------------------|---------|
| OpenCode | `opencode` | `OPENCODE_MODE` | included |
| Claude Code | `claude` | `ANTHROPIC_API_KEY` | `npm install @anthropic-ai/claude-code` |
| OpenAI Codex | `codex` | `CODEX_API_KEY` or `OPENAI_API_KEY` | `npm install @openai/codex` |

### OpenCode

```env
PROVIDER=opencode
OPENCODE_MODE=start           # "start" (spawn server) or "connect" (remote URL)
OPENCODE_URL=http://localhost:4096
```

### Claude Code

```env
PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=sonnet           # use /models to see all available
CLAUDE_PERMISSION_MODE=acceptEdits
```

### OpenAI Codex

```env
PROVIDER=codex
CODEX_API_KEY=sk-...
CODEX_MODEL=o3                # use /models to see all available
```

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
| `/todo` | View AI task checklist (OpenCode) |
| `/diff` | Session code changes summary |
| `/diff full` | Download full diff |

### Files
| Command | Description |
|---------|-------------|
| `/read <path>` | Read a file |
| `/find <query>` | Find files by name |
| `/search <pattern>` | Search file contents |
| `/symbols <query>` | Find code symbols (OpenCode) |
| `/status` | Git file status |

### History
| Command | Description |
|---------|-------------|
| `/history` | View conversation history |
| `/summarize` | Summarize the session |
| `/revert` | Undo last AI change |
| `/abort` | Cancel running operation |
| `/share` | Share session (OpenCode) |

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

### MCP (OpenCode, Claude)
| Command | Description |
|---------|-------------|
| `/mcp` | Show MCP server status |
| `/mcp add <name> local <command...>` | Add a local MCP server |
| `/mcp add <name> remote <url>` | Add a remote MCP server |
| `/mcp remove <name>` | Remove an MCP server |

MCP servers extend the AI's capabilities with additional tools (browsers, databases, APIs). OpenCode supports full runtime management; Claude persists MCP config to disk and restores it on restart.

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

Configure one or more speech-to-text providers for voice message support. The cheapest available provider is auto-selected.

```env
GROQ_API_KEY=...          # Groq Whisper (fastest, free tier)
OPENAI_API_KEY=...        # OpenAI Whisper
ASSEMBLYAI_API_KEY=...    # AssemblyAI
```

## System Prompt

The bot loads a system prompt from `skill.md` in the project root (or the path set in `SYSTEM_PROMPT_FILE`). If the file doesn't exist, a default prompt is used. The file is watched for changes and reloaded automatically. Use `/system reload` to force a reload.

## Architecture

```
src/
  providers/
    types.ts       -- Provider interface, capabilities, MCP/model types
    index.ts       -- Provider factory (selects based on PROVIDER env var)
    opencode.ts    -- OpenCode SDK provider
    claude.ts      -- Claude Code / Agent SDK provider
    codex.ts       -- OpenAI Codex SDK provider
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
    store.ts       -- JSON file-backed persistence (.relay/)
    stream.ts      -- Streaming response handler
    files.ts       -- Outbound file attachment handling
    chunker.ts     -- Telegram message chunking
    errors.ts      -- Error formatting
    html.ts        -- HTML escaping for Telegram
    media.ts       -- File upload/download
    stt.ts         -- Speech-to-text
    system-prompt.ts -- System prompt loading
    timeout.ts     -- Prompt timeout utility
```

Each provider implements the `Provider` interface with a `capabilities` object declaring which features it supports. Commands check capabilities and show appropriate messages when a feature isn't available.

### Provider Capabilities

| Capability | OpenCode | Claude | Codex |
|-----------|----------|--------|-------|
| Streaming | yes | yes | yes |
| File output | yes | no | no |
| MCP management | yes | yes | no |
| Model listing | dynamic | dynamic | dynamic |
| Session management | full | limited | limited |
| File operations | yes | yes | yes |
| Code diffs | yes | yes | yes |
| State persistence | yes | yes | yes |

## License

MIT
