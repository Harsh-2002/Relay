# Relay

[![npm version](https://img.shields.io/npm/v/@4via6/relay)](https://www.npmjs.com/package/@4via6/relay)
[![npm downloads](https://img.shields.io/npm/dm/@4via6/relay)](https://www.npmjs.com/package/@4via6/relay)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Your personal AI agent — powered by Telegram. Browse the web, schedule tasks, run shell commands, and talk in your language. Powered by [OpenCode](https://github.com/opencode-ai/opencode) with 75+ AI providers including Anthropic, OpenAI, Google, DeepSeek, Mistral, and local models.

## Features

- **75+ AI providers** -- Anthropic, OpenAI, Google, DeepSeek, Mistral, local models, and more via OpenCode
- **Text, voice, photo, and file input** -- send messages in any format
- **Streaming responses** -- live-streamed with reasoning display in collapsible blockquotes
- **Session management** -- create, switch, fork, delete, rename, and list sessions
- **MCP tools** -- Browser, Fetch, Memory, Filesystem, GitHub, Context7, plus custom servers at runtime
- **Scheduled tasks** -- cron jobs on a schedule (interval, daily, weekly, once) with isolated sessions
- **Shell access** -- run commands on your machine directly from Telegram
- **Voice transcription** -- Groq, Sarvam, OpenAI, or AssemblyAI speech-to-text
- **Custom system prompts** -- load from `SKILL.md`, hot-reload on change
- **File operations** -- list, read, find, search, and browse project files
- **Dynamic model selection** -- models fetched from provider APIs, always up to date
- **Background daemon** -- run 24/7 with pm2, auto-restart, and remote updates
- **Reply & edit** -- reply to bot messages for context, edit sent messages to re-prompt

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [OpenCode](https://github.com/opencode-ai/opencode) (`npm i -g opencode-ai@latest`)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)

### Install

```bash
npm install -g @4via6/relay
relay onboard
```

The setup wizard walks through bot token, user ID, timezone, MCP tools, and voice transcription.

## Running

### Foreground

```bash
relay
```

### Background (daemon)

```bash
relay start                  # Start as background daemon
relay status                 # Show PID, uptime, memory
relay logs                   # Tail logs
relay restart                # Restart the daemon
relay stop                   # Stop the daemon
relay update                 # Update to latest version + restart
```

## Documentation

| Guide | Description |
|-------|-------------|
| [Getting Started](docs/getting-started.md) | Installation, prerequisites, first steps |
| [Configuration](docs/configuration.md) | All config options and CLI flags |
| [Providers](docs/providers.md) | Detailed setup for each provider |
| [Commands](docs/commands.md) | Full command reference with examples |
| [Features](docs/features.md) | Streaming, file attachments, voice, MCP, models |
| [Troubleshooting](docs/troubleshooting.md) | Common issues and solutions |

## License

MIT
