# Getting Started

This guide walks you through setting up Relay from scratch.

## Prerequisites

- **[Node.js](https://nodejs.org/)** >= 18 (or **[Bun](https://bun.sh/)**)
- **[OpenCode](https://github.com/opencode-ai/opencode)** -- the AI backend (`npm i -g opencode-ai@latest`)
- A **Telegram bot token** from [@BotFather](https://t.me/BotFather)
- Your **Telegram user ID** (get it from [@userinfobot](https://t.me/userinfobot))
- An AI provider configured in OpenCode (see [Providers](providers.md))

## Installation

Relay is published as [`@4via6/relay`](https://www.npmjs.com/package/@4via6/relay) on npm:

```bash
npm install -g @4via6/relay
```

Or run directly without installing:

```bash
npx @4via6/relay
```

## Configuration

Run the interactive setup wizard:

```bash
relay onboard
```

The wizard walks through 6 steps:
1. **OpenCode** -- detects installation, offers to install via npm
2. **Bot Token** -- Telegram bot token from @BotFather (validated on entry)
3. **User ID** -- your Telegram user ID (validated on entry)
4. **Timezone** -- select your timezone from common options or type any IANA timezone
5. **MCP Tools** -- enable Browser (Playwright), Fetch (web pages), Memory (knowledge graph), Filesystem (external file access), GitHub (requires PAT), Context7 (library docs)
6. **Voice Transcription** -- optional STT provider (Groq, OpenAI, AssemblyAI, Sarvam)

Re-run `relay onboard` anytime to update settings — existing values are shown and can be kept by pressing Enter.

Config is saved to `~/.relay/config.json`.

You can also pass settings as CLI flags:

```bash
relay --bot-token=xxx --allowed-user-id=123
```

See [Configuration](configuration.md) for all available options.

## Running the Bot

### Foreground (default)

```bash
relay
```

On first run with no config, the setup wizard starts automatically.

### Background (daemon mode)

Run the bot as a background service that survives terminal closure:

```bash
relay start                  # Start as background daemon
relay status                 # Check if running (PID, uptime, memory)
relay logs                   # Tail daemon logs (Ctrl+C to exit)
relay restart                # Restart the daemon
relay stop                   # Stop the daemon
relay autostart              # Register pm2 with your init system so the daemon auto-starts on boot
```

pm2 is auto-installed on first `relay start`. CLI flags are forwarded.

### Surviving reboots

`relay autostart` registers pm2 with your OS init system — systemd (Linux), launchd (macOS), OpenRC, upstart, rcd (BSD), or smf (Solaris) — so the daemon comes back automatically after kernel upgrades or reboots. It runs pm2's startup helper with `sudo -n` when available, otherwise it prints the exact one-time command to copy.

- Linux / macOS / BSD — works out of the box
- Windows — prints a hint pointing to `pm2-windows-startup`, since pm2's native startup helper doesn't support Windows
- Alpine minimal (no sudo) — the printed command uses `sudo`; substitute `doas` as the hint explains

### Updating

```bash
relay update
```

Detects install method (npm global vs git source), updates to the latest version, and restarts the daemon automatically if it's running.

## First Steps

1. Open your bot in Telegram
2. Send `/start` to verify the connection
3. Send any text message to chat with the AI
4. Use `/help` to see all available commands
5. Use `/health` to check the server status

## Data Directory

Relay stores its data in **`~/.relay/`** (production) or **`./.relay/`** (dev, when `--dev` is set or via `npm run dev`):

```
{dataDir}/
  config.json         -- Your configuration
  session.json        -- Active session, model, agent, STT provider
  cron.json           -- Scheduled task definitions and run history
  watch.json          -- Web monitoring definitions, snapshots, and check history
  SKILL.md            -- Custom system prompt (optional, create manually)
  RELAY.md            -- Auto-generated assembled system prompt (base + MCP docs)
  memory.jsonl        -- Memory MCP data (created when Memory is enabled)
  uploads/            -- Cached Telegram downloads (auto-pruned hourly)
```

Relay prints the active mode and directory on every startup so you always know which one is live:

```
  Relay [PROD] data=/home/alice/.relay
```

If you see `[DEV]`, you're running against the repo-local directory. If you see `[PROD]` with a repo path, something is wrong — run `relay status` and check the banner.

Precedence for the data directory: `--data-dir <path>` > `--dev` > `RELAY_DATA_DIR` env var > `~/.relay/`.

## Next Steps

- [Configuration Reference](configuration.md) -- All config options and CLI flags
- [Provider Setup](providers.md) -- Detailed provider configuration
- [Commands](commands.md) -- Full command reference
- [Features](features.md) -- File attachments, streaming, MCP, voice
- [Troubleshooting](troubleshooting.md) -- Common issues and fixes
