# Zor

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Bun](https://img.shields.io/badge/Bun-1.2-black?style=flat-square&logo=bun)](https://bun.sh)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](#license)
[![CI](https://github.com/zor-ai/zor/actions/workflows/ci.yml/badge.svg)](https://github.com/zor-ai/zor/actions/workflows/ci.yml)

**TL;DR** — Open-source AI coding agent for the terminal. 27 LLM providers, local models, MCP tools, sub-agents, encrypted sessions, permission gates. Runs where your terminal does.

---

## Why Zor

AI coding agents shouldn't lock you into one provider, phone home, or hide how they work. Zor is:

**Multi-provider by design** — Switch between Anthropic, OpenAI, Google, DeepSeek, Groq, xAI, together, perplexity, nvidia, ollama and 18 more. Provider change is a slash command away, not a config rewrite.

**Offline-capable** — Pair with Ollama for fully local operation. No internet required, no data leaves your machine.

**Extensible via MCP** — Connect any [Model Context Protocol](https://modelcontextprotocol.io) server to add custom tools, data sources, or integrations.

**Transparent** — Every decision logged, sessions are plain JSON (encrypted at rest), permission system shows exactly what's about to run before it executes.

---

## Quick Start (≤3 commands)

```bash
curl -fsSL https://raw.githubusercontent.com/zor-ai/zor/main/install.sh | sh
zor-code keys set anthropic sk-ant-xxxxxxxxxxxx
zor-code
```

Or build from source:

```bash
git clone https://github.com/zor-ai/zor
cd zor
bun install
bun run --filter zor-code compile
./packages/zor-code/dist/zor-code.exe
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    TUI (pi-tui)                          │
│  Status bar · model info · token count · spinner        │
│  Message log · command palette · session picker         │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                    Agent Core                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐   │
│  │ System    │  │ Tools    │  │ Slash Commands        │   │
│  │ Prompt    │  │ Registry │  │ /model /effort /keys  │   │
│  └──────────┘  └──────────┘  │ /fork /cost /status   │   │
│                   │          └──────────────────────┘   │
│        ┌──────────┴──────────┐                           │
│        ▼                     ▼                           │
│  ┌──────────┐          ┌──────────┐                      │
│  │ MCP      │          │ Sub-     │                      │
│  │ Client   │          │ agents   │                      │
│  └──────────┘          └──────────┘                      │
└──────────────────────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                    Persistence                            │
│  Sessions (JSON) · Keys (encrypted AES-256-GCM)          │
│  Config (zor.json) · Audit logs                          │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                    Security                               │
│  Permission gate (auto/confirm/deny)                     │
│  Path validation · protected patterns                    │
│  Sandbox mode (WSL2/Lima/Docker)                         │
└──────────────────────────────────────────────────────────┘
```

---

## Key Features

### Multi-Provider Engine

27 providers, one interface. Swap mid-session:

| Provider | Env Variable |
|----------|-------------|
| Anthropic | `ANTHROPIC_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Google Gemini | `GOOGLE_API_KEY` |
| DeepSeek | `DEEPSEEK_API_KEY` |
| Groq | `GROQ_API_KEY` |
| xAI (Grok) | `XAI_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| Together | `TOGETHER_API_KEY` |
| Perplexity | `PERPLEXITY_API_KEY` |
| Cohere | `COHERE_API_KEY` |
| Mistral | `MISTRAL_API_KEY` |
| NVIDIA NIM | `NVIDIA_API_KEY` |
| Fireworks | `FIREWORKS_API_KEY` |
| DeepInfra | `DEEPINFRA_API_KEY` |
| Novita | `NOVITA_API_KEY` |
| Cerebras | `CEREBRAS_API_KEY` |
| MiniMax | `MINIMAX_API_KEY` |
| Moonshot AI | `MOONSHOTAI_API_KEY` |
| Z.ai | `ZAI_API_KEY` |
| Cloudflare | `CLOUDFLARE_API_KEY` |
| GitHub Copilot | `GITHUB_COPILOT_API_KEY` |
| Amazon Bedrock | env-based auth |
| Azure OpenAI | `AZURE_OPENAI_API_KEY` |
| Google Vertex | env-based auth |
| Ollama (local) | — |
| opencode-go | `OPENCODE_API_KEY` |

```bash
/model anthropic/claude-sonnet-4-20250514
/model openai/gpt-5
/model google/gemini-2.5-pro
/model deepseek/deepseek-chat
/model ollama/qwen2.5-coder:14b
```

### Security Model

Three-tier permission system that gates every destructive action:

| Level | Behavior |
|-------|----------|
| **auto** | Allow all (single-user workstation) |
| **confirm** | Show every command before execution (default) |
| **deny** | Block all destructive operations (read-only) |

Protected file patterns are enforced at the tool level — `.env`, `credentials`, `secrets`, `*.pem`, `id_rsa`, `.ssh/`, `.git/config` are never readable or writable through Zor tools.

### Sub-Agent Orchestration

Spawn isolated agents for parallel work:

```
/plan "Refactor auth middleware, add rate limiting"
  ├── task-1: explorer → "Find auth middleware files"
  ├── task-2: builder  → "Add rate limiting"
  └── task-3: reviewer → "Review changes"
```

Each sub-agent runs with an independent context, tool set, and model. Results are collected and summarized.

### MCP Integration

Connect any [MCP server](https://modelcontextprotocol.io) for custom tooling — filesystem access, databases, APIs, or custom business logic:

```json
{
  "mcp": {
    "servers": [{
      "transport": "stdio",
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem", "."]
    }]
  }
}
```

### Context Management

Auto-compaction keeps sessions within context windows without losing important context. Sessions persist as JSON, forkable for branching explorations.

---

## Slash Commands

| Command | Description |
|---------|-------------|
| `/effort <level>` | Set thinking effort (off/low/medium/high/xhigh) |
| `/model <target>` | Switch model |
| `/keys list` | Show API key status |
| `/keys set <p> <k>` | Store an API key |
| `/keys remove <p>` | Remove a stored key |
| `/providers` | List all supported providers |
| `/models` | List all available models |
| `/ollama` | Check Ollama status and local models |
| `/fork` | Branch current session |
| `/tree` | Show session tree |
| `/cost` | Show token usage and cost estimate |
| `/compact` | Force context compaction |
| `/status` | Show active model, effort, and tools |
| `/clear` | Clear screen |
| `/help` | Show help |

---

## Configuration

Project-level `zor.json` or global `~/.zor/zor.json`:

```json
{
  "$schema": "https://zor-ai.github.io/zor/schema.json",
  "model": "anthropic/claude-sonnet-4-20250514",
  "effort": "high",
  "permissions": "confirm",
  "sandbox": false,
  "session": {
    "dir": "./.zor/sessions",
    "compactThreshold": 160000
  },
  "mcp": {
    "servers": []
  }
}
```

---

## API Key Management

Keys are stored encrypted at rest (`~/.zor/keys.json`, AES-256-GCM):

```bash
# Via environment variables
export ANTHROPIC_API_KEY=sk-ant-xxxx

# Via /keys command (encrypted persistent storage)
zor-code keys set anthropic sk-ant-xxxx
zor-code keys list
zor-code keys remove openai
```

---

## Project Structure

```
zor-code/
├── src/
│   ├── main.ts                 TUI entry point (pi-tui)
│   ├── config.ts               Config schema + defaults
│   ├── agent/
│   │   ├── create.ts           Agent factory
│   │   ├── tools.ts            Tool registry
│   │   ├── subagent.ts         Task sub-agent system
│   │   └── system-prompt.ts    Cache-optimized system prompt
│   ├── commands/
│   │   └── slash-commands.ts   /commands implementation
│   ├── llm/
│   │   ├── providers.ts        27 provider registry
│   │   ├── keys.ts             Encrypted key storage
│   │   ├── resolve.ts          Model resolution + aliases
│   │   └── ollama.ts           Ollama client
│   ├── mcp/
│   │   └── client.ts           MCP transport (stdio/SSE)
│   ├── session/
│   │   ├── manager.ts          Session persistence
│   │   └── compact.ts          Context compaction
│   ├── permissions/
│   │   └── gate.ts             3-tier permission gate
│   ├── tui/
│   │   └── app.ts              TUI application + components
│   └── utils/
│       ├── encrypt.ts          AES-256-GCM encryption
│       └── tokens.ts           Token counting (tiktoken)
├── docs/
│   ├── providers.md            Provider reference
│   ├── mcp.md                  MCP server guide
│   └── sub-agents.md           Sub-agent orchestration
├── zor.json                    Default config
└── install.sh                  Unix installer
```

---

## Development

```bash
git clone https://github.com/zor-ai/zor
cd zor
bun install

# Dev mode with hot reload
bun run dev

# Build
bun run build

# Compile to binary
bun run compile

# Type check
bun run typecheck

# Run tests
bun run test

# Full check (typecheck + test)
bun run check
```

**Key commands**:

| Command | Description |
|---------|-------------|
| `bun run dev` | Dev mode (hot reload) |
| `bun run build` | Build JS bundle |
| `bun run compile` | Compile single binary |
| `bun run test` | Run vitest tests |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run check` | typecheck + test |

---

## Local Models (Ollama)

```bash
ollama pull qwen2.5-coder:14b

# Zor auto-detects Ollama on startup
zor-code

# In TUI:
/ollama                    # List local models
/model ollama/qwen2.5-coder:14b
```

---

## Related Projects

- [Kalshi Trading Bot](https://github.com/DavidEscotoDev/kalshi_bot) — Production-grade autonomous trading with kill switches, Kelly sizing, and shadow-mode validation

---

## License

MIT License — see [LICENSE](./LICENSE) for details.
