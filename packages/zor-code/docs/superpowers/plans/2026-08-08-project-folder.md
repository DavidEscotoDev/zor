# Project-Folder Working Root Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `zor-code` a single remembered project folder that becomes the working root for all file tools and the home for sessions.

**Architecture:** A new module `src/project.ts` owns project-root state (module-level, like `src/agent/sandbox.ts`) and persists the chosen folder to `~/.zor/last-project.json` (pattern mirrors `src/llm/session-state.ts`). `main.ts` resolves the folder at startup (prompt only when nothing remembered). All file tools and the session store read `getProjectRoot()` instead of `process.cwd()`.

**Tech Stack:** TypeScript, bun, vitest. No new dependencies.

## Global Constraints

- Persisted file: `~/.zor/last-project.json` with shape `{ dir: string, updatedAt: string }`.
- Prompt only when no valid remembered folder exists (valid = path exists on disk).
- Piped mode must never prompt (it would hang).
- `validatePath` traversal guard stays — its root becomes the project root.
- If `config.session.dir` is absolute, honor it; otherwise resolve under the project root as `join(getProjectRoot(), config.session.dir)`.
- Write/Edit keep their silent-overwrite behavior (`writeFileSync`).
- Do not add a `/project` command, a startup picker UI, or per-session scratch folders (out of scope).

---

## File Structure

- Create: `src/project.ts` — project-root state + persistence.
- Create: `src/__tests__/project.test.ts` — tests for project.ts.
- Modify: `src/main.ts` — resolve project root at startup (interactive + piped).
- Modify: `src/agent/tools.ts` — tools resolve against `getProjectRoot()`.
- Modify: `src/agent/rag.ts` — RAG paths resolve against `getProjectRoot()`.
- Modify: `src/agent/create.ts` — session manager uses `resolveSessionDir`.
- Modify: `src/tui/app.ts` — resume picker uses `resolveSessionDir`.
- Modify: `src/agent/system-prompt.ts` — announce working directory.
- Modify: `src/__tests__/tools.test.ts`, `src/__tests__/rag.test.ts`, `src/__tests__/system-prompt.test.ts` — extend for project root.

---

### Task 1: `src/project.ts` module

**Files:**
- Create: `packages/zor-code/src/project.ts`
- Test: `packages/zor-code/src/__tests__/project.test.ts`

**Interfaces:**
- Consumes: nothing (stdlib only).
- Produces:
  - `getProjectRoot(): string` — returns the current root, defaulting to `process.cwd()`.
  - `setProjectRoot(dir: string): void`
  - `loadProjectDir(): string | null` — remembered path if it still exists, else null.
  - `saveProjectDir(dir: string): void`
  - `resolveProjectDir(opts?: { prompt?: (defaultDir: string) => Promise<string> }): Promise<{ dir: string; first: boolean }>`
  - `resolveSessionDir(configDir?: string): string`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/project.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('fs', () => {
  const store = new Map<string, string>();
  return {
    existsSync: (p: string) => store.has(p),
    mkdirSync: (p: string) => { store.set(p, ''); },
    readFileSync: (p: string) => store.get(p) ?? '',
    writeFileSync: (p: string, data: string) => { store.set(p, data); },
  };
});

import { getProjectRoot, setProjectRoot, loadProjectDir, saveProjectDir, resolveProjectDir, resolveSessionDir } from '../project';

const FAKE_HOME = '/home/testuser';

describe('project', () => {
  const realCwd = process.cwd();

  beforeEach(() => {
    vi.resetModules();
    // force CONFIG_DIR to a stable fake path by mocking `os.homedir`
  });

  afterEach(() => {
    setProjectRoot(''); // reset
    process.chdir(realCwd);
  });

  describe('get/setProjectRoot', () => {
    it('defaults to process.cwd()', () => {
      expect(getProjectRoot()).toBe(process.cwd());
    });

    it('returns the value set by setProjectRoot', () => {
      setProjectRoot('/project/calc');
      expect(getProjectRoot()).toBe('/project/calc');
    });
  });

  describe('load/saveProjectDir', () => {
    // NOTE: run under a temp dir; these use real fs via the mock store
    it('returns null when no saved project file exists', () => {
      expect(loadProjectDir()).toBeNull();
    });

    it('round-trips a saved directory', () => {
      // seed the store directly with a config file
      saveProjectDir('/tmp/proj-a');
      expect(loadProjectDir()).toBe('/tmp/proj-a');
    });

    it('returns null when saved dir no longer exists', () => {
      saveProjectDir('/gone');
      // remove the dir from the store (simulates deletion)
      expect(loadProjectDir()).toBeNull();
    });
  });

  describe('resolveProjectDir', () => {
    it('returns remembered dir with first=false when present', async () => {
      saveProjectDir('/tmp/remembered');
      const prompt = vi.fn();
      const r = await resolveProjectDir({ prompt });
      expect(r.dir).toBe('/tmp/remembered');
      expect(r.first).toBe(false);
      expect(prompt).not.toHaveBeenCalled();
    });

    it('prompts when nothing remembered, saves the choice', async () => {
      const prompt = vi.fn(async () => '/tmp/picked');
      const r = await resolveProjectDir({ prompt });
      expect(r.first).toBe(true);
      expect(r.dir).toBe('/tmp/picked');
      expect(loadProjectDir()).toBe('/tmp/picked');
    });

    it('falls back to cwd without prompting when no prompt fn', async () => {
      const r = await resolveProjectDir();
      expect(r.dir).toBe(process.cwd());
      expect(r.first).toBe(false);
    });
  });

  describe('resolveSessionDir', () => {
    it('resolves a relative dir under the project root', () => {
      setProjectRoot('/project/calc');
      expect(resolveSessionDir('.zor/sessions')).toBe(path.join('/project/calc', '.zor/sessions'));
    });

    it('honors an absolute dir unchanged', () => {
      setProjectRoot('/project/calc');
      expect(resolveSessionDir('/abs/sessions')).toBe('/abs/sessions');
    });

    it('defaults to .zor/sessions under the project root', () => {
      setProjectRoot('/project/calc');
      expect(resolveSessionDir()).toBe(path.join('/project/calc', '.zor', 'sessions'));
    });
  });
});
// helper to reset module state (full re-import)
function setProjectRootProject(dir: string) {
  setProjectRoot(dir);
}
```

> Note: the test above intentionally resets by clearing the module state via `setProjectRoot('')` restoring cwd between cases. If the `vi.mock('fs')` store interferes with `os.homedir`/`path.join`, use the real temp-dir style from `manager.test.ts` (create `/tmp/zor-project-test-*` with `beforeEach`) instead of the in-memory store. The test that "saved dir no longer exists" should seed the store with a JSON file whose `dir` points at a path NOT in the store.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run src/__tests__/project.test.ts`
Expected: FAIL — `Cannot find module '../project'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/project.ts
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, isAbsolute } from 'path';

const CONFIG_DIR = join(homedir(), '.zor');
const LAST_PROJECT_FILE = join(CONFIG_DIR, 'last-project.json');

let projectRoot: string | null = null;

export function getProjectRoot(): string {
  return projectRoot || process.cwd();
}

export function setProjectRoot(dir: string): void {
  projectRoot = dir;
}

export function loadProjectDir(): string | null {
  try {
    if (!existsSync(LAST_PROJECT_FILE)) return null;
    const data = JSON.parse(readFileSync(LAST_PROJECT_FILE, 'utf8'));
    if (typeof data.dir !== 'string') return null;
    if (!existsSync(data.dir)) return null;
    return data.dir;
  } catch {
    return null;
  }
}

export function saveProjectDir(dir: string): void {
  try {
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(LAST_PROJECT_FILE, JSON.stringify({ dir, updatedAt: new Date().toISOString() }, null, 2));
  } catch { /* best-effort persistence */ }
}

export async function resolveProjectDir(opts: { prompt?: (defaultDir: string) => Promise<string> } = {}): Promise<{ dir: string; first: boolean }> {
  const remembered = loadProjectDir();
  if (remembered) return { dir: remembered, first: false };

  const fallback = process.cwd();
  if (!opts.prompt) return { dir: fallback, first: false };

  const dir = ((await opts.prompt(fallback)).trim() || fallback);
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  } catch { /* report via error handling at caller */ }
  saveProjectDir(dir);
  return { dir, first: true };
}

export function resolveSessionDir(configDir?: string): string {
  if (configDir && isAbsolute(configDir)) return configDir;
  return join(getProjectRoot(), configDir || join('.zor', 'sessions'));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run src/__tests__/project.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/project.ts src/__tests__/project.test.ts
git commit -m "feat(project): add project root state and persistence"
```

---

### Task 2: Resolve project root at startup (`src/main.ts`)

**Files:**
- Modify: `packages/zor-code/src/main.ts`

**Interfaces:**
- Consumes: `resolveProjectDir(opts)`, `setProjectRoot(dir)`, `getProjectRoot()` from Task 1.
- Produces: none new — the module global is set before the agent/TUI starts.

- [ ] **Step 1: Add imports and the interactive prompt helper**

At top of `main.ts` (after existing imports):

```ts
import { createInterface } from 'readline';
import { existsSync, mkdirSync } from 'fs';
import { getProjectRoot, setProjectRoot, resolveProjectDir } from './project';

function promptProjectDir(defaultDir: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`Working folder [${defaultDir}]: `, (ans) => {
      rl.close();
      resolve(ans.trim() || defaultDir);
    });
  });
}
```

- [ ] **Step 2: Resolve in interactive mode**

In `bootstrapInteractive()`, after `const config = loadConfig();` and before `// Model resolution`, insert:

```ts
const { dir: projectDir } = await resolveProjectDir({ prompt: promptProjectDir });
setProjectRoot(projectDir);
```

`bootstrapInteractive` is already async — make sure it is `async` and await the project resolution before building the TUI.

- [ ] **Step 3: Resolve in piped mode**

Inside the `IS_PIPED` block, right after `const config = loadConfig();`, insert:

```ts
const { dir: projectDir } = await resolveProjectDir(); // no prompt in piped mode
setProjectRoot(projectDir);
```

- [ ] **Step 4: Verify**

Run: `bun x tsc --noEmit`. Expected: no type errors.

- [ ] **Step 5: Manual smoke test**

Run `echo "tell me your working directory" | bun src/main.ts`.
Expected: prints something containing the resolved directory, no hang, no prompt.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts
git commit -m "feat: resolve and set project root at startup"
```

---

### Task 3: File tools resolve against project root

**Files:**
- Modify: `packages/zor-code/src/agent/tools.ts`
- Modify: `packages/zor-code/src/agent/rag.ts`
- Test: `packages/zor-code/src/__tests__/tools.test.ts`
- Test: `packages/zor-code/src/__tests__/rag.test.ts`

**Interfaces:**
- Consumes: `getProjectRoot()` from Task 1.
- Produces: unchanged tool signatures.

- [ ] **Step 1: Write the failing tests**

Add to `src/__tests__/tools.test.ts`:

```ts
import { setProjectRoot } from '../project';

describe('tools resolve against project root', () => {
  const realCwd = process.cwd();
  const realFs = require('fs');

  beforeEach(() => {
    vi.clearAllMocks();
    setProjectRoot('/project-root');
  });

  afterEach(() => {
    setProjectRoot(realCwd);
  });

  it('Write resolves the path under the project root', async () => {
    const tools = buildToolSet({}, mockMcpClient);
    const write = tools.find(t => t.name === 'Write')!;
    await write.execute('test-id', { filepath: 'new-dir/file.txt', content: 'hello' });
    const writtenPath = (realFs.writeFileSync as any).mock.calls[0][0];
    expect(String(writtenPath)).toContain('/project-root');
  });

  it('Read blocks traversal outside the project root', async () => {
    const tools = buildToolSet({}, mockMcpClient);
    const read = tools.find(t => t.name === 'Read')!;
    const result = await read.execute('id', { filepath: '../pwned/secret.txt' });
    expect(result.content[0].text).toMatch(/Error|traversal/i);
  });
});
```

And in `src/__tests__/rag.test.ts`, add a test asserting the glob cwd uses the project root. To keep `rag.test.ts` simple, add a `vi.mock('../project', ...)` at the top:

```ts
vi.mock('../project', () => ({ getProjectRoot: () => '/proj/x' }));

it('uses the project root as glob cwd', async () => {
  const { fetchRelevantFiles } = await import('../agent/rag');
  const config = { model: 'x/y' } as any;
  await fetchRelevantFiles('auth login', config);
  const globMock = (await import('glob')).globSync as any;
  expect(globMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ cwd: '/proj/x' }));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun x vitest run src/__tests__/tools.test.ts src/__tests__/rag.test.ts`
Expected: FAIL — assertions about the project root not satisfied (current impl uses cwd).

- [ ] **Step 3: Implement in `tools.ts`**

Add near the top of `tools.ts`:

```ts
import { getProjectRoot } from '../project';
```

Change `validatePath`:

```ts
function validatePath(filepath: string, projectRoot?: string): string {
  const root = projectRoot || getProjectRoot();
  const resolved = path.resolve(root, filepath);
  if (!resolved.startsWith(path.resolve(root))) {
    throw new Error(`Path traversal blocked: "${filepath}" resolves outside project root`);
  }
  return resolved;
}
```

Change the `Glob` tool execute — `cwd: process.cwd()` → `cwd: getProjectRoot()`.
Change the `Grep` tool — the `spawnSync('rg', [...args, '.'], { ... })` call add `cwd: getProjectRoot()` to its options; and the PowerShell fallback `Select-String -Path *` is relative — leave as-is (it inherits cwd of the proc; acceptable). For consistency set `cwd: getProjectRoot()` on the `spawnSync` calls for `rg`.

- [ ] **Step 4: Implement in rag.ts**

```ts
// top of file: import { getProjectRoot } from '../project';
const files = patterns.flatMap(p => globSync(p, { cwd: getProjectRoot(), nodir: true }));
```
and
```ts
const safePath = resolve(getProjectRoot(), filepath);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun x vitest run src/__tests__/tools.test.ts src/__tests__/rag.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/agent/tools.ts src/agent/rag.ts src/__tests__/tools.test.ts src/__tests__/rag.test.ts
git commit -m "feat: resolve file tools against project root"
```

---

### Task 4: Sessions live inside the project

**Files:**
- Modify: `packages/zor-code/src/agent/create.ts`
- Modify: `packages/zor-code/src/tui/app.ts`
- Modify: `packages/zor-code/src/rpc.ts`
- Modify: `packages/zor-code/src/main.ts` (the resume `SessionManager` already uses `config.session.dir`)
- Test: `packages/zor-code/src/__tests__/project.test.ts` (add `resolveSessionDir` usage assertion)

**Interfaces:**
- Consumes: `resolveSessionDir(configDir)` + `setProjectRoot(dir)` from Task 1.
- Produces: session files at `<project>/.zor/sessions`.

- [ ] **Step 1: Add a test for resolveSessionDir in createZorAgent**

Add to `src/__tests__/project.test.ts`:

```ts
it('resolveSessionDir resolves relative dir under project root', () => {
  setProjectRoot('/proj/apps/calc');
  expect(resolveSessionDir('.zor/sessions')).toBe('/proj/apps/calc/.zor/sessions');
});
```
Already green from Task 1 — this pins the contract before wiring it into consumers.

- [ ] **Step 2: Update createZorAgent**

In `src/agent/create.ts`, replace:

```ts
const sessionManager = new SessionManager(config.session.dir);
```

with:

```ts
import { resolveSessionDir } from '../project';
...
const sessionManager = new SessionManager(resolveSessionDir(config.session.dir));
```

- [ ] **Step 3: Update the TUI resume picker**

In `src/tui/app.ts`, `handleSlash` case `'resume'`, replace:

```ts
const sm = new SessionManager(this.config.session.dir);
```
with:

```ts
const sm = new SessionManager(resolveSessionDir(this.config.session.dir));
```
and add the import `import { resolveSessionDir } from '../project';`.

- [ ] **Step 4: Update rpc.ts**

In `src/rpc.ts`, `initializeAgent`, replace:

```ts
const mgr = new SessionManager(config.session.dir);
```
with:

```ts
const mgr = new SessionManager(resolveSessionDir(config.session.dir));
```
and add the import `import { resolveSessionDir } from './project';`.

- [ ] **Step 5: Verify**

Run: `bun run typecheck` and `bun run test`.
Expected: PASS. Sessions still resolve relative to cwd when no project root is set (default preserved).

- [ ] **Step 6: Commit**

```bash
git add src/agent/create.ts src/tui/app.ts src/rpc.ts src/__tests__/project.test.ts
git commit -m "feat: store sessions under the project root"
```

---

### Task 5: Announce the working directory to the model

**Files:**
- Modify: `packages/zor-code/src/agent/system-prompt.ts`
- Test: `packages/zor-code/src/__tests__/system-prompt.test.ts`

**Interfaces:**
- Consumes: `getProjectRoot()`.
- Produces: system prompt mentions working directory.

- [ ] **Step 1: Write failing test**

Add to `src/__tests__/system-prompt.test.ts`:

```ts
import { setProjectRoot } from '../project';

it('includes the working directory', () => {
  setProjectRoot('/x/proj/calc');
  const result = assembleSystemPrompt({});
  expect(result).toContain('/x/proj/calc');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun x vitest run src/__tests__/system-prompt.test.ts`
Expected: FAIL — prompt does not mention the project path.

- [ ] **Step 3: Implement**

In `src/agent/system-prompt.ts` add:

```ts
import { getProjectRoot } from '../project';

export function assembleSystemPrompt(_config: any): string {
  const rules = loadProjectRules();
  const projectLine = `\n## Working directory\n${getProjectRoot()} (relative paths resolve here)`;
  return `You are Zor Code...${rules}${projectLine}`;
}
```
(Concretely: append the working-directory block just before the `${rules}` interpolation in the existing template.)

- [ ] **Step 4: Run to verify it passes**

Run: `bun x vitest run src/__tests__/system-prompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/agent/system-prompt.ts src/__tests__/system-prompt.test.ts
git commit -m "feat: advertise project root in system prompt"
```

---

### Task 6: Full regression pass + docs

**Files:**
- Any remaining tests touched above.

**Interfaces:**
- Consumes: all prior tasks.

- [ ] **Step 1: Run the full suite**

Run: `bun run check` (typecheck + tests).
Expected: 159+ passing tests, 0 type errors.

- [ ] **Step 2: Update any test that hardcoded cwd as root**

Search `src/__tests__` for `process.cwd()` references; update that resolve against the project root (usually by seeding `setProjectRoot` in a `beforeEach`, or keeping cwd as the default — the default `getProjectRoot() === process.cwd()` preserves old behavior when no project root is set, so most tests pass untouched).

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "test: full regression for project-root working directory"
```

---

## Self-Review

- Spec coverage: folder state (T1), startup resolution (T2), tool root (T3), sessions in project (T4), system prompt (T5), regression (T6), error handling (create-on-resolve in T1, fallback in T2). All spec sections covered.
- No placeholders; every step contains real code.
- Type consistency: `getProjectRoot()`, `setProjectRoot(dir)`, `resolveProjectDir(opts)`, `resolveSessionDir(configDir?)` are defined once in T1 and referenced identically in T2-T5.