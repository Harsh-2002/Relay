# Troubleshooting

Common issues and solutions when running Relay.

---

## Bot won't start

### "No config found" / setup wizard starts automatically

No configuration file exists. Run the interactive setup wizard:

```bash
relay onboard
```

This creates `.relay/config.json` with your bot token, user ID, and provider settings.

### "Unknown provider: xyz"

The `provider` value in your config must be `"opencode"`. Run `relay onboard` to reconfigure, or check `.relay/config.json`:

```json
{
  "provider": "opencode"
}
```

---

## Authentication

### Bot doesn't respond to messages

Relay only responds to authorized users. Check `allowedUserId` in `.relay/config.json`:

```json
{
  "allowedUserId": 123456789
}
```

To find your Telegram user ID, send a message to [@userinfobot](https://t.me/userinfobot).

---

## OpenCode Issues

### "Connection refused" when using connect mode

The OpenCode server isn't running or isn't reachable at the configured URL:

1. Check that the OpenCode server is running
2. Verify the URL in `.relay/config.json`:
   ```json
   {
     "opencodeMode": "connect",
     "opencodeUrl": "http://localhost:4096"
   }
   ```
3. If the server is on a different machine, ensure the port is open and the host is correct

### "Failed to start OpenCode server" in start mode

Relay couldn't spawn the OpenCode server. Check:

1. OpenCode is installed and in your PATH
2. The port isn't already in use:
   ```bash
   lsof -i :4096
   ```
3. Check the configured host and port in `.relay/config.json`:
   ```json
   {
     "opencodeHostname": "127.0.0.1",
     "opencodePort": 4096
   }
   ```

### HTTP warning for remote OpenCode

If you see a warning about connecting over HTTP, it means your `opencodeUrl` uses `http://` instead of `https://`. This is fine for local development but use HTTPS for production:

```json
{
  "opencodeUrl": "https://your-server.example.com:4096"
}
```

---

## Voice Messages

### "No STT provider available"

No speech-to-text provider is configured. Run `relay onboard` and enable voice transcription, or add API keys to `.relay/config.json`:

```json
{
  "groqApiKey": "gsk_...",
  "openaiSttApiKey": "sk-...",
  "assemblyaiApiKey": "..."
}
```

At least one key is required. Groq is recommended (fastest, has a free tier).

### Voice transcription is inaccurate

- Speak clearly and minimize background noise
- Try a different STT provider — Groq and OpenAI Whisper generally produce good results
- Very short voice messages (under 1 second) may not transcribe well

---

## MCP Servers

### MCP server shows "failed" status

Run `/mcp` to check the error message. Common causes:

1. **Command not found**: The MCP server command isn't installed
   ```bash
   # Install the server package first
   npx -y @modelcontextprotocol/server-memory
   ```

2. **Connection refused** (remote servers): The URL is wrong or the server is down

3. **Permission denied**: The command doesn't have execute permissions


---

## Streaming

### Messages appear jumpy or laggy

Telegram rate limits message edits. Relay batches updates to avoid hitting limits, but on slow connections you may notice slight delays. This is normal behavior.

### "Message is not modified" warnings in logs

This happens when a stream update has the same content as the current message. It's harmless and can be ignored.

### Very long responses get cut off

Telegram messages have a 4096-character limit. Relay automatically splits long responses into multiple messages. If a response seems incomplete, it may still be generating — wait for the stream to finish.

---

## Model Selection

### "/model sonnet" doesn't work

Partial model matching searches through available models. If the match is ambiguous, try a more specific name:

```
/model anthropic/claude-sonnet-4-20250514
```

Use `/models` to see all available model IDs.

### No models listed

Check that your OpenCode config has providers and models configured. Models are fetched dynamically — if no provider API keys are set in OpenCode, no models will be listed.

---

## System Prompt

### Changes to SKILL.md aren't picked up

The file watcher should detect changes automatically. If it doesn't:

1. Use `/system reload` to force a reload
2. Check that the file path is correct in `.relay/config.json`:
   ```json
   {
     "systemPromptFile": "path/to/SKILL.md"
   }
   ```
3. Verify the file exists and is readable

### "/system" shows "default prompt"

No custom prompt file was found. Create `.relay/SKILL.md` or set `systemPromptFile` in your config to point to your prompt file.

---

## Daemon Mode

### pm2 fails to install

If `relay start` can't install pm2 automatically, install it manually:

```bash
sudo npm install -g pm2
```

On some systems you may need to fix npm's global prefix permissions instead of using `sudo`. See the [npm docs](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally) for details.

### Daemon won't start

1. Check if another instance is already running: `relay status`
2. Check logs for errors: `relay logs`

### "Relay daemon is not running" but the bot was started

The bot may be running in foreground mode (plain `relay`), not as a daemon. Daemon commands only manage the background pm2 process. Stop the foreground process and use `relay start` instead.

### Where are daemon logs?

pm2 stores logs in `~/.pm2/logs/`. You can view them with:

```bash
relay logs                   # Tail recent output
```

Or access the raw files directly:

```
~/.pm2/logs/relay-out.log    # stdout
~/.pm2/logs/relay-error.log  # stderr
```

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

Relay sends messages in HTML format. If you see raw HTML tags, there may be an escaping issue. Report it as a bug.
