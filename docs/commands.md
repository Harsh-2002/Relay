# Command Reference

Complete reference for all Relay Telegram commands.

## Chat

No command needed -- just send a message.

**Supported input types:**
- Text messages
- Voice notes (requires STT configuration)
- Photos (sent to vision-capable models)
- File attachments (text files are embedded, binary files referenced)
- **Reply to a message** (text, voice, or audio) to include it as context in your prompt
- **Edit a sent message** to re-prompt with the corrected text

**Input limit:** 32,000 characters for text messages. Send longer content as a file.

**Output:** The AI's response is sent as Telegram messages. If the AI generates files or screenshots, they are sent as Telegram attachments automatically. When the model provides reasoning/thinking, it appears in a collapsible blockquote above the answer.

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

List all sessions, sorted by last modified date. Shows the session ID, title, and a marker for the active session. Includes inline buttons to switch or delete each session.

### `/switch [id]`

Switch to an existing session. Without an ID, shows an interactive session picker keyboard.

```
/switch              # Shows session picker
/switch abc123       # Switch directly by ID
```

### `/delete [id]`

Delete a session. Without an ID, shows a session picker. With an ID, shows a confirmation keyboard (Yes/No). If you delete the active session, it is cleared.

```
/delete              # Shows session picker
/delete abc123       # Shows confirmation for abc123
```

### `/current`

Show the currently active session's ID and title.

### `/rename [title]`

Rename the current session. Without a title, prompts for input interactively.

```
/rename                    # Prompts for new title
/rename Auth refactoring   # Rename directly
```

### `/fork [messageId]`

Fork the current session, creating a copy. Optionally specify a message ID to fork from a specific point.

```
/fork
/fork msg_abc123
```

The forked session becomes the active session.

---

## Monitor

### `/todo`

View the AI's task checklist. Shows each task with a status tag:

- `[done]` — Completed
- `[wip]` — In progress
- `[pending]` — Pending
- `[cancelled]` — Cancelled

### `/diff`

Show a summary of code changes in the current session with structured file-level changes.

### `/diff full`

Download the full diff as a text file, including before/after content for each changed file.

---

## File Operations

### `/ls [path]`

List files and directories. Defaults to the project root.

```
/ls
/ls src/utils
```

### `/read [path]`

Read a file and display its contents. Without a path, prompts for input interactively.

```
/read                  # Prompts for file path
/read src/index.ts
/read package.json
```

Files larger than 15KB are sent as a downloadable attachment.

### `/find [query]`

Find files by name pattern. Without a query, prompts for input interactively.

```
/find                  # Prompts for search query
/find index.ts
/find *.json
```

Shows up to 50 matching files.

### `/search [pattern]`

Search file contents with a text pattern (regex supported). Without a pattern, prompts for input interactively.

```
/search                # Prompts for search pattern
/search TODO
/search function.*auth
```

Shows up to 20 matching lines with file paths and line numbers.

### `/symbols [query]`

Find code symbols (functions, classes, variables) by name. Without a query, prompts for input interactively.

```
/symbols               # Prompts for symbol name
/symbols authenticate
/symbols UserService
```

Shows up to 30 matching symbols with their locations.

### `/status`

Show git file status (modified, added, deleted files).

---

## History

### `/history`

View the last 10 messages in the current session. Shows alternating user and assistant messages with a 200-character preview. Includes "Fork after" buttons for assistant messages.

### `/summarize`

Generate a summary of the current session.

### `/revert`

Undo the last AI change.

### `/unrevert`

Redo a previously reverted change.

### `/abort`

Cancel the currently running operation. Stops streaming or processing.

### `/share`

Get a shareable URL for the current session.

### `/unshare`

Revoke the shared URL for the current session.

---

## Shell

### `/shell [command]`

Run a shell command on the coding agent's machine. Without a command, prompts for input interactively.

```
/shell                 # Prompts for command
/shell ls -la
/shell git log --oneline -5
/shell npm test
```

Commands are executed natively on the OpenCode server.

> **Blocked commands:** `relay restart`, `relay stop`, `relay start`, and `relay update` are blocked in `/shell` to prevent killing the bot process. Use `/restart` or `/update` instead.

### `/cmd [command]`

Run an OpenCode-specific command. Without arguments, shows an interactive picker.

```
/cmd              # Shows picker with available commands
/cmd stats        # Token usage & cost
/cmd version      # OpenCode version
/cmd upgrade      # Upgrade OpenCode
/cmd sessions     # List CLI sessions
/cmd init         # Create/update AGENTS.md
/cmd review       # Review code changes
```

### `/commands`

List all available commands that can be used with `/cmd`.

---

## Models & Agents

### `/models`

List all available models with an interactive inline keyboard. Tap a model button to select it instantly.

Each model shows capability badges:

- `[reasoning]` -- The model supports extended thinking/reasoning
- `[vision]` -- The model accepts image input
- `[free]` -- Free-tier model
- `✓` prefix -- Currently selected model

Models are grouped by provider with header rows. If there are more than 8 models, pagination buttons (`« Prev` / `Next »`) appear at the bottom.

Tapping a model button switches to that model immediately and shows a confirmation with capabilities.

Models are fetched dynamically from the configured AI providers. If no provider API keys are set, no models are listed.

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

### `/agent [name|clear]`

View or change the current agent mode. Without arguments, shows an interactive picker.

```
/agent              # Shows agent picker
/agent build        # Switch to build agent
/agent clear        # Reset to default agent
```

### `/agents`

List all available agents with descriptions. Shows primary agents and sub-agents separately, with the active agent marked.

### `/stt`

View and switch the active speech-to-text provider via an interactive keyboard. Shows the currently selected provider and all configured providers with their status.

---

## MCP (Model Context Protocol)

MCP servers extend the AI's capabilities with additional tools like browsers, databases, and external APIs.

### `/mcp`

Show the status of all configured MCP servers. Servers are numbered, with action buttons (Connect/Reconnect and Remove) for each.

Example output:

```
MCP Servers (2)

1. memory  [ON]

2. browser  [OFF]
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

### `/mcp connect [name]`

Reconnect a disconnected MCP server. Without a name, prompts for input interactively.

```
/mcp connect           # Prompts for server name
/mcp connect browser
```

### `/mcp remove [name]`

Remove and disconnect an MCP server. Without a name, prompts for input interactively. Shows a confirmation keyboard before removing.

```
/mcp remove            # Prompts for server name
/mcp remove browser    # Shows confirmation
```

Servers persist in the OpenCode configuration across restarts.

---

## Cron (Scheduled Tasks)

Schedule recurring AI tasks that run automatically. Results are delivered to your chat. All times use your configured timezone (set via `/timezone`).

### `/cron`

Show all scheduled jobs with action buttons for each:

- **Enable/Disable** -- Toggle a job on or off
- **Run** -- Execute a job immediately
- **Delete** -- Remove a job

Each job shows its schedule, next run time in your timezone, last run status, and total run count.

### `/cron add daily <HH:MM> <Title: prompt>`

Schedule a job that runs once per day at the specified time.

```
/cron add daily 09:00 Git summary: Summarize recent git commits
/cron add daily 18:00 EOD report: What files changed today?
```

### `/cron add every <interval> <Title: prompt>`

Schedule a job that runs at a fixed interval. Supports minutes (`m`) and hours (`h`).

```
/cron add every 30m Health: Check server health and report any issues
/cron add every 2h Status: Report system status
/cron add every 1m Ping: Are you alive?
```

Minimum interval is 1 minute.

### `/cron add weekly <days> <HH:MM> <Title: prompt>`

Schedule a job that runs on specific days of the week. Days are comma-separated: `mon`, `tue`, `wed`, `thu`, `fri`, `sat`, `sun`.

```
/cron add weekly mon,wed,fri 14:30 Review: Summarize open PRs
/cron add weekly mon 09:00 Weekly plan: What should I focus on this week?
```

### `/cron add once <HH:MM> <Title: prompt>`

Schedule a one-time job. It fires once at the specified time, then auto-disables (preserving run history). Toggle to re-enable for another run.

```
/cron add once 14:30 Reminder: Time to review the open PR
```

### Interactive picker

The `/cron` command also includes an **Add Job** button that walks you through creating a job step by step:

1. Pick schedule type (interval, daily, weekly, once)
2. Pick interval duration or hour
3. Pick minute
4. Pick days (for weekly)
5. Prompts for a job title
6. Prompts for the job prompt text
7. Creates the job automatically

### How it works

- Jobs are persisted to `cron.json` in the data directory and survive restarts
- The scheduler checks for due jobs every 30 seconds
- Each job runs in an **isolated session** (created fresh per run, deleted after) so cron output doesn't pollute your conversation
- An animated dots indicator ("Running.", "Running..", "Running...") cycles in the header during execution
- A pre-flight health check verifies the AI server is alive before executing
- Results are sent to your chat with a header showing the job name
- File attachments from job execution (screenshots, etc.) are sent automatically
- If the bot restarts, missed jobs are skipped (no avalanche of past runs)

---

## Settings & Info

### `/health`

Show a dashboard with server status, current model (with reasoning badge), streaming status, voice STT provider, system prompt info, and project details.

### `/config`

Show the full provider configuration as JSON. Sensitive values (bot token, API keys) are masked.

### `/providers`

Show available AI providers with their ID, status, and model count.

### `/agents`

List available agents with descriptions.

### `/tools`

List all tools available to the AI with descriptions.

### `/project`

Show project information: ID, worktree, VCS type, branch, and directory.

### `/git`

Show git branch and changed files status. Shows up to 30 changed files with their status codes.

### `/timezone [tz]`

View the current timezone or set a new one. Without an argument, shows the current timezone and prompts for a new IANA timezone interactively.

```
/timezone                    # Shows current, prompts for new
/timezone America/New_York   # Set directly
```

The timezone affects cron job scheduling, next run times, and the timestamp in the system prompt.

### `/system`

View the current system prompt (first 500 characters), its source (custom file or built-in default), and character count.

### `/system reload`

Force-reload the system prompt from the file. Useful if auto-reload didn't pick up a change.

### `/restart`

Restart the bot process. The bot sends a confirmation message before restarting via pm2.

### `/update`

Update Relay to the latest version from npm and restart. Shows the new version number on success.

### `/start`

Show a welcome message with basic usage instructions.

### `/help`

Show a compact reference of all available commands, organized by category.
