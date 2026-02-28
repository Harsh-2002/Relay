# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

- **Build:** `npm run build` (runs `tsc`, outputs to `dist/`)
- **Dev mode:** `npm run dev` (watches TypeScript + restarts on changes)
- **Start:** `npm run start` (runs compiled `dist/cli.js`)
- **Type-check only:** `npx tsc --noEmit`

No test suite, linter, or formatter is configured.

## Configuration

Run `relay onboard` for the interactive setup wizard. Config is stored in `.relay/config.json`.

At minimum, you need:
- `botToken` — Telegram bot token (required)
- `allowedUserId` — Telegram user ID (required)
- `provider` — `"opencode"` (only supported value)

Provider API keys are configured in OpenCode's environment, not in Relay.

Config resolution order: CLI flags > config file > defaults.

## Architecture

Relay is a Telegram bot (built on [grammY](https://grammy.dev/)) that proxies user messages to OpenCode, which supports 75+ AI providers. It's an ES module TypeScript project targeting Node.js >= 18.

### Config System (`src/config/`)

- **`schema.ts`** — `RelayConfig` interface and `CONFIG_DEFAULTS`
- **`loader.ts`** — Config resolution: CLI args > config file > defaults
- **`setup.ts`** — Interactive setup wizard using `@inquirer/prompts`
- **`index.ts`** — Singleton accessor: `getConfig()` / `setConfig()`

### Provider Abstraction (`src/providers/`)

OpenCode is the sole backend, implementing the `Provider` interface (`src/providers/types.ts`).

- **`types.ts`** — Defines `Provider` interface, `ProviderCapabilities` flags, `PromptResult`, `StreamChunk`, `SessionInfo`, and all shared types
- **`index.ts`** — Provider factory and singleton accessor
- **`opencode.ts`** — Uses `@opencode-ai/sdk` (full feature set)

### Command System (`src/commands/`)

Commands are registered in `src/commands/index.ts` in a specific order. Each module registers Grammy handlers:

- **`chat.ts`** — Main text message handler; routes to streaming or non-streaming prompt pipeline
- **`admin.ts`** — `/health`, `/config`, `/models`, `/model`, `/help`, etc.
- **`session.ts`** — `/new`, `/sessions`, `/switch`, `/delete`, `/current`
- **`monitor.ts`** — `/todo`, `/diff`, `/fork`
- **`files.ts`** — `/read`, `/find`, `/search`, `/symbols`, `/status`
- **`history.ts`** — `/history`, `/revert`, `/unrevert`, `/abort`, `/share`, `/summarize`
- **`shell.ts`** — `/shell`, `/cmd`, `/commands`
- **`media.ts`** — Handles photos, voice notes, audio, and file uploads
- **`mcp.ts`** — `/mcp add`, `/mcp remove`

### Key Utilities (`src/utils/`)

- **`logger.ts`** — Pino-based structured logging with child loggers per component
- **`store.ts`** — `JsonStore<T>` class for atomic JSON file persistence (writes to `.relay/` directory)
- **`stream.ts`** — Streaming response handler: sends placeholder message, updates it every N seconds as chunks arrive
- **`chunker.ts`** — Splits messages at Telegram's 4096-char limit, breaking at paragraph/line/space boundaries
- **`stt.ts`** — Speech-to-text with provider fallback chain: Groq > AssemblyAI > OpenAI
- **`system-prompt.ts`** — Loads custom system prompt from `.relay/SKILL.md` (or `systemPromptFile` config), watches for hot-reload
- **`media.ts`** — Downloads Telegram files to `./uploads/`, auto-cleans files older than 1 hour
- **`errors.ts`** — Maps provider errors to user-friendly HTML-formatted Telegram messages

### Daemon Management (`src/daemon.ts`)

Background process management via pm2. All pm2 interaction is isolated in this module — users never touch pm2 directly. Provides `daemonStart()`, `daemonStop()`, `daemonRestart()`, `daemonLogs()`, and `daemonStatus()`. Auto-installs pm2 globally on first `relay start`.

### Self-Update (`src/update.ts`)

`relay update` — detects install method (npm global vs git source) and runs the appropriate update. Auto-restarts the daemon if running.

### State & Session Management

- **`src/session.ts`** — Tracks active session ID and selected model, persisted to `.relay/session.json`. Uses a mutex to prevent race conditions on concurrent messages.
- **`src/auth.ts`** — Single-user auth via `initAuth(userId)` + rate limiting (30 req/min).
- **`src/bot.ts`** — Creates grammY bot instance, applies auth middleware, registers commands.
- **`src/cli.ts`** — CLI entry point: handles `onboard` subcommand, `--help`, `--version`, auto-detects first run.
- **`src/index.ts`** — Bot startup: loads config, inits provider, starts bot in polling or webhook mode.

### Persistence (`.relay/` directory)

State is persisted via `JsonStore` to `.relay/`:
- `config.json` — User configuration (0600 permissions)
- `session.json` — Active session ID and selected model
- `SKILL.md` — Custom system prompt (optional)

### Bot Modes

- **Polling** (default): Long-polling via `bot.start()`
- **Webhook**: HTTP server via grammY's `webhookCallback()`, configured with `botMode: "webhook"` in config

## Key Patterns

- **Config access**: Use `getConfig()` from `src/config/index.js` to read config values. Never read `process.env` directly for config values.
- **Capability checks**: Always check `provider.capabilities.<flag>` before calling optional methods. Commands respond with "not supported" when the active provider lacks a capability.
- **Bundled SDK**: The OpenCode SDK (`@opencode-ai/sdk`) is bundled as a dependency.
- **Streaming**: When `streamingEnabled` is true in config, `src/utils/stream.ts` sends an initial message then edits it in-place as chunks arrive. The edit interval is configurable via `streamEditIntervalMs`.
- **Telegram constraints**: Messages are HTML-formatted, max 4096 chars (chunked by `src/utils/chunker.ts`). File uploads max 20MB. Use `src/utils/html.ts` for escaping.
- **File imports**: All local imports use `.js` extensions (ESM with NodeNext resolution), e.g., `import { foo } from "./bar.js"`.
