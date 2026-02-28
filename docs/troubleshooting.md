# Troubleshooting

Common issues and solutions when running OCBot.

---

## Bot won't start

### "BOT_TOKEN is required"

You haven't set the Telegram bot token. Add it to your `.env` file:

```env
BOT_TOKEN=123456:ABC-DEF...
```

Get a token from [@BotFather](https://t.me/BotFather) on Telegram.

### "Unknown provider: xyz"

The `PROVIDER` value in `.env` is not one of `opencode`, `claude`, or `codex`. Check for typos:

```env
PROVIDER=opencode
```

### "Cannot find package '@anthropic-ai/claude-code'"

The Claude Code SDK is not installed. Install it:

```bash
bun add @anthropic-ai/claude-code
```

### "Cannot find package '@openai/codex'"

The Codex SDK is not installed. Install it:

```bash
bun add @openai/codex
```

---

## Authentication

### Bot doesn't respond to messages

OCBot only responds to authorized users. Check your `ALLOWED_USER_ID`:

```env
ALLOWED_USER_ID=123456789
```

To find your Telegram user ID, send a message to [@userinfobot](https://t.me/userinfobot).

### Multiple users

Separate multiple user IDs with commas:

```env
ALLOWED_USER_ID=123456789,987654321
```

---

## OpenCode Issues

### "Connection refused" when using connect mode

The OpenCode server isn't running or isn't reachable at the configured URL:

1. Check that the OpenCode server is running
2. Verify the URL in your `.env`:
   ```env
   OPENCODE_URL=http://localhost:4096
   ```
3. If the server is on a different machine, ensure the port is open and the host is correct

### "Failed to start OpenCode server" in start mode

OCBot couldn't spawn the OpenCode server. Check:

1. OpenCode is installed and in your PATH
2. The port isn't already in use:
   ```bash
   lsof -i :4096
   ```
3. Check the configured host and port:
   ```env
   OPENCODE_HOSTNAME=127.0.0.1
   OPENCODE_PORT=4096
   ```

### HTTP warning for remote OpenCode

If you see a warning about connecting over HTTP, it means your `OPENCODE_URL` uses `http://` instead of `https://`. This is fine for local development but use HTTPS for production:

```env
OPENCODE_URL=https://your-server.example.com:4096
```

---

## Claude Code Issues

### "Invalid API key"

Your Anthropic API key is invalid or expired:

1. Check the key in `.env`:
   ```env
   ANTHROPIC_API_KEY=sk-ant-api03-...
   ```
2. Verify the key at [console.anthropic.com](https://console.anthropic.com/)
3. Ensure the key has Claude Code API access

### Claude doesn't modify files

Claude Code requires the `acceptEdits` permission mode to automatically accept file operations in a bot context:

```env
CLAUDE_PERMISSION_MODE=acceptEdits
```

Without this, Claude may prompt for interactive approval, which doesn't work in a Telegram bot.

### Wrong working directory

Claude operates in the directory specified by `CLAUDE_CWD`. If files aren't found, check the path:

```env
CLAUDE_CWD=/path/to/your/project
```

Defaults to the directory where OCBot is running.

---

## Codex Issues

### "Invalid API key"

Check your OpenAI API key:

```env
CODEX_API_KEY=sk-...
```

You can use either `CODEX_API_KEY` or `OPENAI_API_KEY`. If both are set, `CODEX_API_KEY` takes priority.

### Wrong working directory

Set the project directory:

```env
CODEX_CWD=/path/to/your/project
```

---

## Voice Messages

### "No STT provider available"

No speech-to-text provider is configured. Add at least one API key:

```env
GROQ_API_KEY=gsk_...          # Recommended (fastest, free tier)
OPENAI_API_KEY=sk-...          # Alternative
ASSEMBLYAI_API_KEY=...         # Alternative
```

### Voice transcription is inaccurate

- Speak clearly and minimize background noise
- Try a different STT provider — Groq and OpenAI Whisper generally produce good results
- Very short voice messages (under 1 second) may not transcribe well

---

## MCP Servers

### "MCP not supported" error

MCP is only available with OpenCode and Claude providers. Codex does not support MCP.

### MCP server shows "failed" status

Run `/mcp` to check the error message. Common causes:

1. **Command not found**: The MCP server command isn't installed
   ```bash
   # Install the server package first
   npx -y @modelcontextprotocol/server-memory
   ```

2. **Connection refused** (remote servers): The URL is wrong or the server is down

3. **Permission denied**: The command doesn't have execute permissions

### MCP servers disappear after restart (Claude)

Claude stores MCP configs in memory. They're passed to every query but lost when the bot restarts. Re-add them after restart:

```
/mcp add memory local npx -y @modelcontextprotocol/server-memory
```

OpenCode servers persist across restarts since they're saved in the OpenCode configuration.

---

## Streaming

### Messages appear jumpy or laggy

Telegram rate limits message edits. OCBot batches updates to avoid hitting limits, but on slow connections you may notice slight delays. This is normal behavior.

### "Message is not modified" warnings in logs

This happens when a stream update has the same content as the current message. It's harmless and can be ignored.

### Very long responses get cut off

Telegram messages have a 4096-character limit. OCBot automatically splits long responses into multiple messages. If a response seems incomplete, it may still be generating — wait for the stream to finish.

---

## Model Selection

### "/model sonnet" doesn't work

Partial model matching searches through available models. If the match is ambiguous, try a more specific name:

```
/model anthropic/claude-sonnet-4-20250514
```

Use `/models` to see all available model IDs.

### No models listed

- **OpenCode**: Check that your OpenCode config has providers and models configured
- **Claude/Codex**: Models are a static list and should always appear

---

## System Prompt

### Changes to skill.md aren't picked up

The file watcher should detect changes automatically. If it doesn't:

1. Use `/system reload` to force a reload
2. Check that the file path is correct:
   ```env
   SYSTEM_PROMPT_FILE=skill.md
   ```
3. Verify the file exists and is readable

### "/system" shows "default prompt"

No custom prompt file was found. Create `skill.md` in the project root or set `SYSTEM_PROMPT_FILE` to your prompt file path.

---

## General

### Bot is slow to respond

- Check your internet connection
- The AI provider may be experiencing high load
- Larger models (opus, o3) are slower than smaller ones (haiku, o4-mini)
- If using OpenCode in connect mode, check the server's health

### "Operation timed out"

The AI took too long to respond. This can happen with complex requests. Try:

- Simplifying your request
- Using a faster model (`/model haiku` or `/model o4-mini`)
- Breaking the task into smaller steps

### Telegram message formatting looks wrong

OCBot sends messages in HTML format. If you see raw HTML tags, there may be an escaping issue. Report it as a bug.
