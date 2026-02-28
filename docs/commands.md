# Command Reference

Complete reference for all Relay Telegram commands. Commands marked with a provider name are only available when using that provider.

## Chat

No command needed -- just send a message.

**Supported input types:**
- Text messages
- Voice notes (requires STT configuration)
- Photos (sent to vision-capable models)
- File attachments (text files are embedded, binary files referenced)

**Input limit:** 32,000 characters for text messages. Send longer content as a file.

**Output:** The AI's response is sent as Telegram messages. If the AI generates files or screenshots (OpenCode), they are sent as Telegram attachments automatically.

---

## Session Management

### `/new [title]`

Create a new session.

```
/new
/new Refactoring auth module
```

The new session becomes the active session. All subsequent messages go to this session.

### `/sessions`

List all sessions, sorted by last modified date. Shows the session ID, title, and a marker for the active session.

### `/switch <id>`

Switch to an existing session by its ID.

```
/switch abc123
```

### `/delete <id>`

Delete a session. If you delete the active session, it is cleared.

```
/delete abc123
```

### `/current`

Show the currently active session's ID and title.

### `/fork [messageId]`

Fork the current session, creating a copy. Optionally specify a message ID to fork from a specific point.

```
/fork
/fork msg_abc123
```

The forked session becomes the active session. Supported by OpenCode and Claude.

---

## Monitor

### `/todo` (OpenCode)

View the AI's task checklist. Shows each task with a status icon:

- Completed
- In progress
- Pending
- Cancelled

### `/diff`

Show a summary of code changes in the current session. OpenCode shows structured file-level changes; Claude and Codex delegate to `git diff`.

### `/diff full`

Download the full diff as a text file, including before/after content for each changed file.

---

## File Operations

### `/read <path>`

Read a file and display its contents.

```
/read src/index.ts
/read package.json
```

Files larger than 15KB are sent as a downloadable attachment.

### `/find <query>`

Find files by name pattern.

```
/find index.ts
/find *.json
```

Shows up to 50 matching files.

### `/search <pattern>`

Search file contents with a text pattern (regex supported).

```
/search TODO
/search function.*auth
```

Shows up to 20 matching lines with file paths and line numbers.

### `/symbols <query>`

Find code symbols (functions, classes, variables) by name.

```
/symbols authenticate
/symbols UserService
```

Shows up to 30 matching symbols with their locations.

### `/status`

Show git file status (modified, added, deleted files).

---

## History

### `/history`

View the last 10 messages in the current session. Shows alternating user and assistant messages with a 200-character preview.

### `/summarize`

Generate a summary of the current session. OpenCode only.

### `/revert`

Undo the last AI change. OpenCode only.

### `/unrevert`

Redo a previously reverted change. OpenCode only.

### `/abort`

Cancel the currently running operation. Stops streaming or processing.

### `/share`

Get a shareable URL for the current session. OpenCode only.

---

## Shell

### `/shell <command>`

Run a shell command on the coding agent's machine.

```
/shell ls -la
/shell git log --oneline -5
/shell npm test
```

On OpenCode, this runs natively. On Claude and Codex, the command is sent as a prompt asking the AI to execute it.

### `/cmd <command> [arguments]` (OpenCode)

Run an OpenCode-specific command.

```
/cmd compact
/cmd agent_cycle
```

### `/commands` (OpenCode)

List all available OpenCode commands that can be used with `/cmd`.

---

## Models

### `/models`

List all available models grouped by provider. Each model shows capability badges:

- `[reasoning]` -- The model supports extended thinking/reasoning
- `[vision]` -- The model accepts image input
- `[active]` -- Currently selected model

Example output:

```
Available Models

anthropic
  claude-sonnet-4-20250514  [reasoning] [active]
  claude-opus-4-20250514  [reasoning]
  claude-haiku-4-20250514

openrouter
  deepseek/deepseek-r1  [reasoning]
```

All providers fetch models dynamically from their respective APIs.

### `/model [provider/model]`

View or change the current model.

**View current model:**
```
/model
```

**Set by full path:**
```
/model anthropic/claude-sonnet-4-20250514
```

**Set by partial match:**
```
/model sonnet
/model deepseek
```

After switching, the bot shows the model's capabilities:

```
Model set to anthropic/claude-sonnet-4-20250514
Capabilities: reasoning, vision
```

---

## MCP (Model Context Protocol)

MCP servers extend the AI's capabilities with additional tools like browsers, databases, and external APIs. Supported by OpenCode and Claude.

### `/mcp`

Show the status of all configured MCP servers.

Example output:

```
MCP Servers (2)

memory  ok
browser  failed
  Connection refused
```

### `/mcp add <name> local <command...>`

Add a local MCP server. The command is run as a subprocess.

```
/mcp add memory local npx -y @modelcontextprotocol/server-memory
/mcp add browser local npx -y @anthropic-ai/mcp-server-puppeteer
/mcp add filesystem local npx -y @modelcontextprotocol/server-filesystem /path/to/dir
```

### `/mcp add <name> remote <url>`

Add a remote MCP server by URL.

```
/mcp add api remote https://mcp.example.com/sse
```

### `/mcp remove <name>`

Remove and disconnect an MCP server.

```
/mcp remove browser
```

**Provider differences:**
- **OpenCode:** Full runtime management. Servers persist in the OpenCode configuration.
- **Claude:** Persisted to `.relay/claude-mcp.json`. Servers are restored on restart.
- **Codex:** Not supported.

---

## Settings

### `/health`

Show a dashboard with server status, current model (with reasoning badge), streaming status, voice STT provider, system prompt info, and project details.

### `/config`

Show the full provider configuration as JSON.

### `/providers`

Show available AI providers and their models (raw JSON from the provider).

### `/agents`

List available agents (OpenCode only).

### `/tools`

List all tools available to the AI.

### `/project`

Show project information: ID, worktree, VCS type, branch, and directory.

### `/git`

Show git branch and changed files status.

### `/system`

View the current system prompt (first 500 characters), its source (custom file or built-in default), and character count.

### `/system reload`

Force-reload the system prompt from the file. Useful if auto-reload didn't pick up a change.

### `/start`

Show a welcome message with the active provider name.

### `/help`

Show a compact reference of all available commands, with provider-specific sections shown based on the active provider.
