# Getting Started

This guide walks you through setting up Relay from scratch.

## Prerequisites

- **[Node.js](https://nodejs.org/)** >= 18 (or **[Bun](https://bun.sh/)**)
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

The wizard will ask for:
1. Your Telegram bot token
2. Your Telegram user ID
3. OpenCode connection mode (start or connect)
4. Optional voice transcription (STT) provider and API key
5. Optional headless browser (Playwright MCP)

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
```

pm2 is auto-installed on first `relay start`. CLI flags are forwarded.

### Updating

```bash
relay update
```

Updates to the latest version. Restarts the daemon automatically if it's running.

## First Steps

1. Open your bot in Telegram
2. Send `/start` to verify the connection
3. Send any text message to chat with the AI
4. Use `/help` to see all available commands
5. Use `/health` to check the server status

## Project Structure

```
~/.relay/               -- Config and persisted state (auto-created, global)
relay/                  -- Project directory (if developing from source)
    config.json         -- Your configuration
    session.json        -- Active session state
    SKILL.md            -- Custom system prompt (optional)
  package.json          -- Dependencies and scripts
  src/
    cli.ts              -- CLI entry point (onboard, --help, --version)
    index.ts            -- Bot startup
    bot.ts              -- Bot setup and middleware
    auth.ts             -- User authentication
    session.ts          -- Session state management
    config/             -- Config schema, loader, setup wizard
    providers/          -- Provider implementations
    commands/           -- Telegram command handlers
    utils/              -- Shared utilities (logger, store, stream, etc.)
  docs/                 -- This documentation
```

## Next Steps

- [Configuration Reference](configuration.md) -- All config options and CLI flags
- [Provider Setup](providers.md) -- Detailed provider configuration
- [Commands](commands.md) -- Full command reference
- [Features](features.md) -- File attachments, streaming, MCP, voice
- [Troubleshooting](troubleshooting.md) -- Common issues and fixes
