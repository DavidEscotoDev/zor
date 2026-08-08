# Project-Folder Working Root — Design

Date: 2026-08-08
Status: Approved (design review)

## Problem

`zor-code` has no notion of a working folder. All file-tool paths and the
session store resolve against `process.cwd()` — wherever the user happens to
launch it from. Consequences observed in the wild:

- Files land next to wherever the terminal opens, not in a deliberate project
  directory ("file landed somewhere random").
- Sessions and files from unrelated runs mix in a shared cwd, causing
  "file already exists"-style confusion between sessions.
- There is no way to pin Zor to one folder and have everything stay inside
  it, the way Claude Code / Windsurf use a project root.

Goal: **one chosen project folder**, remembered across launches, that acts as
the working root for all file tools and as the home for sessions.

## Decisions (from brainstorming)

- Working folder model: **one chosen project folder** (not per-session
  scratch, not a manual `/workdir`).
- Selection: **remember last folder** (mirror of `last-session.json`);
  prompt only when no remembered folder exists.
- The chosen folder is a **real boundary**: it becomes the root everything
  resolves against — not merely a hint in the system prompt.
- Sessions **live inside the project folder** (`.zor/sessions`) so resuming
  lands in the same project context.

## Architecture

New module `src/project.ts` owns project-root state, mirroring the module-
state pattern of `src/agent/sandbox.ts` and the persistence pattern of
`src/llm/session-state.ts`.

```
src/project.ts
  getProjectDir(): string
  setProjectDir(dir: string): void
  loadProjectDir(): string | null        // saved dir, existsSync-checked
  saveProjectDir(dir: string): void
  resolveProjectDir(opts): { dir, remembered }
```

- Persisted file: `~/.zor/last-project.json` → `{ dir, updatedAt }`.
- Validity: a saved dir that no longer exists is treated as "not remembered".

## Data flow

### Startup (`src/main.ts`)

1. Load config.
2. Interactive (TUI): call `resolveProjectDir`.
   - Remembered → `setProjectDir(dir)`, status shows `Working in <dir>`.
   - Not remembered → readline prompt `Working folder [<current dir>]:`
     (empty = cwd). Validate/create folder, `setProjectDir`, `saveProjectDir`.
3. Piped mode: no prompt (would hang). Use remembered dir or cwd.
4. `setProjectDir()` runs before TUI/agent start, so all later reads see the
   resolved root.

### Tools (`src/agent/tools.ts`, `src/agent/rag.ts`)

Replace `process.cwd()` with `getProjectRoot()`:

- `validatePath` default root (tools.ts ~16)
- `Glob` `cwd` (tools.ts ~207)
- `Grep` base `.` (tools.ts ~230)
- `Ls` (tools.ts ~268)
- `rag.fetchRelevantFiles` cwd (rag.ts ~11) and `readFileContent` (rag.ts ~16)

`validatePath` still rejects paths resolving outside the root — the guard now
enforces the project boundary.

### Sessions (`src/session/manager.ts` callsites)

Effective session dir becomes `join(projectRoot, '.zor', 'sessions')`.

- Helper `resolveSessionDir(config)` used by `createZorAgent`
  (create.ts ~32) and the resume picker (app.ts ~612).
- If config sets an **absolute** `session.dir`, honor it; otherwise resolve
  under the project root.
- `SessionData.cwd` already tags sessions, so resume stays coherent.

### System prompt (`src/agent/system-prompt.ts`)

Add a `## Working directory` line with the project path so the model writes
correct relative paths.

## Error handling

- Saved project deleted → fall back to prompt (TUI) / cwd (piped); overwrite
  saved entry.
- Project folder unwritable → clear error message, fall back to cwd.
- Folder auto-created via `mkdirSync(..., { recursive: true })` at resolution
  time.
- File collisions: Write already overwrites ( `writeFileSync`). Re-running in
  the same project updates files. Scoping sessions + files to one project
  removes cross-session collision.

## Testing

- Unit: `project.ts` save / load / remember / fallback (temp dirs, mirroring
  `manager.test.ts`).
- Unit: tool resolution with `setProjectRoot(tmp)` — Write / Glob / Read
  resolve inside it (extend `tools.test.ts`).
- Unit: `resolveSessionDir` absolute vs project-relative.
- Update existing tests that hardcode `process.cwd()` as root.

## Out of scope

- A `/project` switching command and startup picker UI (layer on later — the
  resolved root is already persisted, so switching re-runs `resolveProjectDir`).
- Per-session scratch folders.