# Relay Docs

Documentation website for [Relay](https://github.com/Harsh-2002/Relay) — a Telegram bot for managing AI coding agents remotely.

Built with [Next.js](https://nextjs.org) and deployed to GitHub Pages.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to preview the docs.

## Build

```bash
npm run build
```

Static output is generated to `out/` for GitHub Pages deployment.

## Documentation Structure

Docs are written as `.mdx` files in `src/content/docs/`:

| File | Topic |
|------|-------|
| `getting-started.mdx` | Installation, setup wizard, first steps |
| `configuration.mdx` | Config fields, CLI flags, `.relay/config.json` |
| `providers.mdx` | OpenCode, Claude Code, Codex setup |
| `commands.mdx` | Full command reference |
| `features.mdx` | Streaming, voice, MCP, model selection, SKILL.md |
| `troubleshooting.mdx` | Common issues and solutions |

## Relay

Relay supports three AI coding agent backends:

- **[OpenCode](https://github.com/opencode-ai/opencode)** — full feature set, recommended
- **[Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview)** — Anthropic Claude with coding agent capabilities
- **[OpenAI Codex](https://github.com/openai/codex)** — OpenAI reasoning models

Get started:

```bash
npm install -g @4via6/relay
relay onboard
```

## License

MIT
