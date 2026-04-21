# Troubleshooting

Common issues and solutions when running Relay.

---

## Data is in the wrong place (dev vs prod mix-up)

### "My cron jobs / sessions / watches vanished"

Relay chooses one of two data directories at startup depending on how you launched it:

- `relay`, `relay start`, or `relay restart` → `~/.relay/` (production)
- `npm run dev` or `relay --dev <anything>` → `./.relay/` (current directory, for local development)

Check the startup banner Relay prints — `Relay [PROD] data=…` or `Relay [DEV]  data=…`. If it points somewhere unexpected, you launched in the wrong mode.

### "I was running dev and prod from the same repo and data ended up in `./.relay/`"

This was a bug in Relay versions prior to **v2.5.8**. The daemon launched via pm2 inherited the user's cwd, and a handful of module-level path captures pinned the data dir to whatever cwd they happened to see at import time — usually `./.relay/` when `relay start` was run from inside the repo. Upgrade:

```bash
relay update
relay restart
```

After the restart, verify the startup banner reads `[PROD] data=/home/<you>/.relay`. If there's recent data stuck in `./.relay/` inside the repo, you can migrate it:

```bash
# 1. Stop the daemon first
relay stop

# 2. Back up ~/.relay to be safe
cp -a ~/.relay ~/.relay.bak

# 3. Move the newer files one by one, inspecting each
mv /path/to/Relay/.relay/cron.json   ~/.relay/cron.json
mv /path/to/Relay/.relay/watch.json  ~/.relay/watch.json
mv /path/to/Relay/.relay/session.json ~/.relay/session.json

# 4. Restart
relay start
```

Do not blindly `cp -a` the whole directory — you'll overwrite the prod `config.json` (the dev one may have a different bot token or user ID).

### "I want to keep hacking on Relay in the repo without nuking prod data"

Use `npm run dev` (or `relay --dev` for any subcommand) when you work inside the repo. The banner will read `[DEV]` and state goes to `./.relay/`. Your production `~/.relay/` stays untouched.

---

## Bot won't start

### "No config found" / setup wizard starts automatically

No configuration file exists. Run the interactive setup wizard:

```bash
relay onboard
```

This creates `~/.relay/config.json` with your bot token, user ID, and provider settings.

### "Unknown provider: xyz"

The `provider` value in your config must be `"opencode"`. Run `relay onboard` to reconfigure, or check `~/.relay/config.json`:

```json
{
  "provider": "opencode"
}
```

---

## Authentication

### Bot doesn't respond to messages

Relay only responds to authorized users. Check `allowedUserId` in `~/.relay/config.json`:

```json
{
  "allowedUserId": 123456789
}
```

To find your Telegram user ID, send a message to [@userinfobot](https://t.me/userinfobot).

---

## OpenCode Issues

### "Failed to start OpenCode server"

Relay couldn't spawn the OpenCode server. Check:

1. OpenCode is installed and in your PATH
2. The port isn't already in use:
   ```bash
   lsof -i :39147
   ```
3. Check the configured host and port in `~/.relay/config.json`:
   ```json
   {
     "opencodeHostname": "127.0.0.1",
     "opencodePort": 39147
   }
   ```

---

## Voice Messages

### "No STT provider available"

No speech-to-text provider is configured. Run `relay onboard` and enable voice transcription, or add API keys to `~/.relay/config.json`:

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

### Fetch MCP fails to start

The Fetch MCP uses `uvx` (Python package runner), not `npx`. Make sure `uv` is installed:

```bash
# Linux/macOS
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows (PowerShell)
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

After installing, restart your terminal so `uvx` is in your PATH.

### OpenCode not found

Relay requires [OpenCode](https://github.com/opencode-ai/opencode) as its AI backend. Install it via npm:

```bash
npm i -g opencode-ai@latest
```

If you get a permission error, try `sudo npm i -g opencode-ai@latest` (Linux/macOS) or run the terminal as Administrator (Windows).

### Memory MCP data location

Memory MCP stores its knowledge graph in `~/.relay/memory.jsonl` (or `./.relay/memory.jsonl` in dev mode). The file is created automatically when the Memory MCP is first used. Data persists across conversations and bot restarts.


---

## Streaming

### Messages appear laggy

Message edit updates are throttled by `streamEditIntervalMs` (default 2000ms). Lower the value in `~/.relay/config.json` for faster updates, but very low values may hit Telegram rate limits.

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
2. Check that the file path is correct in `~/.relay/config.json`:
   ```json
   {
     "systemPromptFile": "path/to/SKILL.md"
   }
   ```
3. Verify the file exists and is readable

### "/system" shows "default prompt"

No custom prompt file was found. Create `~/.relay/SKILL.md` or set `systemPromptFile` in your config to point to your prompt file.

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

## Web Monitoring

### "Cannot monitor this URL"

The URL failed the upfront validation fetch. Common causes:

- **DNS resolution failed**: The domain doesn't exist or isn't reachable
- **HTTP 403/401**: The site requires authentication or blocks bots
- **Timeout**: The site took longer than 30 seconds to respond

Check the URL is correct and publicly accessible. Some sites block requests without a browser — Relay uses a plain HTTP fetch with `User-Agent: Relay-Watch/1.0`.

### "Page returned very little content (X words)"

The URL returned fewer than 50 words of text content. This usually means:

- **JavaScript-rendered page (SPA)**: The page uses React/Vue/Angular and renders content client-side. Plain HTTP only gets the HTML shell. Try monitoring the API endpoint the page fetches instead
- **Cloudflare bot protection**: The page returned a "Just a moment..." challenge page. These cannot be bypassed with plain HTTP

The watch is still created (with a warning) so you can test it, but it likely won't detect meaningful changes.

### Watch never reports changes

- Check the watch is enabled (`/watch` → verify `[ON]` status)
- The first fetch after creation is the baseline — changes are only detected from the second check onward. With upfront validation, the baseline is captured at creation time
- If the page content is thin (SPA/bot protection), every check returns the same empty content — no change detected. Check for the low word count warning
- Use the "Check Now" button to trigger an immediate check

### Watch auto-disabled

After 5 consecutive fetch errors, the watch is automatically disabled to prevent noise. Use `/watch` to re-enable it. If the URL is permanently unreachable, delete the watch.

---

## General

### Bot is slow to respond

- Check your internet connection
- The AI provider may be experiencing high load
- Larger models (opus, o3) are slower than smaller ones (haiku, o4-mini)
- Check the OpenCode server's health with `/health`

### "Operation timed out"

The AI took too long to respond. This can happen with complex requests. Try:

- Simplifying your request
- Using a faster model (`/model haiku` or `/model o4-mini`)
- Breaking the task into smaller steps

### Telegram message formatting looks wrong

Relay sends messages in HTML format. If you see raw HTML tags, there may be an escaping issue. Report it as a bug.
