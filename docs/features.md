# Features

Detailed guide to OCBot's key features.

---

## Streaming Responses

OCBot streams AI responses in real time. As the AI generates text, the Telegram message is progressively edited so you see output as it's produced rather than waiting for the full response.

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

### Configuration

Streaming is enabled by default. To disable it:

```env
STREAMING=false
```

When disabled, the bot waits for the complete response before sending a single message.

---

## File Attachments

When the AI generates files, takes screenshots, or creates artifacts, they are automatically sent as Telegram attachments. This feature is available with the OpenCode provider.

### Supported file types

- **Images** (`image/png`, `image/jpeg`, etc.) — sent as Telegram photos
- **All other files** — sent as Telegram documents with the original filename

### How it works

OpenCode returns structured file parts in its responses. OCBot extracts these automatically and sends them after the text response. No action is needed from the user.

Common scenarios where you receive file attachments:
- The AI takes a browser screenshot (via MCP browser tool)
- The AI generates an image or diagram
- The AI creates a downloadable file

### Provider support

| Provider | File output |
|----------|------------|
| OpenCode | Yes — automatic |
| Claude | No |
| Codex | No |

---

## Voice Messages

Send voice notes to the bot and they'll be transcribed and processed as text input.

### Setup

Configure at least one speech-to-text provider:

```env
GROQ_API_KEY=gsk_...          # Groq Whisper (fastest, has free tier)
OPENAI_API_KEY=sk-...          # OpenAI Whisper
ASSEMBLYAI_API_KEY=...         # AssemblyAI
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

### Provider differences

| Feature | OpenCode | Claude | Codex |
|---------|----------|--------|-------|
| MCP support | Full API | In-memory | No |
| Persistence | Saved in config | Lost on restart | N/A |
| Local servers | Yes | Yes | No |
| Remote servers | Yes | Yes | No |

**OpenCode** manages MCP servers through its API. Servers persist across restarts.

**Claude** stores MCP configs in memory and passes them to every query. Servers are lost when the bot restarts — you'll need to re-add them.

**Codex** does not support MCP.

---

## Model Selection

OCBot supports switching between AI models at runtime.

### Listing available models

Use `/models` to see all configured models:

```
Available Models

anthropic
  claude-sonnet-4-20250514  [reasoning] [active]
  claude-opus-4-20250514  [reasoning]
  claude-haiku-4-20250514

openrouter
  deepseek/deepseek-r1  [reasoning]
```

### Capability badges

- `[reasoning]` — The model supports extended thinking/reasoning
- `[vision]` — The model accepts image input
- `[active]` — Currently selected model

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

### Provider behavior

- **OpenCode**: Lists all models from all configured providers dynamically
- **Claude**: Shows a static list (sonnet, opus, haiku)
- **Codex**: Shows a static list (o3, o4-mini)

---

## System Prompt

Customize the AI's behavior with a system prompt file.

### Default behavior

The bot loads a system prompt from `skill.md` in the project root. If the file doesn't exist, a built-in default prompt is used.

### Custom prompt file

Set a custom path:

```env
SYSTEM_PROMPT_FILE=prompts/my-prompt.md
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

The forked session becomes the active session. Supported by OpenCode and Claude.

### Deleting sessions

```
/delete abc123
```

---

## Monitoring (OpenCode)

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

**OpenCode** runs commands natively on the server.

**Claude and Codex** send the command as a prompt, asking the AI to execute it. The AI decides whether and how to run it.
