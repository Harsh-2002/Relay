# Features

Detailed guide to Relay's key features.

---

## Streaming Responses

Relay streams AI responses in real time. As the AI generates text, the Telegram message is progressively edited so you see output as it's produced rather than waiting for the full response.

### How it works

1. You send a message
2. The bot sends an initial "thinking" indicator
3. As text arrives, the message is edited in place with new content
4. When the response is complete, the final message is sent

### Streaming behavior

- Messages are updated approximately every second to avoid Telegram rate limits
- Very long responses are split into multiple messages (Telegram's 4096-character limit)
- Tool use indicators (e.g., "Reading file...", "Running command...") appear during processing
- If the AI is using tools, you'll see status updates before the final text response
- For long responses during streaming, the message shows the most recent content (tail end) rather than the beginning
- Unclosed code fences are automatically closed during intermediate stream updates to prevent broken formatting
- A 60-second inactivity timeout detects stalled streams and recovers gracefully

### Configuration

Streaming is configured during `relay onboard`, or via CLI flag:

```bash
relay --streaming-enabled=true
```

Or set it in `.relay/config.json`:

```json
{
  "streamingEnabled": true
}
```

When disabled (default), the bot waits for the complete response before sending a single message.

---

## File Attachments

When the AI generates files, takes screenshots, or creates artifacts, they are automatically sent as Telegram attachments.

### Supported file types

- **Images** (`image/png`, `image/jpeg`, etc.) — sent as Telegram photos
- **All other files** — sent as Telegram documents with the original filename

### How it works

OpenCode returns structured file parts in its responses. Relay extracts these automatically and sends them after the text response. No action is needed from the user.

Common scenarios where you receive file attachments:
- The AI takes a browser screenshot (via MCP browser tool)
- The AI generates an image or diagram
- The AI creates a downloadable file

---

## Voice Messages

Send voice notes to the bot and they'll be transcribed and processed as text input.

### Setup

Configure at least one speech-to-text provider during `relay onboard`, or set keys in `.relay/config.json`:

```json
{
  "groqApiKey": "gsk_...",
  "openaiSttApiKey": "sk-...",
  "assemblyaiApiKey": "..."
}
```

If multiple providers are configured, the cheapest available one is selected automatically.

### How it works

1. Record a voice message in Telegram
2. The bot downloads the audio file
3. The audio is sent to the STT provider for transcription
4. The transcribed text is sent to the AI as a regular message
5. You receive the AI's response as usual

### Provider priority

1. **Groq** — Fastest, free tier available
2. **OpenAI** — Reliable, widely available
3. **AssemblyAI** — Alternative option

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

MCP (Model Context Protocol) servers extend the AI's capabilities with additional tools like browsers, databases, and external APIs.

### Adding a local MCP server

Local servers run as subprocesses on the same machine:

```
/mcp add memory local npx -y @modelcontextprotocol/server-memory
/mcp add browser local npx -y @anthropic-ai/mcp-server-puppeteer
/mcp add filesystem local npx -y @modelcontextprotocol/server-filesystem /home/user/projects
```

### Adding a remote MCP server

Remote servers connect via URL:

```
/mcp add api remote https://mcp.example.com/sse
```

### Checking status

Use `/mcp` to see all configured servers and their connection status:

```
MCP Servers (2)

memory  ok
browser  failed
  Connection refused
```

### Removing a server

```
/mcp remove browser
```

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
2. `.relay/SKILL.md` if it exists
3. `./SKILL.md` in the current directory (backward compatibility)
4. Built-in default prompt

### Custom prompt file

Set a custom path in `.relay/config.json`:

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
/switch abc123
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
/delete abc123
```

---

## Monitoring

### Todo list

View the AI's task checklist:

```
/todo
```

Shows tasks with status icons for completed, in progress, pending, and cancelled items.

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
/shell ls -la
/shell git log --oneline -5
/shell npm test
```

Commands are executed natively on the OpenCode server.

---

## State Persistence

Relay automatically persists critical state to disk so it survives bot restarts and crashes.

### What is persisted

| Data | File | Description |
|------|------|-------------|
| Active session | `.relay/session.json` | Current session ID and selected model |

### How it works

- State is written atomically (via temp file + rename) to prevent corruption
- Files are loaded on startup and written immediately on change
- If a state file is missing or corrupt, the bot starts fresh with defaults
- The `.relay/` directory is created automatically and excluded from git

### Configuration

Override the data directory in `.relay/config.json`:

```json
{
  "dataDir": "/path/to/custom/data"
}
```

Or via CLI flag:

```bash
relay --data-dir=/path/to/custom/data
```

Default: `.relay/` in the project root.

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

---

## Edited Messages

Edit a sent message to re-prompt the AI with the corrected text. The AI processes the edit as a new message with an `[Edited message]` prefix so it understands this is a correction.

### How it works

1. Send a message with a typo or incomplete thought
2. Edit the message in Telegram
3. The AI receives and processes the edited version

---

## Webhook Deployment

For production deployments, you can run Relay in webhook mode instead of long-polling.

### Setup

Configure webhook mode during `relay onboard`, or set it in `.relay/config.json`:

```json
{
  "botMode": "webhook",
  "webhookUrl": "https://your-server.com/bot",
  "webhookPort": 3000,
  "webhookSecret": "your-random-secret"
}
```

Or via CLI flags:

```bash
relay --bot-mode=webhook --webhook-url=https://your-server.com/bot --webhook-port=3000
```

### Requirements

- A public HTTPS URL that Telegram can reach
- The port (default 3000) must be accessible

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
