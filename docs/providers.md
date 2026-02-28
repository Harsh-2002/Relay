# Provider Setup

OCBot supports three coding agent backends. Each provider connects the bot to a different AI coding tool. Set `PROVIDER` in your `.env` file to choose one.

## OpenCode

[OpenCode](https://github.com/opencode-ai/opencode) is the recommended provider with the most complete feature set. It supports all OCBot features including file operations, todos, diffs, MCP management, and dynamic model listing.

### Installation

The OpenCode SDK is included as a core dependency -- no extra installation needed.

### Configuration

There are two modes of operation:

#### Mode 1: Start (recommended)

OCBot spawns and manages the OpenCode server automatically.

```env
PROVIDER=opencode
OPENCODE_MODE=start
OPENCODE_HOSTNAME=127.0.0.1
OPENCODE_PORT=4096
```

#### Mode 2: Connect

Connect to an already-running OpenCode server. Use this when the server is running on a different machine or managed separately.

```env
PROVIDER=opencode
OPENCODE_MODE=connect
OPENCODE_URL=http://localhost:4096
```

If you connect to a remote server over HTTP, the bot will show a warning. Use HTTPS for production deployments.

### Model Selection

OpenCode supports many AI providers and models. Set a default model:

```env
OPENCODE_MODEL=anthropic/claude-sonnet-4-20250514
```

Or change models at runtime:

```
/models              -- List all configured models
/model anthropic/claude-sonnet-4-20250514  -- Switch to a specific model
/model sonnet        -- Partial match
```

### OpenCode Configuration

OpenCode itself is configured through its own config file (typically `opencode.json` or via environment variables). Refer to the [OpenCode documentation](https://opencode.ai/docs) for:

- Adding AI providers (Anthropic, OpenAI, Google, etc.)
- Configuring MCP servers in the config file
- Setting up agent modes (build, plan, explore)
- Tool permissions and security settings

### Supported Features

All OCBot features are supported:
- Sessions, streaming, file operations
- Todo lists, diffs, session forking
- Shell access, custom commands
- MCP server management
- Dynamic model listing with capabilities
- Outbound file attachments (screenshots, generated files)

---

## Claude Code

[Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) connects to the Anthropic Claude AI with full coding agent capabilities.

### Installation

Install the Claude Code SDK:

```bash
npm install @anthropic-ai/claude-code
```

### Configuration

```env
PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-api03-...
CLAUDE_MODEL=sonnet
CLAUDE_PERMISSION_MODE=acceptEdits
CLAUDE_CWD=/path/to/your/project
```

### API Key

Get your API key from the [Anthropic Console](https://console.anthropic.com/). The key must have access to the Claude Code API.

### Models

Available models:

| Model | ID | Description |
|-------|-----|-------------|
| Claude Sonnet | `sonnet` | Fast, capable, good for most tasks |
| Claude Opus | `opus` | Most powerful, supports extended thinking |
| Claude Haiku | `haiku` | Fastest, best for simple tasks |

Switch at runtime:

```
/model sonnet
/model opus
/model haiku
```

### Permission Mode

The `CLAUDE_PERMISSION_MODE` controls how Claude handles file system operations:

- `acceptEdits` -- Automatically accept file edits (recommended for bot use)
- Other modes may require interactive approval, which won't work in a bot context

### Working Directory

Set `CLAUDE_CWD` to the project directory you want Claude to work in. Defaults to the directory where OCBot is running.

### MCP Servers

Claude supports MCP servers configured at runtime through the bot:

```
/mcp add memory local npx -y @modelcontextprotocol/server-memory
/mcp add browser local npx -y @anthropic-ai/mcp-server-puppeteer
```

MCP configs are stored in memory and passed to every Claude query. They persist for the bot's lifetime but are lost on restart.

### Supported Features

| Feature | Status |
|---------|--------|
| Chat, streaming | Supported |
| Sessions | Create, list, fork |
| Shell access | Via prompt (asks Claude to run commands) |
| MCP management | In-memory storage |
| Model selection | Static list (sonnet, opus, haiku) |
| File operations | Not supported (use chat to ask Claude) |
| Todos, diffs | Not supported |
| Session sharing | Not supported |

---

## OpenAI Codex

[OpenAI Codex](https://github.com/openai/codex) provides coding agent capabilities using OpenAI's reasoning models.

### Installation

Install the Codex SDK:

```bash
npm install @openai/codex
```

### Configuration

```env
PROVIDER=codex
CODEX_API_KEY=sk-...
CODEX_MODEL=o3
CODEX_CWD=/path/to/your/project
```

You can use either `CODEX_API_KEY` or `OPENAI_API_KEY`. If both are set, `CODEX_API_KEY` takes priority.

### Models

Available models:

| Model | ID | Description |
|-------|-----|-------------|
| o3 | `o3` | Powerful reasoning model |
| o4 Mini | `o4-mini` | Faster, more affordable |

Both models have built-in reasoning capabilities (shown as `[reasoning]` in `/models`).

### Working Directory

Set `CODEX_CWD` to the project directory. Defaults to the directory where OCBot is running.

### Supported Features

| Feature | Status |
|---------|--------|
| Chat, streaming | Supported |
| Sessions | Create, list, delete |
| Shell access | Via prompt (asks Codex to run commands) |
| MCP management | Not supported |
| Model selection | Static list (o3, o4-mini) |
| File operations | Not supported |
| Todos, diffs | Not supported |
| Session sharing | Not supported |

---

## Provider Comparison

| Feature | OpenCode | Claude | Codex |
|---------|----------|--------|-------|
| Streaming | yes | yes | yes |
| File output (screenshots) | yes | no | no |
| MCP management | full API | in-memory | no |
| Model listing | dynamic | static | static |
| Todo tracking | yes | no | no |
| Code diffs | yes | no | no |
| Session forking | yes | yes | no |
| Revert changes | yes | no | no |
| File operations | yes | no | no |
| Shell commands | native | via prompt | via prompt |
| Custom commands | yes | no | no |
| Session sharing | yes | no | no |

## Switching Providers

To switch providers, update the `PROVIDER` variable in `.env` and restart the bot:

```env
PROVIDER=claude  # or opencode, codex
```

Sessions are provider-specific and not shared between providers. Switching providers starts fresh.
