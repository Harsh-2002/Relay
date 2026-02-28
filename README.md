# OCBot

Telegram bot for managing AI coding agents remotely. Supports [OpenCode](https://github.com/opencode-ai/opencode), [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview), and [OpenAI Codex](https://github.com/openai/codex).

## Features

- **Multi-provider** -- switch between OpenCode, Claude Code, and Codex with a single env var
- **Text, voice, photo, and file input** -- send messages in any format
- **Streaming responses** -- progressive message editing for real-time output
- **Session management** -- create, switch, fork, delete, and list sessions
- **Shell access** -- run commands on the coding agent's machine
- **Voice transcription** -- Groq, OpenAI, or AssemblyAI speech-to-text
- **Custom system prompts** -- load from file, hot-reload on change
- **File operations** -- read, find, search, and browse project files (OpenCode)
- **Monitoring** -- todo lists, diffs, and session history (OpenCode)

## Quick Start

```bash
git clone https://github.com/your-org/ocbot.git
cd ocbot
cp .env.example .env
# Edit .env with your BOT_TOKEN, ALLOWED_USER_ID, and provider config
bun install
bun start
```

### Prerequisites

- [Bun](https://bun.sh/) runtime
- A Telegram bot token (from [@BotFather](https://t.me/BotFather))
- Provider credentials (see below)

## Providers

Set `PROVIDER` in `.env` to select your coding agent backend.

| Provider | `PROVIDER=` | Required env vars | Install |
|----------|-------------|-------------------|---------|
| OpenCode | `opencode` | `OPENCODE_MODE` | included |
| Claude Code | `claude` | `ANTHROPIC_API_KEY` | `bun add @anthropic-ai/claude-code` |
| OpenAI Codex | `codex` | `CODEX_API_KEY` or `OPENAI_API_KEY` | `bun add @openai/codex` |

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
CLAUDE_MODEL=sonnet           # sonnet | opus | haiku
CLAUDE_PERMISSION_MODE=acceptEdits
```

### OpenAI Codex

```env
PROVIDER=codex
CODEX_API_KEY=sk-...
CODEX_MODEL=o3                # o3 | o4-mini
```

## Commands

### Chat
Send any text message, voice note, photo, or file to chat with the AI.

### Sessions
| Command | Description |
|---------|-------------|
| `/new` | Create a new session |
| `/sessions` | List all sessions |
| `/switch <id>` | Switch to a session |
| `/delete <id>` | Delete a session |
| `/current` | Show active session |
| `/fork [messageId]` | Fork the current session |

### Monitor (OpenCode only)
| Command | Description |
|---------|-------------|
| `/todo` | View AI task checklist |
| `/diff` | Session code changes summary |
| `/diff full` | Download full diff |

### Files (OpenCode only)
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
| `/share` | Share session (OpenCode) |

### Shell
| Command | Description |
|---------|-------------|
| `/shell <cmd>` | Run a shell command |
| `/cmd <command>` | Run an OpenCode command |
| `/commands` | List available commands |

### Settings
| Command | Description |
|---------|-------------|
| `/model <provider/model>` | Set the AI model |
| `/system` | View system prompt |
| `/system reload` | Reload system prompt |
| `/health` | Server status |
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
    types.ts       -- Provider interface and shared types
    index.ts       -- Provider factory (selects based on PROVIDER env var)
    opencode.ts    -- OpenCode SDK provider
    claude.ts      -- Claude Code / Agent SDK provider
    codex.ts       -- OpenAI Codex SDK provider
  commands/
    chat.ts        -- Text message handler
    session.ts     -- Session management commands
    media.ts       -- Photo, voice, audio, file handlers
    admin.ts       -- Health, config, model, help commands
    monitor.ts     -- Todo, diff, fork commands
    files.ts       -- File read, find, search commands
    history.ts     -- History, revert, share commands
    shell.ts       -- Shell and command execution
  utils/
    stream.ts      -- Streaming response handler
    chunker.ts     -- Telegram message chunking
    errors.ts      -- Error formatting
    html.ts        -- HTML escaping for Telegram
    media.ts       -- File upload/download
    stt.ts         -- Speech-to-text
    system-prompt.ts -- System prompt loading
    timeout.ts     -- Prompt timeout utility
```

Each provider implements the `Provider` interface with a `capabilities` object declaring which features it supports. Commands check capabilities and show appropriate messages when a feature isn't available.

## License

MIT
