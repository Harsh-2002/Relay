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

- **`schema.ts`** — `RelayConfig` interface and `CONFIG_DEFAULTS`. Includes `timezone` field (IANA, defaults to `"UTC"`). OpenCode always runs locally (no remote connect mode)
- **`loader.ts`** — Config resolution: CLI args > config file > defaults
- **`setup.ts`** — Interactive setup wizard using `@clack/prompts`. 6-step flow: OpenCode (install check) → Bot Token → User ID → Timezone → MCP Tools → Voice. Timezone step uses a select picker with 43 common timezones grouped by region (Americas, Europe, Asia, Africa, Oceania, UTC), auto-detected timezone shown at top, plus a "type manually" option for any IANA timezone. In update mode, "Keep current" appears at top. Supports new config creation and update mode (re-running shows current values, Enter to keep). Detects OpenCode installation, checks for uvx when Fetch MCP is selected, prompts for filesystem paths, GitHub PAT, and optional Context7 API key. Cross-platform (Linux/macOS/Windows). OpenCode always runs locally alongside Relay (no remote mode selection in onboarding)
- **`index.ts`** — Singleton accessor: `getConfig()` / `setConfig()`

### Provider Abstraction (`src/providers/`)

OpenCode is the sole backend, implementing the `Provider` interface (`src/providers/types.ts`).

- **`types.ts`** — Defines `Provider` interface (includes `getPort(): number | null`), `ProviderCapabilities` flags, `PromptResult`, `StreamChunk`, `SessionInfo`, and all shared types
- **`index.ts`** — Provider factory and singleton accessor
- **`opencode.ts`** — Uses `@opencode-ai/sdk` (full feature set). Session matching for `message.part.updated` events uses `part.sessionID` (v2 API puts sessionID on the part object, not at top-level props). Extracts tool attachments (e.g. Playwright screenshots) from `state.attachments` and yields them as file chunks. Tracks `activePort` for the OpenCode server, exposed via `getPort()`. Does NOT send `body.system` — system prompt is delivered via OpenCode's `instructions` config (file-based). Handles `question.asked` and `permission.asked` events globally (not session-filtered) to support sub-agents. Provides `replyToQuestion()` and `rejectQuestion()` methods.

### Command System (`src/commands/`)

Commands are registered in `src/commands/index.ts` in a specific order. Each module registers Grammy handlers:

- **`question.ts`** — Interactive AI question forwarding to Telegram. Supports single-select (inline keyboard), multi-question batch (step-by-step flow), multi-select (toggle checkboxes), and no-options (Yes/No) modes. "Type answer..." button triggers `force_reply` for free-text input via `pendingTextQuestions` Map. `startQuestionFlow()` cleans up stale flows for the chat before creating new ones. `cleanupQuestionFlow()` is async — on timeout, edits the Telegram message to show "Auto-replied" and removes the keyboard. Flow state stores `api` reference for this purpose
- **`chat.ts`** — Main text message handler; routes to streaming prompt pipeline. Supports reply-to-message context and edited message re-prompting. Edited messages do NOT consume pending typed answers (only new messages do)
- **`admin.ts`** — `/health`, `/config`, `/models`, `/model`, `/stt`, `/agent`, `/agents`, `/system`, `/help`, `/project`, `/git`, `/tools`, `/providers`, `/start`, `/timezone`, `/restart`, `/update`
- **`session.ts`** — `/new`, `/sessions`, `/switch`, `/delete`, `/current`, `/rename`
- **`monitor.ts`** — `/todo`, `/diff`, `/fork`
- **`files.ts`** — `/ls`, `/read`, `/find`, `/search`, `/symbols`, `/status`
- **`history.ts`** — `/history`, `/revert`, `/unrevert`, `/abort`, `/share`, `/unshare`, `/summarize`
- **`shell.ts`** — `/shell`, `/cmd`, `/commands`. Blocks `relay restart/stop/start/update` in `/shell` to prevent killing the bot process (directs users to `/restart` or `/update` instead)
- **`media.ts`** — Handles photos, voice notes, audio, and file uploads
- **`mcp.ts`** — `/mcp add`, `/mcp remove`, `/mcp connect`

### Key Utilities (`src/utils/`)

- **`logger.ts`** — Pino-based structured logging with child loggers per component
- **`store.ts`** — `JsonStore<T>` class for atomic JSON file persistence (writes to `~/.relay/` directory). Exports `setDataDir()` / `getDataDir()` for dev/prod path switching
- **`stream.ts`** — Streaming response handler: sends a "Thinking." message via `sendMessage`, then edits it in-place via `editMessageText` as chunks arrive. Handles reasoning blockquotes, markdown→HTML, chunking. Strips markdown image syntax (`![]()`; code-block aware) since Telegram can't render inline images. Auto-closes unclosed code fences during intermediate edits; shows tail-end for long responses (>4000 chars); 120-second stall detection in opencode.ts
- **`markdown.ts`** — Markdown to Telegram HTML converter: handles bold, italic, strikethrough, code, links, blockquotes, tables. Guards against false-positive italic on math expressions
- **`chunker.ts`** — HTML-aware message chunker: splits at Telegram's 4096-char limit while tracking open HTML tags across chunk boundaries (closes at end, re-opens at start of next chunk)
- **`html.ts`** — HTML escaping for Telegram (`&`, `<`, `>`, `"`)
- **`files.ts`** — Outbound file attachment handling: extracts file parts from provider responses and tool attachments, sends images via `sendPhoto` (no caption) and other files via `sendDocument`. Resolves both base64 data URLs and HTTP URLs
- **`stt.ts`** — Speech-to-text with provider fallback chain: Groq > Sarvam > AssemblyAI > OpenAI. Sarvam supports batch jobs for audio >30s and a translate-to-English mode
- **`system-prompt.ts`** — Loads custom system prompt from `~/.relay/SKILL.md` (or `systemPromptFile` config), watches for hot-reload. Conditionally appends MCP tool instructions (Browser, Fetch, Memory, Filesystem, GitHub, Context7, Relay) based on config flags. Appends fresh timestamp in configured timezone to every prompt via `getSystemPrompt()` — includes date/time, timezone abbreviation, and IANA timezone identifier (e.g. `Timezone: Asia/Kolkata`). Also exports `writeSystemPromptFile()` which assembles the full prompt (without timestamp) and writes it to `{dataDir}/RELAY.md` for delivery via OpenCode's `instructions` config. Hot-reload rewrites `RELAY.md` automatically when `SKILL.md` changes
- **`media.ts`** — Downloads Telegram files to `./uploads/`, auto-cleans files older than 1 hour
- **`errors.ts`** — Maps provider errors to user-friendly HTML-formatted Telegram messages
- **`opencode-config.ts`** — Auto-injects MCP server configs into OpenCode's config (`~/.config/opencode/opencode.json`). Supports 7 MCPs: Playwright, Fetch (uvx), Memory (with `MEMORY_FILE_PATH` env var pointing to `dataDir/memory.jsonl`), Filesystem (with user-specified paths), GitHub (npx, requires PAT), Context7 (npx, optional API key via `CONTEXT7_API_KEY` env var), and Relay (internal MCP for AI-driven bot management). Provides `ensure*Mcp()` and `remove*Mcp()` for each. Also provides `ensureInstructions(filePath)` / `removeInstructions(filePath)` to manage OpenCode's `instructions` array for system prompt delivery. Idempotent — skips if already configured

### Daemon Management (`src/daemon.ts`)

Background process management via pm2. All pm2 interaction is isolated in this module — users never touch pm2 directly. Provides `daemonStart()`, `daemonStop()`, `daemonRestart()`, `daemonLogs()`, and `daemonStatus()`. Auto-installs pm2 globally on first `relay start`.

### Self-Update (`src/update.ts`)

`relay update` — detects install method (npm global vs git source) and runs the appropriate update. Auto-restarts the daemon if running.

### State & Session Management

- **`src/session.ts`** — Tracks active session ID and selected model, persisted to `~/.relay/session.json`. Uses a mutex to prevent race conditions on concurrent messages. Exports `withPromptQueue()` for serial prompt execution (prevents SSE stream interleaving).
- **`src/auth.ts`** — Single-user auth via `initAuth(userId)` + rate limiting (30 req/min) with countdown timer.
- **`src/bot.ts`** — Creates grammY bot instance, applies auth middleware, registers commands.
- **`src/cli.ts`** — CLI entry point: handles `onboard` subcommand, `--help`, `--version`, auto-detects first run. Passes existing config to setup wizard for update mode.
- **`src/relay-api.ts`** — Internal localhost HTTP API (binds to `127.0.0.1` on `relayMcpPort`, default 39149). Bridges MCP tool calls to existing Relay functions (cron CRUD, notify, health). All cron timestamps are formatted in the user's configured timezone. Cron list response includes `timezone` field. No auth needed — localhost-only. Exports `startRelayApi()` / `stopRelayApi()`.
- **`src/mcp/relay-server.ts`** — Standalone MCP stdio server spawned by OpenCode. Exposes 8 tools: `relay_cron_list`, `relay_cron_add`, `relay_cron_update`, `relay_cron_remove`, `relay_cron_toggle`, `relay_cron_run`, `relay_notify`, `relay_health`. Schedule types: `interval`, `daily`, `weekly`, `once`. Tool descriptions reference user's configured timezone. Cron list output shows timezone header and all times in user's timezone. Uses newline-delimited JSON-RPC over stdio. Communicates with `relay-api.ts` via localhost HTTP (no auth).
- **`src/index.ts`** — Bot startup: loads config, auto-configures enabled MCP tools (Playwright, Fetch, Memory, Filesystem, GitHub, Context7, Relay) in OpenCode config, writes assembled system prompt to `RELAY.md` and registers it in OpenCode's `instructions`, inits provider, starts Relay internal API, starts bot in polling or webhook mode.

### Persistence (`~/.relay/` directory)

State is persisted via `JsonStore` to `~/.relay/` (or `./.relay/` in dev mode):
- `config.json` — User configuration (0600 permissions)
- `session.json` — Active session ID and selected model
- `cron.json` — Scheduled task definitions and run history
- `RELAY.md` — Auto-generated assembled system prompt (base + MCP tool docs). Written at startup, registered in OpenCode's `instructions` config. Regenerated on restart and on `SKILL.md` hot-reload
- `SKILL.md` — Custom user system prompt override (optional). If present, replaces the default base prompt. Hot-reloaded — edits trigger `RELAY.md` regeneration
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
- **System prompt delivery**: OpenCode ignores `body.system` (stores as metadata, never sends to LLM). System prompt is delivered via file: `writeSystemPromptFile()` assembles the full prompt (base + MCP tool docs, no timestamp) and writes to `{dataDir}/RELAY.md`. This file is registered in OpenCode's `instructions` config, which OpenCode loads into every LLM request. See `docs/prompt-architecture.md` for detailed diagrams.
- **Cron schedule types**: `interval` (every N minutes), `daily` (once per day), `weekly` (specific days), `once` (fires once at specified time, then auto-disables with `enabled=false`, preserving execution history). Toggle re-enables for another run. All cron times use the user's configured timezone. During execution, an animated dots indicator ("Running.", "Running..", "Running...") cycles in the header message.
- **Safe remote restart/update**: `/restart` and `/update` commands in admin.ts send a reply before killing the process (500ms delay), so Telegram acknowledges the update and avoids a restart loop. `/shell` blocks `relay restart/stop/start/update` to prevent unacknowledged updates from poisoning the Telegram queue.
- **Relay MCP**: Relay starts an internal HTTP API on `127.0.0.1:relayMcpPort` (default 39149) and registers a `relay` MCP server in OpenCode's config. The MCP server is a separate stdio process (`src/mcp/relay-server.ts`) spawned by OpenCode, which calls the internal API on localhost (no auth — localhost-only binding). Uses `@modelcontextprotocol/sdk` with newline-delimited JSON-RPC (not Content-Length framed).
- **Interactive questions**: OpenCode's AI can ask questions (plan approvals, decisions) via `question.asked` SSE events. These are handled **globally** (not session-filtered) so sub-agent questions are captured too. All question types are forwarded to Telegram as interactive inline keyboards: single-select (option buttons), multi-question batch (step-by-step wizard), multi-select (toggle checkboxes + Done), and no-options (Yes/No). Each mode also offers a "Type answer..." button for free-text input. A 5-min auto-reply timer prevents sessions from getting stuck — on timeout, the Telegram message is edited to show "Auto-replied" and the keyboard is removed. Stale flows from errored streams are cleaned up when a new question starts. Callback handlers in `question.ts` call `provider.replyToQuestion()`.
- **Global event handling for sub-agents**: Permission and question events are NOT filtered by session ID in the SSE loop. This ensures sub-agents (parallel explore/research agents spawned by OpenCode) don't get stuck. Permissions use `client.permission.reply()` with the event's own `requestID`. The stall timer skips abort when a question is pending.
- **File imports**: All local imports use `.js` extensions (ESM with NodeNext resolution), e.g., `import { foo } from "./bar.js"`.
