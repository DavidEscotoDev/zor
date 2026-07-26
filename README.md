# Zor

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Bun](https://img.shields.io/badge/Bun-1.2-black?style=flat-square&logo=bun)](https://bun.sh)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](https://github.com/zor-ai/zor/blob/main/LICENSE)
[![CI](https://github.com/zor-ai/zor/actions/workflows/ci.yml/badge.svg)](https://github.com/zor-ai/zor/actions/workflows/ci.yml)

Open-source AI coding agent for the terminal. 27 LLM providers, local models, MCP tools, sub-agents, encrypted sessions, permission gates.

```
curl -fsSL https://raw.githubusercontent.com/zor-ai/zor/main/install.sh | sh
zor-code keys set anthropic sk-ant-xxxxxxxxxxxx
zor-code
```

## Packages

| Package | Description |
|---------|-------------|
| [zor-code](packages/zor-code/) | Core AI coding agent — TUI, agent loop, providers, tools, MCP |

## Build

```bash
bun install
bun run build
bun run compile
```

## License

MIT
