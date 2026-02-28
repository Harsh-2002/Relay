# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

- **Build:** `npm run build` (runs `tsc`, outputs to `dist/`)
- **Dev mode:** `npm run dev` (watches TypeScript + restarts on changes)
- **Start:** `npm run start` (runs compiled `dist/cli.js`)
- **Type-check only:** `npx tsc --noEmit`

No test suite, linter, or formatter is configured.

## Environment Setup

Copy `.env.example` to `.env` and set at minimum:
- `BOT_TOKEN` — Telegram bot token (required)
- `ALLOWED_USER_ID` — Telegram user ID (required)
- `PROVIDER` — `"opencode"` (default), `"claude"`, or `"codex"`

Each provider requires its own credentials (see `.env.example` for all options).

## Architecture

OCBot is a Telegram bot (built on [grammY](https://grammy.dev/)) that proxies user messages to AI coding agent backends. It's an ES module TypeScript project targeting Node.js >= 18.

### Provider Abstraction (`src/providers/`)

The core design pattern: three interchangeable AI backends behind a common `Provider` interface (`src/providers/types.ts`).

- **`types.ts`** — Defines `Provider` interface, `ProviderCapabilities` flags, `PromptResult`, `StreamChunk`, `SessionInfo`, and all shared types
- **`index.ts`** — Factory that reads `PROVIDER` env var and dynamically imports the matching provider class
- **`opencode.ts`** — Uses `@opencode-ai/sdk` (full feature set)
- **`claude.ts`** — Uses `@anthropic-ai/claude-code` (optional dependency)
- **`codex.ts`** — Uses `@openai/codex` (optional dependency)

Each provider declares its capabilities via `ProviderCapabilities` (streaming, todos, diff, fork, revert, history, fileOps, shell, mcp, etc.). Commands check capabilities before calling provider methods — this is how the bot gracefully degrades across providers.

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

- **`store.ts`** — `JsonStore<T>` class for atomic JSON file persistence (writes to `.ocbot/` directory)
- **`stream.ts`** — Streaming response handler: sends placeholder message, updates it every N seconds as chunks arrive
- **`chunker.ts`** — Splits messages at Telegram's 4096-char limit, breaking at paragraph/line/space boundaries
- **`stt.ts`** — Speech-to-text with provider fallback chain: Groq > AssemblyAI > OpenAI
- **`system-prompt.ts`** — Loads custom system prompt from `skill.md` (or `SYSTEM_PROMPT_FILE`), watches for hot-reload
- **`media.ts`** — Downloads Telegram files to `./uploads/`, auto-cleans files older than 1 hour
- **`errors.ts`** — Maps provider errors to user-friendly HTML-formatted Telegram messages

### State & Session Management

- **`src/session.ts`** — Tracks active session ID and selected model, persisted to `.ocbot/session.json`. Uses a mutex to prevent race conditions on concurrent messages.
- **`src/auth.ts`** — Single-user auth via `ALLOWED_USER_ID` + rate limiting (30 req/min).
- **`src/bot.ts`** — Creates grammY bot instance, applies auth middleware, registers commands.
- **`src/index.ts`** — Entry point: validates env, inits provider, starts bot in polling or webhook mode.

### Persistence (`.ocbot/` directory)

State is persisted via `JsonStore` to `.ocbot/`:
- `session.json` — Active session ID and selected model
- `claude-mcp.json` — Claude provider MCP server configs
- `codex-threads.json` — Codex thread ID mappings

### Bot Modes

- **Polling** (default): Long-polling via `bot.start()`
- **Webhook**: HTTP server via grammY's `webhookCallback()`, configured with `BOT_MODE=webhook`

## Key Patterns

- **Capability checks**: Always check `provider.capabilities.<flag>` before calling optional methods. Commands respond with "not supported" when the active provider lacks a capability.
- **Optional dependencies**: `@anthropic-ai/claude-code` and `@openai/codex` are optional deps. Provider files use dynamic `import()` and handle import failures gracefully.
- **Streaming**: When `STREAMING_ENABLED=true`, `src/utils/stream.ts` sends an initial message then edits it in-place as chunks arrive. The edit interval is configurable via `STREAM_EDIT_INTERVAL_MS`.
- **Telegram constraints**: Messages are HTML-formatted, max 4096 chars (chunked by `src/utils/chunker.ts`). File uploads max 20MB. Use `src/utils/html.ts` for escaping.
- **File imports**: All local imports use `.js` extensions (ESM with NodeNext resolution), e.g., `import { foo } from "./bar.js"`.
