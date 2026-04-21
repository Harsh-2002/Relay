# Configuration Reference

Relay uses a JSON config file at `~/.relay/config.json` in production, or `./.relay/config.json` under `--dev`. Run `relay onboard` for the interactive wizard, or pass settings via CLI flags. See [Data Directory](#data-directory) for full precedence rules.

Throughout this doc, examples show the prod path `~/.relay/config.json` — substitute `./.relay/config.json` if you're running in dev mode.

Re-running `relay onboard` enters **update mode** — shows current values and lets you press Enter to keep them, or type a new value to replace.

## Setup

```bash
relay onboard                    # Interactive wizard
relay --bot-token=xxx --allowed-user-id=123  # CLI flags
```

Config resolution order: **CLI flags > config file > defaults**.

## Subcommands

| Command | Description |
|---------|-------------|
| `relay onboard` | Interactive configuration wizard |
| `relay start` | Start the bot as a background daemon |
| `relay stop` | Stop the background daemon |
| `relay restart` | Restart the background daemon |
| `relay logs` | Tail daemon logs (Ctrl+C to exit) |
| `relay status` | Show daemon status (PID, uptime, memory) |
| `relay autostart` | Register pm2 with the OS init system so the daemon auto-starts on boot |
| `relay update` | Update Relay to the latest version and restart the daemon if running |

## CLI Flags

| Flag | Description |
|------|-------------|
| `--help`, `-h` | Show help |
| `--version`, `-v` | Show version |
| `--bot-token` | Telegram bot token |
| `--allowed-user-id` | Telegram user ID |
| `--bot-mode` | `polling` or `webhook` |
| `--webhook-url` | Webhook URL (when `--bot-mode=webhook`) |
| `--webhook-port` | Webhook port (default: 39148) |
| `--webhook-secret` | Webhook secret token |
| `--dev` | Use `./.relay/` in current directory instead of `~/.relay/` |
| `--stream-edit-interval-ms` | Stream edit interval in ms |
| `--prompt-timeout-ms` | Prompt timeout in ms |
| `--data-dir` | Data directory (default: `~/.relay/`) |
| `--system-prompt-file` | Custom system prompt file path |
| `--timezone` | IANA timezone for cron scheduling and timestamps |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `RELAY_DATA_DIR` | Bootstrap override for the data directory. Useful for containers and CI. Lower priority than `--data-dir` and `--dev` but higher than the `~/.relay/` default. |
| `NO_COLOR` | Respected by pino and clack. Set to disable ANSI colour in logs and the onboarding wizard. |

## Core Settings

| Config field | CLI flag | Default | Description |
|-------------|----------|---------|-------------|
| `botToken` | `--bot-token` | -- | Telegram bot token from [@BotFather](https://t.me/BotFather) |
| `allowedUserId` | `--allowed-user-id` | -- | Your Telegram user ID |
| `provider` | -- | `opencode` | Coding agent backend (OpenCode) |
| `timezone` | `--timezone` | `UTC` | IANA timezone for cron scheduling and timestamps (e.g. `Asia/Kolkata`, `America/New_York`) |

## Provider Configuration

Provider API keys are configured in OpenCode's environment, not in Relay.

See [Providers](providers.md) for detailed setup.

| Config field | CLI flag | Default | Description |
|-------------|----------|---------|-------------|
| `opencodeHostname` | `--opencode-hostname` | `127.0.0.1` | Bind address for the local OpenCode server |
| `opencodePort` | `--opencode-port` | `39147` | Port number for the local OpenCode server |
| `opencodeModel` | `--opencode-model` | Server default | Model override, e.g. `anthropic/claude-sonnet-4-20250514` |

## Bot Mode

| Config field | CLI flag | Default | Description |
|-------------|----------|---------|-------------|
| `botMode` | `--bot-mode` | `polling` | `polling` or `webhook` |
| `webhookUrl` | `--webhook-url` | -- | Public URL for webhook (required when mode=`webhook`) |
| `webhookPort` | `--webhook-port` | `39148` | Webhook HTTP server port |
| `webhookSecret` | `--webhook-secret` | -- | Secret token for webhook verification |

## Data Persistence

### Data Directory

Every piece of persisted state — sessions, cron jobs, watches, uploads, custom prompts — lives inside a single directory. Relay picks which directory according to this precedence:

1. **`--data-dir <path>`** (or `dataDir` in config) — an explicit path always wins.
2. **`--dev`** — resolves to `./.relay/` at the current working directory. Intended for local development while hacking on Relay itself.
3. **`RELAY_DATA_DIR` env var** — a bootstrap-time fallback, useful for containers.
4. **`~/.relay/`** — the production default for installed users.

Relay prints the active mode and directory at startup, so you always know which one is live:

```
  Relay [PROD] data=/home/alice/.relay
  Relay [DEV]  data=/home/alice/src/Relay/.relay
```

Check this line before sending commands — especially if you both develop Relay and run it as a daemon from the same machine. `npm run dev` automatically passes `--dev`; bare `relay` does not, even if you launch it from inside the repo.

| Config field | CLI flag | Default | Description |
|-------------|----------|---------|-------------|
| `dataDir` | `--data-dir` | `~/.relay/` | Directory for persisted bot state |
| — | `--dev` | off | Shortcut for `--data-dir ./.relay/` |

### Files stored

- `config.json` — Your configuration (mode `0600` where the filesystem honours it)
- `session.json` — Active session ID, selected model, agent, STT provider
- `cron.json` — Scheduled task definitions and run history
- `watch.json` — Web monitoring watch definitions, snapshots, and check history
- `RELAY.md` — Auto-generated assembled system prompt (written on every startup)
- `SKILL.md` — Custom system prompt override (optional, create manually)
- `memory.jsonl` — Memory MCP knowledge graph (auto-created when Memory is enabled)
- `uploads/` — Cached Telegram media, auto-pruned every 30 min (files older than 1 hour removed)

The repo's `.relay/` directory is excluded from git via `.gitignore`. The home-directory `~/.relay/` is never inside the repo.

## MCP Tools

Built-in MCP tools are configured during `relay onboard` (Step 5). Each runs as a local process managed by OpenCode.

| Config field | CLI flag | Default | Description |
|-------------|----------|---------|-------------|
| `browserEnabled` | -- | `false` | Headless browser via Playwright MCP |
| `fetchEnabled` | -- | `false` | Fetch web pages as markdown (requires [uvx](https://docs.astral.sh/uv/)) |
| `memoryEnabled` | -- | `false` | Persistent knowledge graph across sessions |
| `filesystemEnabled` | -- | `false` | Read/write files outside the project directory |
| `filesystemPaths` | -- | `[]` | Allowed directories for Filesystem MCP (comma-separated in wizard) |
| `githubEnabled` | -- | `false` | GitHub API access via MCP (requires PAT) |
| `githubPat` | -- | -- | GitHub Personal Access Token |
| `context7Enabled` | -- | `false` | Context7 library documentation MCP |
| `context7ApiKey` | -- | -- | Context7 API key (optional) |
| `relayMcpPort` | -- | `39149` | Port for Relay's internal MCP API (localhost-only) |

- **Browser** -- navigate URLs, take screenshots, fill forms. See [Features](features.md#headless-browser-playwright-mcp).
- **Fetch** -- read web pages as clean markdown. Requires `uvx` (Python package runner); the wizard offers to install it.
- **Memory** -- persistent knowledge graph stored in `~/.relay/memory.jsonl`. The AI stores user preferences, project facts, and decisions across sessions.
- **Filesystem** -- read/write files outside the project. Restricted to paths listed in `filesystemPaths`.
- **GitHub** -- GitHub API access for issues, PRs, commits, and more. Requires a Personal Access Token.
- **Context7** -- library documentation lookup for up-to-date API reference. Optional API key for higher rate limits.
- **Relay** -- internal MCP for AI-driven bot management (cron scheduling, notifications, health checks). Always enabled when Relay is running.

## Streaming

All responses stream in real time. The update interval controls how frequently the message is refreshed during streaming.

| Config field | CLI flag | Default | Description |
|-------------|----------|---------|-------------|
| `streamEditIntervalMs` | `--stream-edit-interval-ms` | `2000` | Draft update interval (ms) while streaming |

## Timeout

| Config field | CLI flag | Default | Description |
|-------------|----------|---------|-------------|
| `promptTimeoutMs` | `--prompt-timeout-ms` | `300000` | Max wait time for provider response (5 min) |

## Logging

Relay uses structured JSON logging via pino at `info` level. All provider interactions, SSE events, and prompt lifecycle are logged for full visibility.

## System Prompt

| Config field | CLI flag | Default | Description |
|-------------|----------|---------|-------------|
| `systemPromptFile` | `--system-prompt-file` | -- | Path to custom system prompt file |

The bot looks for a system prompt in this order:
1. Explicit path from `systemPromptFile` config
2. `{dataDir}/SKILL.md` if it exists (`~/.relay/SKILL.md` in prod, `./.relay/SKILL.md` in dev)
3. Built-in default prompt

The cwd `./SKILL.md` fallback was removed in v2.5.8 to prevent a dev-repo SKILL.md from silently shadowing the production one.

The file is watched for changes and reloaded automatically. Use `/system reload` to force a reload.

## Voice / Speech-to-Text

| Config field | CLI flag | Default | Description |
|-------------|----------|---------|-------------|
| `sttProvider` | `--stt-provider` | `auto` | STT provider: `groq`, `sarvam`, `sarvam-translate`, `openai`, `assemblyai`, or `auto` |
| `groqApiKey` | `--groq-api-key` | -- | Groq API key for Whisper |
| `sarvamApiKey` | `--sarvam-api-key` | -- | Sarvam AI API key (supports Indian languages) |
| `sarvamSttModel` | -- | `saaras:v3` | Sarvam transcription model |
| `openaiSttApiKey` | `--openai-stt-api-key` | -- | OpenAI API key for speech-to-text |
| `assemblyaiApiKey` | `--assemblyai-api-key` | -- | AssemblyAI API key |
| `groqSttModel` | -- | `whisper-large-v3-turbo` | Groq transcription model |
| `openaiSttModel` | -- | `gpt-4o-mini-transcribe` | OpenAI transcription model |

Set at least one API key during `relay onboard` to enable voice message support. When `sttProvider` is `auto` (default), the cheapest configured provider is auto-selected. If it fails, other configured providers are tried automatically.

Use `sarvam-translate` to transcribe and translate non-English voice messages to English. See [Providers](providers.md#translation-sarvam) for details.

## Example Config

```json
{
  "botToken": "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
  "allowedUserId": 987654321,
  "provider": "opencode",
  "timezone": "Asia/Kolkata",
  "groqApiKey": "gsk_..."
}
```
