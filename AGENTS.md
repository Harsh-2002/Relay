# AGENTS.md — Relay Bot

Guidance for AI coding agents operating in this repository.

## Overview

Relay is a Telegram bot (built on grammY) that proxies user messages to OpenCode, supporting 75+ AI providers. ES module TypeScript project targeting Node.js >= 18.

## Build & Run Commands

```bash
npm run build     # Build TypeScript to dist/
npm run start     # Start compiled bot
npm run dev       # Watch mode + auto-restart
npx tsc --noEmit # Type-check only
```

**Note:** No test suite or linter configured.

## Code Style

### Imports
- Use `.js` extensions for local imports (ESM with NodeNext)
- Group: external packages → blank line → local imports
- Use `type` keyword for type-only imports

```typescript
import { Bot, Context } from "grammy";
import type { Provider } from "./types.js";
import { getConfig } from "../config/index.js";
```

### TypeScript
- Strict mode enabled
- Explicit type annotations for params and returns
- Use `any` sparingly — prefer `unknown`

```typescript
async function handleTextMessage(ctx: Context, text: string): Promise<void> {}
```

### Naming
- Variables/functions: `camelCase`
- Classes/Types: `PascalCase`
- Constants: `SCREAMING_SNAKE_CASE`
- Files: `kebab-case.ts`

### Error Handling
- Try/catch with typed error vars
- Log with pino before user replies
- Use `formatCatchError()` from utils

```typescript
try { await doSomething(); }
catch (err: any) {
  logger.info({ err: err?.message }, "Error");
  ctx.reply(formatCatchError(err), { parse_mode: "HTML" });
}
```

### Logging
- Use pino loggers from `src/utils/logger.js`
- Child loggers: `logger.child({ component: "name" })`
- Levels: `info` (normal), `warn` (recoverable), `error` (failures)

### Async/Await
- Always use async/await over raw Promises
- Async generators for streaming
- Cleanup in `finally` blocks

### Messaging
- grammY's `ctx.reply()` for sending
- `parse_mode: "HTML"` for formatted messages

### Configuration
- Use `getConfig()` from `src/config/index.js`
- Never read `process.env` directly
- Config: `~/.relay/config.json` (or `./.relay/` with `--dev`)

### Session Management
- Wrap prompts in `withPromptQueue()` from `src/session.ts`
- Prevents SSE stream interleaving

### Provider Abstraction
- Implement `Provider` interface from `src/providers/types.ts`
- Check `provider.capabilities.<flag>` before optional methods

### File Organization
```
src/
├── bot.ts           # Bot + middleware setup
├── auth.ts          # Auth middleware
├── session.ts       # Session + prompt queue
├── index.ts        # Startup entry
├── cli.ts          # CLI entry
├── config/         # Configuration
├── commands/       # Telegram handlers
├── providers/      # AI providers
└── utils/          # Utilities
```

## Key Patterns
- Prompt queue: `withPromptQueue()`
- Streaming: `streamPrompt()` 
- Errors: `formatCatchError()`
- HTML: `toHtml()`
- Chunking: `chunkMessage()` for >4096 chars

## Architecture
- Config: CLI args > config file > defaults
- Provider abstraction via interface
- Streaming via Telegram's `sendMessageDraft`
- Session isolation via mutex queue
- State: JsonStore in `~/.relay/`

## Common Tasks

### Adding a new command
1. Create file in `src/commands/` (e.g., `newcmd.ts`)
2. Export `registerNewcmd(bot: Bot): void` function
3. Import and call in `src/commands/index.ts`
4. Use existing patterns: `ctx.reply()`, error handling, logging

### Adding a new provider
1. Implement `Provider` interface from `src/providers/types.ts`
2. Add to provider registry in `src/providers/index.ts`
3. Test with session, messaging, and streaming operations

### Debugging
- Check logs in terminal output (pino logging enabled by default)
- Use `chatLogger.info()` for tracing message flow
- Provider logs in `providerLogger` for API calls
- Use `sessionLogger` for session lifecycle events

### Running Single Tests
- No test framework configured
- Manual testing via `npm run dev` with Telegram bot
- Use `/session` command to list/manage sessions
- Use `/stats` command for runtime statistics
