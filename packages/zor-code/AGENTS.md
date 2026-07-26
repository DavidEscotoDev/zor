# Zor Code — Agent Instructions

## Commands
- `bun run dev` — dev mode (hot reload)
- `bun run build` — build JS bundle
- `bun run compile` — compile single binary
- `bun run test` — run tests (vitest)
- `bun run test:watch` — watch mode
- `bun run typecheck` — `tsc --noEmit`
- `bun run check` — typecheck + test (run before PR)

## Architecture Essentials
- **Entry**: `src/main.ts` → `TuiApp` (pi-tui TUI)
- **Agent factory**: `src/agent/create.ts` → `createZorAgent`
- **Tools**: `src/agent/tools.ts` — core + git + MCP + sub-agent + search
- **Providers**: `src/llm/providers.ts` — 27 providers registry
- **Config**: `src/config.ts` + `zor.json` schema
- **Sessions**: `src/session/manager.ts` — JSON persistence + compaction
- **Permissions**: `src/permissions/gate.ts` — 3-tier (auto/confirm/deny)

## Key Patterns
- **Tools**: Use `validatePath()` + `checkPathAccess()` for all file ops
- **Bash**: Never use shell redirection for file creation on Windows (use Write tool)
- **Sub-agents**: `taskTool` in `src/agent/subagent.ts` — isolated context
- **MCP**: `src/mcp/client.ts` — stdio/SSE transport
- **System prompt**: `src/agent/system-prompt.ts` — cache-optimized

## Testing
- Unit: `src/__tests__/*.test.ts`
- E2E: `src/__tests__/e2e/*.test.ts` (require API keys)
- Run single: `bun run test -- src/__tests__/tools.test.ts`

## What NOT to touch
- `dist/` — build output
- `node_modules/`
- `*.lock` files
- Provider keys in config (use `/keys` command)

## Common Tasks
| Task | Files to touch |
|------|----------------|
| Add provider | `src/llm/providers.ts`, `zor.json` schema |
| Add tool | `src/agent/tools.ts` → `coreTools` or `gitTools` |
| Add slash command | `src/commands/slash-commands.ts` |
| Change permissions | `src/permissions/gate.ts` |
| Session logic | `src/session/manager.ts`, `compact.ts` |
| TUI components | `src/tui/components/*.ts` |
