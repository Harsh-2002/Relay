# Provider Setup

Relay uses [OpenCode](https://github.com/opencode-ai/opencode) as its backend, which supports 75+ AI providers (Anthropic, OpenAI, Google, local models, etc.) through a single unified interface.

## Installation

The OpenCode SDK is included as a core dependency -- no extra installation needed.

## Configuration

There are two modes of operation:

### Mode 1: Start (recommended)

Relay spawns and manages the OpenCode server automatically. This is the default.

### Mode 2: Connect

Connect to an already-running OpenCode server. Use this when the server is running on a different machine or managed separately. Pass `--opencode-mode=connect --opencode-url=http://your-server:4096`.

If you connect to a remote server over HTTP, the bot will show a warning. Use HTTPS for production deployments.

## Model Selection

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

## OpenCode Configuration

OpenCode itself is configured through its own config file (typically `opencode.json` or via environment variables). Refer to the [OpenCode documentation](https://opencode.ai/docs) for:

- Adding AI providers (Anthropic, OpenAI, Google, etc.)
- Configuring MCP servers in the config file
- Setting up agent modes (build, plan, explore)
- Tool permissions and security settings

## Supported Features

All Relay features are supported:
- Sessions, streaming, file operations
- Todo lists, diffs, session forking
- Shell access, custom commands
- MCP server management
- Dynamic model listing with capabilities
- Outbound file attachments (screenshots, generated files)
