# Prompt Architecture

How Relay's system prompt is assembled, delivered to the LLM, and kept in sync.

---

## Overview

Relay constructs a system prompt from modular sections and delivers it to the LLM
via OpenCode's `instructions` config -- a file-based mechanism that OpenCode loads
into every LLM request automatically.

```
+---------------------------------------------------------------+
|                        RELAY STARTUP                          |
|                                                               |
|  1. Load config (botToken, enabledMCPs, etc.)                 |
|  2. Configure MCP tools in OpenCode                           |
|  3. Assemble and write system prompt file                     |
|  4. Register file in OpenCode instructions                    |
|  5. Init provider, start bot                                  |
+---------------------------------------------------------------+
```

---

## Prompt Assembly

`writeSystemPromptFile()` in `src/utils/system-prompt.ts` builds the prompt
from modular sections:

```
+---------------------------------------------------------------+
|                   SYSTEM PROMPT ASSEMBLY                      |
|                                                               |
|  +----------------------------------------------------------+|
|  | Base Prompt                                               ||
|  |-----------------------------------------------------------|
|  | Source: ~/.relay/SKILL.md (custom)                         ||
|  |    OR:  DEFAULT_SYSTEM_PROMPT (built-in)                  ||
|  |                                                           ||
|  | Contains: identity, delivery constraints,                 ||
|  | input handling, output guidelines, behavior               ||
|  +----------------------------------------------------------+|
|                          |                                    |
|                          v                                    |
|  +----------------------------------------------------------+|
|  | MCP Tool Sections (conditional)                           ||
|  |-----------------------------------------------------------|
|  | + Playwright MCP     <-- if browserEnabled                ||
|  | + Fetch MCP          <-- if fetchEnabled                  ||
|  | + Memory MCP         <-- if memoryEnabled                 ||
|  | + Filesystem MCP     <-- if filesystemEnabled             ||
|  | + GitHub MCP         <-- if githubEnabled                 ||
|  | + Context7 MCP       <-- if context7Enabled               ||
|  +----------------------------------------------------------+|
|                          |                                    |
|                          v                                    |
|  +----------------------------------------------------------+|
|  | Relay MCP Section (always)                                ||
|  |-----------------------------------------------------------|
|  | Cron scheduling (interval/daily/weekly/once),             ||
|  | notifications, health checks, prompt-writing              ||
|  | guidelines with examples                                  ||
|  +----------------------------------------------------------+|
|                          |                                    |
|                          v                                    |
|        Written to {dataDir}/RELAY.md                  |
|        (no timestamp -- OpenCode adds its own)                |
+---------------------------------------------------------------+
```

---

## Delivery Path

The assembled file is registered in OpenCode's config, which loads it into
every LLM request:

```
                      STARTUP
                         |
                         v
          +--------------------------------+
          | writeSystemPromptFile()        |
          |                                |
          | Assembles all sections         |
          | Writes to:                     |
          | ~/.relay/RELAY.md      |
          +---------------+----------------+
                          |
                          v
          +--------------------------------+
          | ensureInstructions(path)       |
          |                                |
          | Adds path to opencode.json:    |
          | {                              |
          |   "instructions": [            |
          |     "~/.relay/                 |
          |       RELAY.md"        |
          |   ]                            |
          | }                              |
          +---------------+----------------+
                          |
                          |  (startup complete)
                          |
    ======================+=========================
                          |
                          |  (user sends a message)
                          v
          +--------------------------------+
          | Relay receives Telegram msg    |
          | chat.ts --> opencode.ts        |
          +---------------+----------------+
                          |
                          v
          +--------------------------------+
          | opencode.ts promptStream()     |
          |                                |
          | body = {                       |
          |   parts: [user message],       |
          |   model: "...",                |
          | }                              |
          |                                |
          | (no system field)              |
          +---------------+----------------+
                          |
                          v
          +--------------------------------+
          | OpenCode Server                |
          |                                |
          | Reads opencode.json            |
          | Loads instructions files:      |
          |                                |
          |   - RELAY.md           |
          |   - AGENTS.md (if any)         |
          |   - CLAUDE.md (if any)         |
          |                                |
          | Combines into system message   |
          +---------------+----------------+
                          |
                          v
          +--------------------------------+
          | LLM API Request                |
          |                                |
          | {                              |
          |   system: [                    |
          |     instructions content,      |
          |     AGENTS.md content          |
          |   ],                           |
          |   messages: [                  |
          |     { role: "user", ... }      |
          |   ]                            |
          | }                              |
          |                                |
          | System prompt delivered!       |
          +--------------------------------+
```

---

## Hot-Reload

When the user edits `~/.relay/SKILL.md`, the system prompt file is
automatically rewritten:

```
    ~/.relay/SKILL.md edited
               |
               v
    fs.watchFile fires (5s poll interval)
               |
               +---> cachedPrompt = null   (invalidate cache)
               |
               +---> writeSystemPromptFile()
                          |
                          v
                   Rewrites ~/.relay/RELAY.md
                   with updated base + all MCP sections
                          |
                          v
                   Next OpenCode request automatically
                   picks up the new file contents
```

No restart required. The instructions file path stays the same -- only the
contents change.

---

## Cron Job Prompts

Cron jobs use the same delivery path but run in **isolated sessions** --
each job creates a fresh session, executes, and deletes it after completion.
This prevents cron output from polluting the user's active conversation.

```
    Cron tick() detects due job
               |
               v
    executeJob(job)
               |
               +---> ensureServerAlive()
               |       Pre-flight health check. Skips execution
               |       if the AI server is unreachable.
               |
               +---> provider.createSession()
               |       Creates a fresh isolated session for this run.
               |
               +---> getSystemPrompt()
               |       Returns assembled prompt + timestamp in
               |       user's configured timezone.
               |       Passed as options.system to promptStream().
               |       But opencode.ts does NOT send body.system --
               |       the prompt reaches the LLM via instructions.
               |
               +---> promptStream(sessionId, job.prompt, options)
               |          |
               |          v
               |     OpenCode loads RELAY.md
               |     from instructions config
               |          |
               |          v
               |     LLM receives: system prompt + cron job prompt
               |
               +---> provider.deleteSession(sessionId)
                       Cleanup: removes the isolated session after
                       execution completes (success or failure).
```

The cron prompt is the `job.prompt` field -- a self-contained instruction
written at job creation time. The system prompt provides the AI's identity
and tool instructions. Both reach the LLM together.

Each job runs in isolation so that:
- Cron output doesn't appear in the user's active session history
- Multiple concurrent jobs don't interfere with each other
- Failed jobs don't leave orphan sessions cluttering the session list

---

## File Locations

| File                                  | Purpose                                            |
|---------------------------------------|---------------------------------------------------:|
| `src/utils/system-prompt.ts`          | Prompt assembly, file writing, hot-reload watcher  |
| `src/utils/opencode-config.ts`        | Registers file in OpenCode's `instructions` config |
| `{dataDir}/RELAY.md`                  | Assembled system prompt (auto-generated on startup)|
| `{dataDir}/SKILL.md`                  | User's custom base prompt (optional, hot-reloaded) |
| `~/.config/opencode/opencode.json`    | OpenCode config with `instructions` array          |

Where `{dataDir}` is `~/.relay/` in production or `./.relay/` in dev mode.

---

## Why File-Based Delivery

OpenCode's `body.system` field (sent via the SDK's `promptAsync` call) is stored
as session metadata but **never forwarded to the LLM**. This was discovered through
testing -- ~3400 tokens of system prompt were being sent per request but silently
discarded.

OpenCode's `instructions` config is the documented, supported mechanism for
injecting custom instructions into every LLM request. It:

- Loads file contents at request time (always fresh)
- Combines with `AGENTS.md` and `CLAUDE.md` files
- Supports glob patterns and multiple file paths
- Is documented at [opencode.ai/docs/rules](https://opencode.ai/docs/rules/)
