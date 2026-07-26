# Zor

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Bun](https://img.shields.io/badge/Bun-1.2-black?style=flat-square&logo=bun)](https://bun.sh)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
[![CI](https://github.com/zor-ai/zor/actions/workflows/ci.yml/badge.svg)](https://github.com/zor-ai/zor/actions/workflows/ci.yml)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](CONTRIBUTING.md)

**TL;DR** — Open-source AI coding agent for the terminal. 27 LLM providers, local models, MCP tools, sub-agents, encrypted sessions, permission gates. Works on macOS, Linux, Windows.

---

## Why Zor

AI coding agents shouldn't lock you into one provider, phone home, or hide how they work.

**Multi-provider by design** — Switch between Anthropic, OpenAI, Google, DeepSeek, Groq, xAI, Together, Perplexity, NVIDIA, Ollama, and 18 more. Provider change is a slash command, not a config rewrite.

**Offline-capable** — Pair with Ollama for fully local operation. No internet required, no data leaves your machine.

**Extensible via MCP** — Connect any [Model Context Protocol](https://modelcontextprotocol.io) server for custom tools, data sources, and integrations.

**Transparent** — Every decision logged. Sessions are JSON (encrypted at rest). Permission system shows exactly what's about to run before it executes.

---

## Quick Start

```bash
# Install (macOS/Linux)
curl -fsSL https://raw.githubusercontent.com/zor-ai/zor/main/install.sh | sh

# Or Windows (PowerShell)
irm https://raw.githubusercontent.com/zor-ai/zor/main/install.ps1 | iex

# Set an API key
zor-code keys set anthropic sk-ant-xxxxxxxxxxxx

# Run
zor-code
```

### Build from Source

```bash
git clone https://github.com/zor-ai/zor.git
cd zor
bun install
bun run build
bun run compile
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
│  Sessions (JSON) · Keys (AES-256-GCM)                    │
│  Config (zor.json) · Audit logs                          │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                    Security                               │
│  Permission gate (auto/confirm/deny)                     │
│  Path validation · protected file patterns               │
│  Sandbox mode (WSL2/Lima/Docker)                         │
└──────────────────────────────────────────────────────────┘
```

---

## Features

### Multi-Provider Engine

| Provider | Env Variable              |
|----------|---------------------------|
| Anthropic | `ANTHROPIC_API_KEY`      |
| OpenAI   | `OPENAI_API_KEY`         |
| Google Gemini | `GOOGLE_API_KEY`    |
| DeepSeek | `DEEPSEEK_API_KEY`       |
| Groq     | `GROQ_API_KEY`           |
| xAI (Grok) | `XAI_API_KEY`         |
| OpenRouter | `OPENROUTER_API_KEY`  |
| Together | `TOGETHER_API_KEY`       |
| Perplexity | `PERPLEXITY_API_KEY`   |
| Cohere   | `COHERE_API_KEY`         |
| Mistral  | `MISTRAL_API_KEY`        |
| NVIDIA NIM | `NVIDIA_API_KEY`       |
| Fireworks | `FIREWORKS_API_KEY`     |
| DeepInfra | `DEEPINFRA_API_KEY`     |
| Ollama (local) | — (no key)            |
| *+ 12 more* |                      |

Swap mid-session: `/model anthropic/claude-sonnet-4-20250514`

### Local Models

Pair with [Ollama](https://ollama.com) for fully offline operation:

```bash
ollama pull qwen2.5-coder:14b
zor-code
/model ollama/qwen2.5-coder:14b
```

### Permission System

Three tiers gate every destructive action:

| Level | Behavior |
|-------|----------|
| **auto** | Allow all (single-user workstation) |
| **confirm** | Review before execution (default) |
| **deny** | Block all destructive ops (read-only) |

Protected patterns (`.env`, `credentials`, `*.pem`, `id_rsa`, `.ssh/`, `.git/config`) are enforced at the tool level — never readable or writable through Zor.

### Sub-Agent Orchestration

```bash
/plan "Refactor auth middleware, add rate limiting"
```

Spawns parallel agents (`explorer`, `builder`, `reviewer`) with isolated contexts. Results collected and summarized.

### MCP Integration

Connect any MCP server in `zor.json`:

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

Auto-compaction keeps sessions within context windows. Sessions persist as JSON, forkable for branching explorations.

---

## Slash Commands

| Command | Description |
|---------|-------------|
| `/effort <level>` | Set thinking effort (off/low/medium/high/xhigh) |
| `/model <target>` | Switch model |
| `/keys list\|set\|remove` | Manage API keys |
| `/providers` | List all providers |
| `/models` | List all models |
| `/ollama` | Check Ollama status |
| `/fork` | Branch session |
| `/tree` | Session tree |
| `/compact` | Force context compaction |
| `/cost` | Token usage and cost |
| `/status` | Active model, effort, tools |
| `/clear` | Clear screen |
| `/help` | Help |
| `/exit` | Exit |

---

## Configuration

Project-level `zor.json` or global `~/.zor/zor.json`:

```json
{
  "$schema": "https://zor-ai.github.io/zor/schema.json",
  "model": "anthropic/claude-sonnet-4-20250514",
  "effort": "high",
  "permissions": "confirm",
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

## API Keys

Keys stored encrypted at rest (AES-256-GCM in `~/.zor/keys.json`):

```bash
# Environment variables (recommended for CI)
export ANTHROPIC_API_KEY=sk-ant-xxxx

# Encrypted persistent storage
zor-code keys set anthropic sk-ant-xxxx
zor-code keys list
zor-code keys remove openai
```

---

## Project Structure

```
zor/
├── packages/
│   └── zor-code/           # Core application
│       └── src/
│           ├── main.ts     # TUI entry point
│           ├── agent/      # Agent factory, tools, sub-agents, system prompt
│           ├── commands/   # Slash commands
│           ├── config/     # Config loader + schema
│           ├── llm/        # 27 providers, keys, model resolution, Ollama
│           ├── mcp/        # MCP client (stdio + SSE)
│           ├── permissions/# Permission gate
│           ├── session/    # Session manager + compaction
│           ├── tui/        # Terminal UI components
│           └── utils/      # Encryption, token counting, logging
├── .github/workflows/      # CI, Docker, release, pages
├── install.sh              # Unix installer
├── install.ps1             # Windows installer
├── CONTRIBUTING.md         # Contribution guide
└── SECURITY.md             # Security policy
```

---

## Development

```bash
bun install
bun run dev         # Hot-reload development
bun run build       # Build JS bundle
bun run compile     # Compile to binary
bun run test        # Run tests (vitest)
bun run typecheck   # tsc --noEmit
bun run check       # typecheck + test
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, code style, testing, and PR workflow. PRs welcome.

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities and the security model.

---

## License

MIT — see [LICENSE](LICENSE).
