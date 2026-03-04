# Provider Setup

Relay has three types of providers: **AI model providers** (via OpenCode), **speech-to-text providers** (for voice messages), and **translation** (for non-English voice input).

---

## AI Providers (via OpenCode)

Relay uses [OpenCode](https://github.com/opencode-ai/opencode) as its AI backend, which supports 75+ AI providers through a single unified interface. The OpenCode SDK is included as a core dependency -- no extra installation needed.

### Supported Providers

| Provider | Models | Environment Variable |
|----------|--------|---------------------|
| **Anthropic** | Claude Opus, Sonnet, Haiku | `ANTHROPIC_API_KEY` |
| **OpenAI** | GPT-4, GPT-4 Turbo, o1, o3, o4-mini | `OPENAI_API_KEY` |
| **Google** | Gemini Pro, Gemini 2.0, Gemini 2.5 | `GOOGLE_API_KEY` |
| **DeepSeek** | DeepSeek V3, DeepSeek R1 | `DEEPSEEK_API_KEY` |
| **Mistral** | Mistral Large, Codestral | `MISTRAL_API_KEY` |
| **Groq** | Llama, Mixtral (fast inference) | `GROQ_API_KEY` |
| **Local models** | Ollama, LocalAI, LM Studio | Varies by runtime |

And many more -- any provider supported by OpenCode works with Relay. See the [OpenCode documentation](https://github.com/opencode-ai/opencode) for the full list.

### API Keys

Provider API keys are configured in OpenCode's environment, not in Relay's config. Set them as environment variables before starting Relay:

```bash
# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# OpenAI
export OPENAI_API_KEY="sk-..."

# Google
export GOOGLE_API_KEY="..."

# DeepSeek
export DEEPSEEK_API_KEY="..."
```

### Model Selection

Set a default model:

```
/models              -- List all configured models with interactive keyboard
/model anthropic/claude-sonnet-4-20250514  -- Switch to a specific model
/model sonnet        -- Partial match
```

Or set in config:

```json
"opencodeModel": "anthropic/claude-sonnet-4-20250514"
```

Models are fetched dynamically from all configured OpenCode providers. Each model shows capability badges: `[reasoning]` for extended thinking, `[vision]` for image input.

### Supported Features

All Relay features work with OpenCode: sessions, streaming, file operations, todos, diffs, forking, shell access, MCP management, dynamic model listing, file attachments, revert/unrevert, session sharing, and custom commands.

### OpenCode Configuration

OpenCode itself is configured through its own config file (typically `opencode.json` or via environment variables). Refer to the [OpenCode documentation](https://github.com/opencode-ai/opencode) for:

- Adding AI providers (Anthropic, OpenAI, Google, etc.)
- Configuring MCP servers in the config file
- Setting up agent modes (build, plan, explore)
- Tool permissions and security settings

---

## Speech-to-Text Providers

Voice messages in Telegram are transcribed using one of the following STT providers. Configure at least one API key to enable voice support.

### Groq

Fastest option with a free tier. Uses the Whisper model via Groq's inference API.

| Field | Value |
|-------|-------|
| Config key | `groqApiKey` |
| Model config | `groqSttModel` |
| Default model | `whisper-large-v3-turbo` |

```json
"groqApiKey": "gsk_..."
```

### Sarvam AI

Indian-language optimized STT with support for Hindi, Tamil, Telugu, and other Indian languages.

| Field | Value |
|-------|-------|
| Config key | `sarvamApiKey` |
| Model config | `sarvamSttModel` |
| Default model | `saaras:v3` |

```json
"sarvamApiKey": "..."
```

### AssemblyAI

Reliable alternative with good accuracy. Uses a two-step upload-then-transcribe flow.

| Field | Value |
|-------|-------|
| Config key | `assemblyaiApiKey` |

```json
"assemblyaiApiKey": "..."
```

### OpenAI

Standard OpenAI Whisper API.

| Field | Value |
|-------|-------|
| Config key | `openaiSttApiKey` |
| Model config | `openaiSttModel` |
| Default model | `gpt-4o-mini-transcribe` |

```json
"openaiSttApiKey": "sk-..."
```

### Auto-selection Priority

When `sttProvider` is set to `auto` (the default), the cheapest available provider is selected automatically:

1. **Groq** -- fastest, free tier available
2. **Sarvam** -- optimized for Indian languages
3. **AssemblyAI** -- reliable general-purpose
4. **OpenAI** -- widely available fallback

Override with a specific provider:

```json
"sttProvider": "groq"
```

Valid values: `auto`, `groq`, `sarvam`, `sarvam-translate`, `openai`, `assemblyai`.

---

## Translation (Sarvam)

Sarvam AI supports a **translate mode** that transcribes non-English voice messages and translates them to English in a single step. This is useful if you speak in Hindi or another Indian language but want the AI to receive English text.

### Configuration

Use the same `sarvamApiKey` as Sarvam STT. Set the provider to `sarvam-translate`:

```json
"sarvamApiKey": "...",
"sttProvider": "sarvam-translate"
```

### How it works

1. You record a voice message in any supported language (Hindi, Tamil, Telugu, etc.)
2. Sarvam transcribes the audio and translates it to English
3. The English text is sent to the AI as a regular message
4. The AI responds in English as usual

The translate mode uses the same `saaras:v3` model as regular Sarvam STT, with `mode: "translate"` enabled.
