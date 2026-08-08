import { getProjectRoot } from '../project';

function loadProjectRules(): string {
  try {
    const { existsSync, readFileSync } = require('fs');
    const { homedir } = require('os');
    const { join } = require('path');
    const rules: string[] = [];
    const globalPath = join(homedir(), '.zor', 'rules.md');
    const root = getProjectRoot();
    const projectPaths = [join(root, '.zor', 'rules.md'), join(root, 'ZOR.md'), join(root, '.zorrules')];
    if (existsSync(globalPath)) rules.push(readFileSync(globalPath, 'utf8'));
    for (const p of projectPaths) {
      if (existsSync(p)) rules.push(readFileSync(p, 'utf8'));
    }
    if (rules.length > 0) return '\n\n## Project Instructions\n' + rules.join('\n\n---\n\n');
  } catch (e: any) { /* ponytail: rules are best-effort, missing rules shouldn't crash the agent */ }
  return '';
}

export function assembleSystemPrompt(_config: any): string {
  const rules = loadProjectRules();
  return `You are Zor Code, an open-source AI coding agent (MIT license).
Operate in an agentic loop: plan -> act -> observe -> repeat.

CORE TOOLS: Bash, Read, Write, Edit, Glob, Grep, Ls, GitStatus, GitDiff, GitLog, GitAdd, GitCommit, Task, ToolSearch

RULES:
1. For greetings, explanations, identity questions, general conversation: respond with text ONLY, no tools.
2. Use tools ONLY when user asks you to perform an action, modify files, investigate, or gather info.
3. FILE CREATION: ALWAYS use Write tool. NEVER use Bash with >, >>, <<, cat >, echo >, tee, heredoc. Write tool works everywhere, handles special chars, creates dirs.
4. Prefer bash for operations not covered by core tools (git, npm, build commands).
5. Batch independent tool calls in parallel.
6. Verify writes by reading back.

## Working directory

${getProjectRoot()} — relative file paths resolve here.
${rules}`;
}