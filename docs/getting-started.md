# Getting Started

This guide walks you through setting up OCBot from scratch.

## Prerequisites

- **[Bun](https://bun.sh/)** runtime (v1.0 or later)
- A **Telegram bot token** from [@BotFather](https://t.me/BotFather)
- Your **Telegram user ID** (get it from [@userinfobot](https://t.me/userinfobot))
- Credentials for at least one coding agent provider (see [Providers](providers.md))

## Installation

```bash
git clone https://github.com/your-org/ocbot.git
cd ocbot
bun install
```

## Configuration

Copy the example environment file and edit it:

```bash
cp .env.example .env
```

Open `.env` and set the required values:

```env
# Required for all providers
BOT_TOKEN=your-telegram-bot-token
ALLOWED_USER_ID=your-telegram-user-id

# Select your provider
PROVIDER=opencode
```

Then configure your chosen provider. See [Providers](providers.md) for detailed setup instructions.

## Running the Bot

Start the bot:

```bash
bun start
```

For development with auto-reload on file changes:

```bash
bun dev
```

You should see output like:

```
Initializing opencode provider...
opencode provider ready.
Starting Telegram bot (long polling)...
Bot @YourBotName is running!
```

## First Steps

1. Open your bot in Telegram
2. Send `/start` to verify the connection
3. Send any text message to chat with the AI
4. Use `/help` to see all available commands
5. Use `/health` to check the server status

## Project Structure

```
ocbot/
  .env.example       -- Template for environment variables
  package.json        -- Dependencies and scripts
  src/
    index.ts          -- Entry point
    bot.ts            -- Bot setup and middleware
    auth.ts           -- User authentication
    session.ts        -- Session state management
    providers/        -- Provider implementations
    commands/         -- Telegram command handlers
    utils/            -- Shared utilities
  docs/               -- This documentation
```

## Next Steps

- [Configuration Reference](configuration.md) -- All environment variables
- [Provider Setup](providers.md) -- Detailed provider configuration
- [Commands](commands.md) -- Full command reference
- [Features](features.md) -- File attachments, streaming, MCP, voice
- [Troubleshooting](troubleshooting.md) -- Common issues and fixes
