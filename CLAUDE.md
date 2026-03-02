# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

- **Build:** `npm run build` (runs `tsc`, outputs to `dist/`)
- **Dev mode:** `npm run dev` (watches TypeScript + restarts on changes)
- **Start:** `npm run start` (runs compiled `dist/cli.js`)
- **Type-check only:** `npx tsc --noEmit`

No test suite, linter, or formatter is configured.

## Configuration

Run `relay onboard` for the interactive setup wizard. Config is stored in `~/.relay/config.json` (global). Use `--dev` flag to use `./.relay/` in the current directory instead.

Re-running `relay onboard` on an existing config enters **update mode** — shows current values and lets you press Enter to keep them, or type a new value to replace.

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
- **`setup.ts`** — Interactive setup wizard using `@clack/prompts`. 5-step flow: OpenCode → Bot Token → User ID → MCP Tools → Voice. Supports new config creation and update mode (re-running shows current values, Enter to keep). Detects OpenCode installation, checks for uvx when Fetch MCP is selected, prompts for filesystem paths. Cross-platform (Linux/macOS/Windows)
- **`index.ts`** — Singleton accessor: `getConfig()` / `setConfig()`

### Provider Abstraction (`src/providers/`)

OpenCode is the sole backend, implementing the `Provider` interface (`src/providers/types.ts`).

- **`types.ts`** — Defines `Provider` interface, `ProviderCapabilities` flags, `PromptResult`, `StreamChunk`, `SessionInfo`, and all shared types
- **`index.ts`** — Provider factory and singleton accessor
- **`opencode.ts`** — Uses `@opencode-ai/sdk` (full feature set). Session matching for `message.part.updated` events uses `part.sessionID` (v2 API puts sessionID on the part object, not at top-level props). Extracts tool attachments (e.g. Playwright screenshots) from `state.attachments` and yields them as file chunks.

### Command System (`src/commands/`)

Commands are registered in `src/commands/index.ts` in a specific order. Each module registers Grammy handlers:

- **`chat.ts`** — Main text message handler; routes to streaming prompt pipeline. Supports reply-to-message context and edited message re-prompting
- **`admin.ts`** — `/health`, `/config`, `/models`, `/model`, `/stt`, `/agent`, `/agents`, `/system`, `/help`, `/project`, `/git`, `/tools`, `/providers`, `/start`
- **`session.ts`** — `/new`, `/sessions`, `/switch`, `/delete`, `/current`, `/rename`
- **`monitor.ts`** — `/todo`, `/diff`, `/fork`
- **`files.ts`** — `/ls`, `/read`, `/find`, `/search`, `/symbols`, `/status`
- **`history.ts`** — `/history`, `/revert`, `/unrevert`, `/abort`, `/share`, `/unshare`, `/summarize`
- **`shell.ts`** — `/shell`, `/cmd`, `/commands`
- **`media.ts`** — Handles photos, voice notes, audio, and file uploads
- **`mcp.ts`** — `/mcp add`, `/mcp remove`, `/mcp connect`

### Key Utilities (`src/utils/`)

- **`logger.ts`** — Pino-based structured logging with child loggers per component
- **`store.ts`** — `JsonStore<T>` class for atomic JSON file persistence (writes to `~/.relay/` directory)
- **`stream.ts`** — Streaming response handler: sends a "Thinking." message via `sendMessage`, then edits it in-place via `editMessageText` as chunks arrive. Handles reasoning blockquotes, markdown→HTML, chunking. Strips markdown image syntax (`![]()`; code-block aware) since Telegram can't render inline images. Auto-closes unclosed code fences during intermediate edits; shows tail-end for long responses (>4000 chars); 120-second stall detection in opencode.ts
- **`markdown.ts`** — Markdown to Telegram HTML converter: handles bold, italic, strikethrough, code, links, blockquotes, tables. Guards against false-positive italic on math expressions
- **`chunker.ts`** — HTML-aware message chunker: splits at Telegram's 4096-char limit while tracking open HTML tags across chunk boundaries (closes at end, re-opens at start of next chunk)
- **`html.ts`** — HTML escaping for Telegram (`&`, `<`, `>`, `"`)
- **`files.ts`** — Outbound file attachment handling: extracts file parts from provider responses and tool attachments, sends images via `sendPhoto` (no caption) and other files via `sendDocument`. Resolves both base64 data URLs and HTTP URLs
- **`stt.ts`** — Speech-to-text with provider fallback chain: Groq > Sarvam > AssemblyAI > OpenAI. Sarvam supports batch jobs for audio >30s and a translate-to-English mode
- **`system-prompt.ts`** — Loads custom system prompt from `~/.relay/SKILL.md` (or `systemPromptFile` config), watches for hot-reload. Conditionally appends MCP tool instructions (Browser, Fetch, Memory, Filesystem) based on config flags. Appends fresh IST timestamp to every prompt
- **`media.ts`** — Downloads Telegram files to `./uploads/`, auto-cleans files older than 1 hour
- **`errors.ts`** — Maps provider errors to user-friendly HTML-formatted Telegram messages
- **`opencode-config.ts`** — Auto-injects MCP server configs into OpenCode's config (`~/.config/opencode/opencode.json`). Supports all 4 built-in MCPs: Playwright, Fetch (uvx), Memory (with `MEMORY_FILE_PATH` env var pointing to `dataDir/memory.jsonl`), Filesystem (with user-specified paths). Provides `ensure*Mcp()` and `remove*Mcp()` for each. Idempotent — skips if already configured

### Daemon Management (`src/daemon.ts`)

Background process management via pm2. All pm2 interaction is isolated in this module — users never touch pm2 directly. Provides `daemonStart()`, `daemonStop()`, `daemonRestart()`, `daemonLogs()`, and `daemonStatus()`. Auto-installs pm2 globally on first `relay start`.

### Self-Update (`src/update.ts`)

`relay update` — detects install method (npm global vs git source) and runs the appropriate update. Auto-restarts the daemon if running.

### State & Session Management

- **`src/session.ts`** — Tracks active session ID and selected model, persisted to `~/.relay/session.json`. Uses a mutex to prevent race conditions on concurrent messages. Exports `withPromptQueue()` for serial prompt execution (prevents SSE stream interleaving).
- **`src/auth.ts`** — Single-user auth via `initAuth(userId)` + rate limiting (30 req/min) with countdown timer.
- **`src/bot.ts`** — Creates grammY bot instance, applies auth middleware, registers commands.
- **`src/cli.ts`** — CLI entry point: handles `onboard` subcommand, `--help`, `--version`, auto-detects first run. Passes existing config to setup wizard for update mode.
- **`src/index.ts`** — Bot startup: loads config, inits provider, auto-configures enabled MCP tools (Playwright, Fetch, Memory, Filesystem) in OpenCode config, starts bot in polling or webhook mode.

### Persistence (`~/.relay/` directory)

State is persisted via `JsonStore` to `~/.relay/` (or `./.relay/` in dev mode):
- `config.json` — User configuration (0600 permissions)
- `session.json` — Active session ID and selected model
- `SKILL.md` — Custom system prompt (optional)
- `memory.jsonl` — Memory MCP knowledge graph data (auto-created when Memory MCP is enabled)

### Bot Modes

- **Polling** (default): Long-polling via `bot.start()`
- **Webhook**: HTTP server via grammY's `webhookCallback()`, configured with `botMode: "webhook"` in config

## Key Patterns

- **Config access**: Use `getConfig()` from `src/config/index.js` to read config values. Never read `process.env` directly for config values.
- **Capability checks**: Always check `provider.capabilities.<flag>` before calling optional methods. Commands respond with "not supported" when the active provider lacks a capability.
- **Bundled SDK**: The OpenCode SDK (`@opencode-ai/sdk`) is bundled as a dependency.
- **Streaming**: All responses stream via `src/utils/stream.ts`. A single message is sent via `sendMessage("Thinking.")`, then edited in-place via `editMessageText` as chunks arrive (throttled by `streamEditIntervalMs`). Final response is also an edit. This avoids the pinned notification banner that `sendMessageDraft` causes. Auto-closes unclosed code fences during intermediate edits.
- **Prompt queue**: All prompt execution (chat and media) is wrapped in `withPromptQueue()` from `src/session.ts` to serialize concurrent messages and prevent SSE stream interleaving.
- **Reasoning display**: AI thinking/reasoning is shown in Telegram expandable blockquotes (`<blockquote expandable>`) above the answer. For large responses, reasoning is sent as a separate message.
- **Reply context**: When users reply to a bot message, the quoted text is prepended to the prompt as `[Replying to: "..."]`.
- **Edited messages**: Edited user messages are handled via grammY's `edited_message:text` event, prefixed with `[Edited message]`.
- **Telegram constraints**: Messages are HTML-formatted, max 4096 chars (chunked by `src/utils/chunker.ts` which is HTML-aware — tracks open tags across chunks). File uploads max 20MB. Use `src/utils/html.ts` for escaping.
- **Tool attachments**: Tool results (e.g. Playwright screenshots) carry file attachments in `state.attachments`. These are yielded as `file` chunks by `opencode.ts`, collected by `stream.ts`, and sent to Telegram via `files.ts` as separate photo/document messages.
- **Media in text**: Markdown image syntax (`![alt](url)`) is stripped from text responses in `stream.ts` (code-block aware) since Telegram cannot render inline images. The system prompt also instructs the AI not to reference screenshots in text.
- **File imports**: All local imports use `.js` extensions (ESM with NodeNext resolution), e.g., `import { foo } from "./bar.js"`.
