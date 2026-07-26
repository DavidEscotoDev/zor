# Sub-Agent System

## Overview

Sub-agents are isolated agents spawned by the main agent for focused work. Each sub-agent has its own context window, tool set, and returns only a summary to the caller.

**File**: `src/agent/subagent.ts`

## Sub-Agent Types

| Type | Purpose | Tool Access |
|------|---------|-------------|
| `explorer` | Read-only codebase exploration | Read, Grep, Glob, Ls, GitStatus |
| `reviewer` | Code quality, security, architecture review | Read, Grep, Glob, GitStatus |
| `debugger` | Reproduce bugs, trace stack traces | Read, Grep, Glob, Bash, Ls |
| `builder` | Write features, tests, docs | Full core tool set |

## How It Works

1. Main agent calls `taskTool.execute()` with a task description
2. The task is enriched with RAG context (relevant files from the codebase)
3. A sub-agent is created via `new Agent()` with an isolated `initialState`
4. The sub-agent runs independently (in parallel with other sub-agents)
5. Results are collected and summarized back to the main agent

## RAG Context

Sub-agents automatically fetch relevant files before starting:

```typescript
const contextFiles = await fetchRelevantFiles(task, config);
```

Up to 100 lines of each relevant file are included in the sub-agent's system prompt.

## Plan Tracking

Sub-agents can update a parent plan's task status:

- `done` — task completed successfully
- `failed` — task returned an error

Plan persistence is handled by `SessionManager.save()`.

## Parallel Execution

Multiple tasks can run in parallel:

```typescript
await taskTool.execute('id', {
  tasks: [
    { name: 'explorer', task: 'Find auth middleware', id: 'task-1' },
    { name: 'builder', task: 'Add rate limiting', id: 'task-2' },
  ],
});
```

## Presets

Presets are lazily initialized (`getPresets()`) to avoid circular imports between `tools.ts` and `subagent.ts`. Each preset defines:

- `systemPrompt` — role instructions for the sub-agent
- `tools` — allowed tool set
