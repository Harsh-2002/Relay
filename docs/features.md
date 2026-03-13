# Features

Detailed guide to Relay's key features.

---

## Streaming Responses

Relay live-streams AI responses in real time. You see the text appear as the AI generates it.

### How it works

1. You send a message
2. The bot shows a "Thinking..." indicator
3. Text appears progressively as the AI generates it
4. The final formatted response replaces the draft

### Streaming behavior

- Very long responses are split into multiple messages automatically
- Tool use indicators appear with emoji status (e.g., "🔧 Read File...", "✅ Read File") during processing. Tool names are auto-formatted: MCP server prefixes are stripped and names are title-cased (e.g., `relay_cron_list` → "Cron List")
- For long responses, the most recent content is shown during streaming

### Configuration

Streaming is always enabled. The update speed can be adjusted in `~/.relay/config.json`:

```json
{
  "streamEditIntervalMs": 2000
}
```

Lower values = faster updates, but may hit Telegram rate limits.

---

## File Attachments

When the AI generates files, takes screenshots, or creates artifacts, they are automatically sent as Telegram attachments.

### Supported file types

- **Images** (`image/png`, `image/jpeg`, etc.) — sent as Telegram photos
- **All other files** — sent as Telegram documents with the original filename

### How it works

Files and images are extracted automatically and sent after the text response. No action is needed from you.

Common scenarios where you receive file attachments:
- The AI takes a browser screenshot
- The AI generates an image or diagram
- The AI creates a downloadable file

---

## Headless Browser (Playwright MCP)

The AI can browse the web, take screenshots, fill forms, and interact with pages via a built-in headless Chromium browser.

### Setup

Enable during `relay onboard` (Step 4), or set in `~/.relay/config.json`:

```json
{
  "browserEnabled": true
}
```

### What the AI can do

- Navigate to URLs and read page content
- Take screenshots (delivered as Telegram photos automatically)
- Click elements, fill forms, type text
- Wait for dynamic content to load
- Run JavaScript on pages

### Screenshots

When the AI takes a screenshot, the image is delivered as a separate Telegram photo message alongside the text response. The AI describes what it observes in the text — you see both the description and the actual image.

---

## Web Fetch (Fetch MCP)

The AI can fetch any URL and read its content as clean markdown — giving it live internet access for documentation, articles, and API responses.

### Setup

Enable during `relay onboard` (Step 4), or set in `~/.relay/config.json`:

```json
{
  "fetchEnabled": true
}
```

**Requires [uvx](https://docs.astral.sh/uv/)** (Python package runner). The setup wizard checks for it and offers to install it.

### What the AI can do

- Fetch documentation, blog posts, and articles from URLs
- Check API responses and endpoint health
- Look up library changelogs and release notes
- Read any public web page as markdown

### Limitations

- GET requests only — no POST, no authentication, no cookies
- No JavaScript rendering — SPAs return skeleton HTML
- Some sites block via robots.txt
- 30-second timeout, 5000-character default response (paginated for longer pages)

---

## Memory (Memory MCP)

The AI has a persistent knowledge graph that retains information across conversations — preferences, project facts, decisions, and conventions.

### Setup

Enable during `relay onboard` (Step 4), or set in `~/.relay/config.json`:

```json
{
  "memoryEnabled": true
}
```

Data is stored in `~/.relay/memory.jsonl` (or `./.relay/memory.jsonl` in dev mode).

### How it works

- At the start of each conversation, the AI searches its memory for relevant context
- As you chat, it proactively stores preferences, decisions, and project facts
- Information persists across conversations and bot restarts

### What gets remembered

- **Preferences**: "I use Tailwind", "always use pnpm"
- **Project facts**: tech stack, architecture decisions, deployment targets
- **Decisions**: "we chose PostgreSQL for the database"
- **Conventions**: coding patterns, naming conventions

The AI never stores secrets, API keys, or passwords in the knowledge graph.

---

## Filesystem (Filesystem MCP)

The AI can read and write files outside the current project directory — useful for cross-project operations, reading logs, or writing output files.

### Setup

Enable during `relay onboard` (Step 4), or set in `~/.relay/config.json`:

```json
{
  "filesystemEnabled": true,
  "filesystemPaths": ["/home/user/Documents", "/home/user/Downloads"]
}
```

The wizard prompts for allowed directories (comma-separated, `~` is expanded).

### What the AI can do

- Read files from other projects, downloads, or system locations
- Write output files to specific directories
- Compare files across repositories
- Inspect logs or config files outside the working directory
- Search and navigate directory trees

### Limitations

- All operations are restricted to the directories listed in `filesystemPaths`
- No delete operation — files and directories cannot be removed
- Symlinks are resolved and re-checked against allowed paths

---

## Voice Messages

Send voice notes to the bot and they'll be transcribed and processed as text input.

### Setup

Configure at least one speech-to-text provider during `relay onboard`, or set keys in `~/.relay/config.json`:

```json
{
  "groqApiKey": "gsk_...",
  "sarvamApiKey": "...",
  "assemblyaiApiKey": "...",
  "openaiSttApiKey": "sk-..."
}
```

If multiple providers are configured, the cheapest available one is selected automatically.

### How it works

1. Record a voice message in Telegram
2. The bot downloads the audio file
3. The audio is sent to the STT provider for transcription
4. The transcribed text is sent to the AI as a regular message
5. You receive the AI's response as usual

### Automatic fallback

If the selected provider fails, Relay automatically tries other configured providers. No manual intervention needed — just configure multiple providers for resilience.

### Supported providers

- **Groq** — Fastest, free tier available
- **Sarvam AI** — Optimized for Indian languages (Hindi, Tamil, Telugu, etc.)
- **AssemblyAI** — Reliable general-purpose
- **OpenAI** — Widely available

### Translation

Sarvam AI also supports a **translate mode** (`sttProvider: "sarvam-translate"`) that transcribes non-English voice messages and translates them to English in one step. See [Providers](providers.md#translation-sarvam) for details.

---

## Photo Input

Send photos to the bot for analysis by vision-capable models.

### How it works

1. Send a photo (with or without a caption)
2. The bot downloads the image
3. The image is sent to the AI model along with any caption text
4. The AI analyzes the image and responds

### Tips

- Add a caption to your photo to ask specific questions about it (e.g., "What's wrong with this UI?")
- Without a caption, the AI will describe or analyze the image
- Vision capability depends on the model — check `/models` for vision badges

---

## File Input

Send files to the bot as attachments.

### Text files

Text files (`.txt`, `.md`, `.js`, `.py`, `.json`, `.yaml`, `.toml`, `.xml`, `.csv`, `.html`, `.css`, etc.) are read and their content is embedded directly in the message to the AI.

### Binary files

Binary files are referenced by name but their content is not sent to the AI. The AI is informed that a file was attached.

### Size limit

Text messages have a 32,000-character limit. For larger content, send it as a file attachment.

---

## MCP Servers

MCP (Model Context Protocol) servers extend the AI's capabilities with additional tools.

Seven built-in MCP tools are configurable during `relay onboard`: **Browser**, **Fetch**, **Memory**, **Filesystem**, **GitHub**, **Context7**, and **Relay** (see sections above and [Configuration](configuration.md)). You can also add custom MCP servers at runtime.

### Adding a local MCP server

Local servers run as subprocesses on the same machine:

```
/mcp add myserver local npx -y @modelcontextprotocol/server-example
```

### Adding a remote MCP server

Remote servers connect via URL:

```
/mcp add api remote https://mcp.example.com/sse
```

### Checking status

Use `/mcp` to see all configured servers and their connection status. Servers are numbered with action buttons (Connect/Reconnect and Remove):

```
MCP Servers (2)

1. memory  [ON]

2. browser  [OFF]
   Connection refused
```

### Removing a server

```
/mcp remove browser    # Shows confirmation before removing
```

Commands without arguments (`/mcp remove`, `/mcp connect`) prompt for the server name interactively.

MCP servers are managed through the OpenCode API and persist across restarts.

---

## Model Selection

Relay supports switching between AI models at runtime.

### Listing available models

Use `/models` to see all available models as an interactive inline keyboard. Models are grouped by provider, with capability badges shown next to each name. The currently active model is marked with a `✓` prefix.

Tap any model button to switch to it instantly — no need to type a command.

If there are more than 8 models, pagination buttons (`« Prev` / `Next »`) appear at the bottom.

### Capability badges

- `[reasoning]` — The model supports extended thinking/reasoning
- `[vision]` — The model accepts image input
- `✓` prefix — Currently selected model

### Switching models

By full path:
```
/model anthropic/claude-sonnet-4-20250514
```

By partial match:
```
/model sonnet
/model deepseek
```

After switching, the bot confirms the model and shows its capabilities:
```
Model set to anthropic/claude-sonnet-4-20250514
Capabilities: reasoning, vision
```

Models are listed dynamically from all configured OpenCode providers. If no provider API keys are set or the API call fails, no models are listed.

---

## System Prompt

Customize the AI's behavior with a system prompt file.

### Default behavior

The bot looks for a system prompt in this order:
1. Explicit path from `systemPromptFile` in config
2. `~/.relay/SKILL.md` if it exists
3. `./SKILL.md` in the current directory (backward compatibility)
4. Built-in default prompt

### Custom prompt file

Set a custom path in `~/.relay/config.json`:

```json
{
  "systemPromptFile": "prompts/my-prompt.md"
}
```

Or via CLI flag:

```bash
relay --system-prompt-file=prompts/my-prompt.md
```

### Hot reload

The system prompt file is watched for changes. When you edit it, the new prompt is loaded automatically on the next message.

To force a reload:
```
/system reload
```

### Viewing the prompt

Use `/system` to see the current prompt (first 500 characters), its source, and character count.

---

## Session Management

Sessions keep your conversations organized. Each session maintains its own message history.

### Creating sessions

```
/new                          # Create with auto-generated title
/new Refactoring auth module  # Create with a custom title
```

The new session becomes active immediately.

### Listing sessions

```
/sessions
```

Shows all sessions sorted by last modified date, with the active session marked.

### Switching sessions

```
/switch              # Shows interactive session picker
/switch abc123       # Switch directly by ID
```

### Forking sessions

Create a copy of the current session:

```
/fork                  # Fork from the latest message
/fork msg_abc123       # Fork from a specific message
```

The forked session becomes the active session.

### Deleting sessions

```
/delete              # Shows session picker, then confirmation
/delete abc123       # Shows confirmation for abc123
```

---

## Monitoring

### Todo list

View the AI's task checklist:

```
/todo
```

Shows tasks with status tags: `[done]`, `[wip]`, `[pending]`, `[cancelled]`.

### Code diffs

View a summary of changes:

```
/diff
```

Download the full diff:

```
/diff full
```

### Revert and unrevert

Undo the last AI change:

```
/revert
```

Redo a reverted change:

```
/unrevert
```

---

## Shell Access

Run commands on the coding agent's machine:

```
/shell                 # Prompts for command interactively
/shell ls -la
/shell git log --oneline -5
/shell npm test
```

Commands are executed natively on the OpenCode server.

---

## Web Monitoring

Monitor any URL for changes and get AI-analyzed notifications when something relevant happens.

### Setup

No additional configuration needed. Web monitoring is built-in.

### Creating a watch

**Interactive flow (recommended):**
```
/watch                                    # Shows list → tap + Add Watch
/watch https://example.com/pricing        # Start with URL pre-filled
```

Both paths lead to a step-by-step flow: URL → interval → task description. The watch name is auto-derived from the URL hostname.

**Direct command:**
```
/watch add https://example.com/pricing 30 Pricing: Watch for price changes
```

### How change detection works

The system uses a two-step approach to avoid unnecessary AI calls:

1. **HTTP fetch** — plain `fetch()` retrieves the page, converts HTML to readable text via `htmlToReadableText()` (strips scripts, styles, tags, normalizes whitespace)
2. **Hash comparison** — SHA-256 hash of the text is compared against the previous snapshot. If identical, no further action
3. **AI analysis** — only when content changes, the AI compares old and new content in an isolated session, filtered by the user's task description. Irrelevant changes (timestamps, ads, layout shifts) are ignored

### Upfront validation

When creating a watch, Relay immediately fetches the URL:

- **Fetch fails** → watch is not created, error message shown
- **Thin content** (< 50 words) → watch is created with a warning (possible SPA or bot protection)
- **Success** → baseline snapshot captured immediately, so the first scheduled check can already detect changes

### Managing watches

Use `/watch` to see all watches with inline buttons:

- **Enable/Disable** — toggle a watch on or off
- **Check Now** — run an immediate check outside the schedule
- **Delete** — remove a watch

### Limitations

- **JavaScript-rendered pages (SPAs)**: Plain HTTP fetch only gets server-rendered HTML. Pure client-side SPAs will return an empty shell. The upfront validation warns about this (< 50 words detected)
- **Bot protection**: Sites behind Cloudflare challenges or CAPTCHAs will be blocked. The validation catches this at creation time
- **Content cap**: Page text is capped at 50KB per snapshot; AI analysis receives up to 3KB of old and new content

### Error handling

- Notifies on error #1 and #3 (gives transient issues a chance to recover)
- Auto-disables the watch after 5 consecutive fetch errors
- Ring buffer stores the last 3 snapshots per watch

---

## Deep Research

Run thorough multi-step research on any topic with AI-powered analysis and source citations.

### How it works

```
/research quantum computing advances
```

1. An isolated session is created for the research
2. The AI breaks the topic into 3-5 sub-questions
3. Uses available tools (web fetch, browser, etc.) to gather information
4. Cross-references findings for accuracy
5. Delivers a structured report: Key Findings → Analysis → Sources
6. The session is deleted after completion

Results stream live to Telegram. Without arguments, `/research` prompts for the topic interactively.

---

## State Persistence

Relay automatically persists critical state to disk so it survives bot restarts and crashes.

### What is persisted

| Data | File | Description |
|------|------|-------------|
| Active session | `~/.relay/session.json` | Current session ID and selected model |
| Scheduled tasks | `~/.relay/cron.json` | Cron job definitions, schedules, and run history |
| Web watches | `~/.relay/watch.json` | Watch definitions, snapshots, and check history |

### How it works

- State is written atomically (via temp file + rename) to prevent corruption
- Files are loaded on startup and written immediately on change
- If a state file is missing or corrupt, the bot starts fresh with defaults
- The `~/.relay/` directory is created automatically

### Configuration

Override the data directory in `~/.relay/config.json`:

```json
{
  "dataDir": "/path/to/custom/data"
}
```

Or via CLI flag:

```bash
relay --data-dir=/path/to/custom/data
```

Default: `~/.relay/` in the user's home directory. Use `--dev` to use `./.relay/` in the current directory.

---

## Reasoning / Thinking Display

When using models that support extended thinking (like Claude with reasoning or DeepSeek), the AI's reasoning process is displayed separately from the final answer.

### How it works

- Reasoning is shown in a **collapsible blockquote** (tap to expand) above the answer
- If the answer is short enough, reasoning and answer appear in the same message
- For longer answers, reasoning is sent as a separate message before the answer chunks
- During streaming, reasoning is hidden (just shows "Thinking...") until the final answer arrives

This keeps the conversation clean — you see the answer immediately, and can expand the thinking process if you're curious about how the AI arrived at its response.

---

## Reply Context

Reply to any bot message to reference it in your next prompt. The quoted message text is included as context so the AI knows what you're referring to.

### How it works

1. Long-press (or swipe) a bot message in Telegram and tap "Reply"
2. Type your follow-up message
3. The AI receives both the quoted text and your new message

This is useful for asking follow-up questions about a specific part of a long conversation, or for saying "fix the code in this message" while pointing to a particular response.

### Voice/audio replies

You can also reply to voice notes and audio files. Relay transcribes the audio via STT and includes the transcription as context:

- `[Replying to voice message: "..."]` for voice notes
- `[Replying to audio: "..."]` for audio files

Reply context also works when sending photos, documents, voice notes, and audio — the quoted text is prepended to the caption or transcription.

---

## Edited Messages

Edit a sent message to re-prompt the AI with the corrected text. The AI processes the edit as a new message with an `[Edited message]` prefix so it understands this is a correction.

### How it works

1. Send a message with a typo or incomplete thought
2. Edit the message in Telegram
3. The AI receives and processes the edited version

---

## Scheduled Tasks (Cron)

Automate recurring AI tasks that run on a schedule. Define prompts that execute automatically at intervals, daily, weekly, or as a one-time task. All times use your configured timezone (set via `/timezone`). Results are delivered directly to your Telegram chat.

### Setup

Cron is built-in and requires no additional configuration. Jobs are managed entirely through Telegram commands.

### Creating jobs

**Daily job:**
```
/cron add daily 09:00 Git summary: Summarize recent git commits
```

**Recurring interval:**
```
/cron add every 30m Health: Check server health and report issues
```

**Weekly on specific days:**
```
/cron add weekly mon,wed,fri 14:30 Review: Summarize open PRs
```

**One-time job:**
```
/cron add once 14:30 Reminder: Review the open PR
```

The format is always: `/cron add <schedule> Title: prompt`

### Interactive picker

Use `/cron` and tap **Add Job** to build a schedule step by step through an inline keyboard. After selecting the schedule, Relay prompts for the job title and prompt text, then creates the job automatically.

### Managing jobs

Use `/cron` to see all jobs with action buttons:

- **Enable/Disable** -- Toggle a job on or off without deleting it
- **Run** -- Execute a job immediately outside its schedule
- **Delete** -- Remove a job permanently

### How it works

- The scheduler checks for due jobs every 30 seconds
- Each job runs in an **isolated session** — a fresh session is created per run and deleted after, so cron output never pollutes your active conversation
- An animated dots indicator ("Running.", "Running..", "Running...") cycles in the header during execution
- A pre-flight health check verifies the AI server is alive before executing
- Results are sent as formatted messages with the job name as a header
- File attachments (screenshots, generated files) are sent automatically
- If the bot restarts, missed jobs are skipped and schedules advance to the next future time
- Job state (schedules, run history, run count) is persisted to `cron.json`

### Limits

- Minimum interval: 1 minute
- Maximum displayed jobs: 30 (Telegram keyboard limit)
- Job names are truncated at 40 characters in the list view

---

## Webhook Deployment

For production deployments, you can run Relay in webhook mode instead of long-polling.

### Setup

Configure webhook mode during `relay onboard`, or set it in `~/.relay/config.json`:

```json
{
  "botMode": "webhook",
  "webhookUrl": "https://your-server.com/bot",
  "webhookPort": 39148,
  "webhookSecret": "your-random-secret"
}
```

Or via CLI flags:

```bash
relay --bot-mode=webhook --webhook-url=https://your-server.com/bot --webhook-port=39148
```

### Requirements

- A public HTTPS URL that Telegram can reach
- The port (default 39148) must be accessible

### How it works

1. Relay starts an HTTP server on the specified port
2. It registers the webhook URL with Telegram
3. Telegram pushes updates directly to your server
4. On shutdown, the webhook is automatically cleaned up

### Switching back to polling

Set `botMode` to `polling` in your config (or remove it — polling is the default). The bot will clear any stale webhook before starting long-polling.

### Benefits over polling

- Lower latency (push vs pull)
- Reduced resource usage (no continuous polling loop)
- Better for containerized/serverless deployments
