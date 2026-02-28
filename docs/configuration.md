# Configuration Reference

All configuration is done through environment variables in the `.env` file. Copy `.env.example` to `.env` to get started.

## Required Variables

| Variable | Description |
|----------|-------------|
| `BOT_TOKEN` | Telegram bot token from [@BotFather](https://t.me/BotFather) |
| `ALLOWED_USER_ID` | Your Telegram user ID (only this user can interact with the bot) |
| `PROVIDER` | Which coding agent to use: `opencode`, `claude`, or `codex` |

## Provider Configuration

Each provider has its own set of required and optional variables. See [Providers](providers.md) for detailed setup.

### OpenCode

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENCODE_MODE` | No | `start` | `start` spawns a local server, `connect` connects to a remote URL |
| `OPENCODE_URL` | No | `http://localhost:4096` | Server URL (used when `MODE=connect`) |
| `OPENCODE_HOSTNAME` | No | `127.0.0.1` | Bind address (used when `MODE=start`) |
| `OPENCODE_PORT` | No | `4096` | Port number (used when `MODE=start`) |
| `OPENCODE_MODEL` | No | Server default | Model override, e.g. `anthropic/claude-sonnet-4-20250514` |

### Claude Code

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes | -- | Anthropic API key |
| `CLAUDE_MODEL` | No | `sonnet` | Model name or ID (use `/models` to see all available) |
| `CLAUDE_PERMISSION_MODE` | No | `acceptEdits` | How Claude handles file edits |
| `CLAUDE_CWD` | No | Current directory | Working directory for Claude |

### OpenAI Codex

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CODEX_API_KEY` | Yes* | -- | OpenAI API key (*or use `OPENAI_API_KEY`) |
| `CODEX_MODEL` | No | `o3` | Model name or ID (use `/models` to see all available) |
| `CODEX_CWD` | No | Current directory | Working directory for Codex |

## Bot Mode

| Variable | Default | Description |
|----------|---------|-------------|
| `BOT_MODE` | `polling` | `polling` for long-polling, `webhook` for webhook mode |
| `WEBHOOK_URL` | -- | Public URL for receiving Telegram updates (required when `BOT_MODE=webhook`) |
| `WEBHOOK_PORT` | `3000` | Port for the webhook HTTP server |
| `WEBHOOK_SECRET` | -- | Optional secret token for webhook verification |

### Long Polling (default)

The bot connects to Telegram and pulls updates. Simple to set up, works behind NATs/firewalls.

```env
BOT_MODE=polling
```

### Webhook Mode

The bot runs an HTTP server and Telegram pushes updates to it. Lower latency and better for production deployments.

```env
BOT_MODE=webhook
WEBHOOK_URL=https://your-server.com/bot
WEBHOOK_PORT=3000
WEBHOOK_SECRET=your-random-secret
```

Requirements:
- A public HTTPS URL that Telegram can reach
- The port must be accessible (default: 3000)

## Data Persistence

| Variable | Default | Description |
|----------|---------|-------------|
| `RELAY_DATA_DIR` | `.relay/` | Directory for persisted bot state |

Relay persists session state, model selection, and provider-specific data to disk so they survive restarts. The `.relay/` directory is created automatically in the project root.

Files stored:
- `session.json` — Active session ID and selected model
- `claude-mcp.json` — Claude provider MCP server configurations
- `codex-threads.json` — Codex provider thread ID mappings

The directory is excluded from git via `.gitignore`.

## Streaming

| Variable | Default | Description |
|----------|---------|-------------|
| `STREAMING_ENABLED` | `false` | Enable progressive message editing during AI responses |
| `STREAM_EDIT_INTERVAL_MS` | `2000` | How often (in ms) to update the Telegram message while streaming |

When streaming is enabled, the bot sends a "Thinking..." placeholder and progressively updates it as the AI generates its response. This works with all three providers.

## Timeout

| Variable | Default | Description |
|----------|---------|-------------|
| `PROMPT_TIMEOUT_MS` | `300000` | Maximum time (in ms) to wait for a provider response. Default is 5 minutes. |

If the AI takes longer than this to respond, the request is cancelled and an error message is shown.

## System Prompt

| Variable | Default | Description |
|----------|---------|-------------|
| `SYSTEM_PROMPT_FILE` | `skill.md` | Path to your custom system prompt file |

The bot looks for a file named `skill.md` in the project root. If found, its contents are prepended to every message sent to the AI. If the file doesn't exist, a built-in default prompt is used.

The file is watched for changes and reloaded automatically. You can also force a reload with `/system reload`.

See [Features > System Prompt](features.md#system-prompt) for details on customizing the prompt.

## Voice / Speech-to-Text

| Variable | Default | Description |
|----------|---------|-------------|
| `STT_PROVIDER` | `auto` | STT provider: `groq`, `openai`, `assemblyai`, or `auto` |
| `GROQ_API_KEY` | -- | Groq API key for Whisper |
| `GROQ_STT_MODEL` | `whisper-large-v3-turbo` | Groq transcription model |
| `OPENAI_API_KEY` | -- | OpenAI API key for Whisper |
| `OPENAI_STT_MODEL` | `gpt-4o-mini-transcribe` | OpenAI transcription model |
| `ASSEMBLYAI_API_KEY` | -- | AssemblyAI API key |

Set at least one API key to enable voice message support. When `STT_PROVIDER=auto` (default), the cheapest available provider is selected automatically:

1. **Groq** (fastest, has a free tier)
2. **AssemblyAI**
3. **OpenAI**

## Example `.env` File

```env
# Telegram
BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
ALLOWED_USER_ID=987654321

# Provider
PROVIDER=opencode
OPENCODE_MODE=start

# Bot mode (polling or webhook)
BOT_MODE=polling

# Streaming
STREAMING_ENABLED=true
STREAM_EDIT_INTERVAL_MS=2000

# Timeout
PROMPT_TIMEOUT_MS=300000

# Voice (set at least one for voice support)
GROQ_API_KEY=gsk_...
```
