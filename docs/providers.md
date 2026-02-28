# Provider Setup

Relay supports three coding agent backends. Each provider connects the bot to a different AI coding tool. Select your provider during `relay onboard` or pass `--provider=<name>`.

## OpenCode

[OpenCode](https://github.com/opencode-ai/opencode) is the recommended provider with the most complete feature set. It supports all Relay features including file operations, todos, diffs, MCP management, and dynamic model listing.

### Installation

The OpenCode SDK is included as a core dependency -- no extra installation needed.

### Configuration

There are two modes of operation:

#### Mode 1: Start (recommended)

Relay spawns and manages the OpenCode server automatically. This is the default.

#### Mode 2: Connect

Connect to an already-running OpenCode server. Use this when the server is running on a different machine or managed separately. Pass `--opencode-mode=connect --opencode-url=http://your-server:4096`.

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

All Relay features are supported:
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

Select Claude during `relay onboard`, or pass:

```bash
relay --provider=claude --claude-model=sonnet
```

### API Key

Your `ANTHROPIC_API_KEY` must be set in the environment where Claude Code runs — this is the coding agent's responsibility, not Relay's. Get your API key from the [Anthropic Console](https://console.anthropic.com/).

### Models

Models are fetched dynamically from the Anthropic API (`GET /v1/models`), so new models are automatically available without a bot update.

Use `/models` to see all available models, and `/model <id>` to switch:

```
/models              -- List all available Anthropic models
/model sonnet        -- Switch by alias
/model claude-opus-4-0-20250514  -- Switch by full ID
```

### Permission Mode

The `CLAUDE_PERMISSION_MODE` controls how Claude handles file system operations:

- `acceptEdits` -- Automatically accept file edits (recommended for bot use)
- Other modes may require interactive approval, which won't work in a bot context

### Working Directory

Set `CLAUDE_CWD` to the project directory you want Claude to work in. Defaults to the directory where Relay is running.

### MCP Servers

Claude supports MCP servers configured at runtime through the bot:

```
/mcp add memory local npx -y @modelcontextprotocol/server-memory
/mcp add browser local npx -y @anthropic-ai/mcp-server-puppeteer
```

MCP configs are persisted to `.relay/claude-mcp.json` and automatically restored on restart.

### Supported Features

| Feature | Status |
|---------|--------|
| Chat, streaming | Supported |
| Sessions | Create, list, delete, fork |
| Shell access | Via prompt (asks Claude to run commands) |
| MCP management | Persisted to disk |
| Model selection | Dynamic (fetched from Anthropic API) |
| File operations | Via prompt delegation (read, find, search, git status) |
| Code diffs | Via prompt delegation (git diff) |
| History | Supported (session message history) |
| Todos | Not supported |
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

Select Codex during `relay onboard`, or pass:

```bash
relay --provider=codex --codex-model=o3
```

### API Key

Your `CODEX_API_KEY` or `OPENAI_API_KEY` must be set in the environment where Codex runs — this is the coding agent's responsibility, not Relay's.

### Models

Models are fetched dynamically from the OpenAI API (`GET /v1/models`), so new models are automatically available without a bot update.

Use `/models` to see all available models, and `/model <id>` to switch:

```
/models              -- List all available OpenAI models
/model o3            -- Switch to o3
/model o4-mini       -- Switch to o4-mini
```

### Working Directory

Set `CODEX_CWD` to the project directory. Defaults to the directory where Relay is running.

### Supported Features

| Feature | Status |
|---------|--------|
| Chat, streaming | Supported |
| Sessions | Create, list, delete (persisted to disk) |
| Shell access | Via prompt (asks Codex to run commands) |
| MCP management | Not supported |
| Model selection | Dynamic (fetched from OpenAI API) |
| File operations | Via prompt delegation (read, find, search, git status) |
| Code diffs | Via prompt delegation (git diff) |
| Todos | Not supported |
| Session sharing | Not supported |

---

## Provider Comparison

| Feature | OpenCode | Claude | Codex |
|---------|----------|--------|-------|
| Streaming | yes | yes | yes |
| File output (screenshots) | yes | no | no |
| MCP management | full API | persisted | no |
| Model listing | dynamic | dynamic (API) | dynamic (API) |
| Todo tracking | yes | no | no |
| Code diffs | yes | via prompt | via prompt |
| Session forking | yes | yes | no |
| Revert changes | yes | no | no |
| File operations | yes | via prompt | via prompt |
| History | yes | yes | no |
| Shell commands | native | via prompt | via prompt |
| Custom commands | yes | no | no |
| Session sharing | yes | no | no |
| State persistence | via config | yes | yes |

## Switching Providers

To switch providers, run `relay onboard` and select a different provider, or pass `--provider=<name>`:

```bash
relay --provider=claude
```

Sessions are provider-specific and not shared between providers. Switching providers starts fresh.
