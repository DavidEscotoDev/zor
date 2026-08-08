import { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';
import { Type } from '@sinclair/typebox';
import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawnSync, spawn } from 'child_process';
import { ToolSearch } from './tools/search';
import { webFetchTool } from './tools/webfetch';
import { taskTool } from './subagent';
import { checkPathAccess, checkHostAccess } from './sandbox';
import { getProjectRoot } from '../project';

function result(text: string, details?: any): AgentToolResult<any> {
  return { content: [{ type: 'text' as const, text }], details: details || {} };
}

function validatePath(filepath: string, projectRoot?: string): string {
  const root = path.resolve(projectRoot || getProjectRoot());
  const resolved = path.resolve(root, filepath);
  const rel = path.relative(root, resolved);
  const inside = rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
  if (!inside) {
    throw new Error(`Path traversal blocked: "${filepath}" resolves outside project root`);
  }
  return resolved;
}

function readFileContent(filepath: string, offset = 0, limit = 2000): string {
  const safePath = validatePath(filepath);
  const content = fs.readFileSync(safePath, 'utf8');
  const lines = content.split('\n');
  const selected = lines.slice(offset, offset + limit);
  return selected.join('\n') + (selected.length < lines.length ? `\n... (${lines.length - offset - selected.length} more lines)` : '');
}

export const coreTools: AgentTool[] = [
  {
    name: 'Bash',
    label: 'bash',
    description: 'Execute shell commands. NEVER use for file creation (>, >>, <<, cat >, echo >, tee). Use Write tool instead.',
    parameters: Type.Object({ command: Type.String({ description: 'Shell command to execute' }) }),
    execute: async (_id, params, _signal, onUpdate) => {
      try {
        const { command } = params as Record<string, any>;
        
        // Guard: block shell redirection for file creation on Windows
        if (process.platform === 'win32') {
          const fileCreationPatterns = [
            />\s*['"]?[\w\\/.-]+['"]?\s*$/,          // echo "..." > file
            />\s*['"]?[\w\\/.-]+['"]?\s*;/,         // echo "..." > file;
            />>\s*['"]?[\w\\/.-]+['"]?\s*$/,        // echo "..." >> file
            /<<\s*['"]?[\w]+['"]?/,                 // cat << 'EOF'
            /cat\s+>\s*[\w\\/.-]+/,                 // cat > file
            /tee\s+[\w\\/.-]+/,                     // tee file
          ];
          if (fileCreationPatterns.some(p => p.test(command))) {
            return result(
              'File creation via shell redirection (>, >>, <<, cat >, tee) fails on Windows. ' +
              'Use Write tool instead. Example: Write({ filepath: "file.html", content: "<html>..." })',
              { isError: true }
            );
          }
        }
        
        // Guard: prevent file creation via shell redirection on Windows
        if (process.platform === 'win32') {
          const fileCreationPatterns = [
            />\s*\S+/,           // command > file
            />>\s*\S+/,          // command >> file
            /<<\s*['"]?\w+['"]?/, // heredoc << 'EOF'
            /\bcat\s+>\s+\S+/,   // cat > file
            /\becho\s+.*>\s+\S+/, // echo ... > file
            /\btee\s+>\s+\S+/,   // tee > file
            /\bcp\s+\S+\s+>\s+\S+/, // cp ... > file
          ];
          if (fileCreationPatterns.some(p => p.test(command))) {
            return result(
              `❌ File creation via shell redirection fails on Windows. Use Write tool instead.\n` +
              `Command blocked: ${command.slice(0, 100)}`,
              { isError: true }
            );
          }
        }
        
        if (onUpdate) {
          return new Promise((resolve) => {
            let stdout = '';
            let stderr = '';
            let proc;
            
            if (process.platform === 'win32') {
              proc = spawn('cmd', ['/d', '/s', '/c', command], { timeout: 60000, cwd: getProjectRoot() });
            } else {
              proc = spawn('sh', ['-c', command], { timeout: 60000, cwd: getProjectRoot() });
            }
            
            proc.stdout.on('data', (data: Buffer) => {
              const chunk = data.toString();
              stdout += chunk;
              onUpdate({ content: [{ type: 'text' as const, text: chunk }], details: {} });
            });
            proc.stderr.on('data', (data: Buffer) => {
              const chunk = data.toString();
              stderr += chunk;
              onUpdate({ content: [{ type: 'text' as const, text: chunk }], details: {} });
            });
            proc.on('close', (code) => {
              const output = stdout + (stderr ? stderr : '');
              resolve(result(output || 'Command completed'));
            });
            proc.on('error', (err) => {
              resolve(result(`Failed to start process: ${err.message}`, { isError: true }));
            });
          });
        }
        // Non-streaming fallback
        let output: string;
        if (process.platform === 'win32') {
          output = execSync(command, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 60000, shell: 'cmd.exe', cwd: getProjectRoot() });
        } else {
          output = execSync(command, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 60000, cwd: getProjectRoot() });
        }
        return result(output || 'Command completed');
      } catch (e: any) {
        return result(e.stdout?.toString() || e.stderr?.toString() || `exit code ${e.status ?? 1}`, { isError: true });
      }
    },
  },
  {
    name: 'Read',
    label: 'read',
    description: 'Read file contents (max 2000 lines). Use offset to read specific sections.',
    parameters: Type.Object({
      filepath: Type.String({ description: 'File path relative to project root' }),
      offset: Type.Optional(Type.Number({ description: 'Starting line (0-indexed)' })),
      limit: Type.Optional(Type.Number({ description: 'Max lines to read' })),
    }),
    execute: async (_id, params) => {
      try {
        const { filepath, offset, limit } = params as Record<string, any>;
        const access = checkPathAccess(filepath);
        if (!access.allowed) return result(`Error: ${access.reason}`, { isError: true });
        const content = readFileContent(filepath, offset || 0, limit || 2000);
        return result(content);
      } catch (e: any) {
        return result(`Error: ${e.message}`, { isError: true });
      }
    },
  },
  {
    name: 'Write',
    label: 'write',
    description: 'Create or overwrite a file. Creates parent directories if needed.',
    parameters: Type.Object({
      filepath: Type.String({ description: 'File path' }),
      content: Type.String({ description: 'File content' }),
    }),
    execute: async (_id, params) => {
      try {
        const { filepath, content: fileContent } = params as Record<string, any>;
        const access = checkPathAccess(filepath);
        if (!access.allowed) return result(`Error: ${access.reason}`, { isError: true });
        const safePath = validatePath(filepath);
        fs.mkdirSync(path.dirname(safePath), { recursive: true });
        fs.writeFileSync(safePath, fileContent, 'utf8');
        return result(`Written ${safePath} (${fileContent.length} bytes)`);
      } catch (e: any) {
        return result(`Error: ${e.message}`, { isError: true });
      }
    },
  },
  {
    name: 'Edit',
    label: 'edit',
    description: 'Edit a file by finding and replacing exact text.',
    parameters: Type.Object({
      filepath: Type.String({ description: 'File path' }),
      oldString: Type.String({ description: 'Text to find (exact match)' }),
      newString: Type.String({ description: 'Replacement text' }),
    }),
    execute: async (_id, params) => {
      try {
        const { filepath, oldString, newString } = params as Record<string, any>;
        const access = checkPathAccess(filepath);
        if (!access.allowed) return result(`Error: ${access.reason}`, { isError: true });
        const safePath = validatePath(filepath);
        const content = fs.readFileSync(safePath, 'utf8');
        if (!content.includes(oldString)) {
          return result(`Error: String not found in ${filepath}`, { isError: true });
        }
        const newContent = content.replace(oldString, newString);
        fs.writeFileSync(safePath, newContent, 'utf8');
        return result(`Edited ${filepath}`);
      } catch (e: any) {
        return result(`Error: ${e.message}`, { isError: true });
      }
    },
  },
  {
    name: 'Glob',
    label: 'glob',
    description: 'Find files by glob pattern (e.g., **/*.ts, src/**).',
    parameters: Type.Object({
      pattern: Type.String({ description: 'Glob pattern' }),
    }),
    execute: async (_id, params) => {
      try {
        const { pattern } = params as Record<string, any>;
        const access = checkPathAccess(pattern);
        if (!access.allowed) return result(`Error: ${access.reason}`, { isError: true });
        const { globSync } = await import('glob');
        const files = globSync(pattern, { nodir: true, cwd: getProjectRoot(), absolute: false }).slice(0, 200);
        return result(files.length > 0 ? files.join('\n') : 'No files found');
      } catch (e: any) {
        return result(`Glob error: ${e.message}`, { isError: true });
      }
    },
  },
  {
    name: 'Grep',
    label: 'grep',
    description: 'Search file contents with regular expression.',
    parameters: Type.Object({
      pattern: Type.String({ description: 'Regex pattern' }),
      include: Type.Optional(Type.String({ description: 'File glob filter (e.g., *.ts)' })),
    }),
    execute: async (_id, params) => {
      try {
        const { pattern, include } = params as Record<string, any>;
        const access = checkPathAccess(include || '.');
        if (!access.allowed) return result(`Error: ${access.reason}`, { isError: true });
        const args = ['--line-number', '--with-filename', pattern];
        if (include) args.push('--include', include);
        const proc = spawnSync('rg', [...args, '.'], { encoding: 'utf8', maxBuffer: 1024 * 1024, cwd: getProjectRoot() });
        if (proc.error) {
          if (process.platform === 'win32') {
            try {
              const psArgs = ['-Command', `Select-String -Path * -Pattern '${pattern.replace(/'/g, "''")}' -Recurse | Select-Object -First 100 | ForEach-Object { $_.Filename + ':' + $_.LineNumber + ':' + $_.Line }`];
              if (include) {
                const ext = include.replace('*.', '');
                psArgs[1] = `Select-String -Path *.${ext} -Pattern '${pattern.replace(/'/g, "''")}' -Recurse | Select-Object -First 100 | ForEach-Object { $_.Filename + ':' + $_.LineNumber + ':' + $_.Line }`;
              }
              const psProc = spawnSync('powershell', psArgs, { encoding: 'utf8', maxBuffer: 1024 * 1024, cwd: getProjectRoot() });
              if (psProc.error) {
                return result('Grep requires ripgrep installed: https://github.com/BurntSushi/ripgrep');
              }
              const lines = (psProc.stdout || '').trim().split('\n').slice(0, 100);
              return result(lines.length > 0 ? lines.join('\n') : 'No matches');
            } catch { /* ponytail: PowerShell Select-String fallback, non-critical */ }
          }
          return result('Grep requires ripgrep installed: https://github.com/BurntSushi/ripgrep');
        }
        const lines = (proc.stdout || '').trim().split('\n').slice(0, 100);
        return result(lines.length > 0 ? lines.join('\n') : 'No matches');
      } catch {
        return result('Grep requires ripgrep installed: https://github.com/BurntSushi/ripgrep');
      }
    },
  },
  {
    name: 'Ls',
    label: 'ls',
    description: 'List directory contents.',
    parameters: Type.Object({
      filepath: Type.String({ description: 'Directory path', default: '.' }),
    }),
    execute: async (_id, params) => {
      try {
        const { filepath } = params as Record<string, any>;
        const access = checkPathAccess(filepath);
        if (!access.allowed) return result(`Error: ${access.reason}`, { isError: true });
        const safePath = validatePath(filepath);
        const entries = fs.readdirSync(safePath, { withFileTypes: true });
        const lines = entries.map((e: fs.Dirent) => {
          const suffix = e.isDirectory() ? '/' : '';
          let size = '';
          if (e.isFile()) {
            try { size = ` (${fs.statSync(path.join(safePath, e.name)).size}b)`; } catch { /* ponytail: file size is cosmetic */ }
          }
          return `${e.name}${suffix}${size}`;
        });
        return result(lines.join('\n'));
      } catch (e: any) {
        return result(`Error: ${e.message}`, { isError: true });
      }
    },
  },
];

const gitTools: AgentTool[] = [
  {
    name: 'GitStatus',
    label: 'git-status',
    description: 'Show current git branch and changed files.',
    parameters: Type.Object({}),
    execute: async () => {
      try {
        const r = spawnSync('git', ['status', '--porcelain', '--branch'], { encoding: 'utf8', timeout: 5000 });
        if (r.error) throw r.error;
        return result(r.stdout || '(clean working tree)');
      } catch (e: any) {
        return result(`Not a git repository or git not available: ${e.message}`, { isError: true });
      }
    },
  },
  {
    name: 'GitDiff',
    label: 'git-diff',
    description: 'Show unstaged or staged diffs.',
    parameters: Type.Object({
      staged: Type.Optional(Type.Boolean({ description: 'Show staged diffs instead of unstaged' })),
      file: Type.Optional(Type.String({ description: 'Limit diff to specific file' })),
    }),
    execute: async (_id, params) => {
      try {
        const { staged, file } = params as Record<string, any>;
        const args = ['diff'];
        if (staged) args.push('--staged');
        if (file) args.push('--', file);
        // ponytail: spawnSync with array args, no shell injection
        const r = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, timeout: 10000 });
        if (r.error) throw r.error;
        return result(r.stdout || '(no changes)');
      } catch (e: any) {
        return result(e.stdout?.toString() || e.message, { isError: true });
      }
    },
  },
  {
    name: 'GitLog',
    label: 'git-log',
    description: 'Show recent git commit history.',
    parameters: Type.Object({
      count: Type.Optional(Type.Number({ description: 'Number of commits to show', default: 10 })),
    }),
    execute: async (_id, params) => {
      try {
        const n = (params as Record<string, any>).count || 10;
        const r = spawnSync('git', ['log', '--oneline', '-n', String(n)], { encoding: 'utf8', timeout: 5000 });
        if (r.error) throw r.error;
        return result(r.stdout || '(no commits)');
      } catch (e: any) {
        return result(`Not a git repository or git not available: ${e.message}`, { isError: true });
      }
    },
  },
  {
    name: 'GitAdd',
    label: 'git-add',
    description: 'Stage files for commit.',
    parameters: Type.Object({
      files: Type.String({ description: 'File paths to stage (space-separated, use "." for all)' }),
    }),
    execute: async (_id, params) => {
      try {
        const { files } = params as Record<string, any>;
        // ponytail: spawnSync array args prevent shell injection vs execSync(string)
        const fileList = files.split(' ').filter((f: string) => f.length > 0);
        const r = spawnSync('git', ['add', ...fileList], { encoding: 'utf8', timeout: 5000 });
        if (r.error) throw r.error;
        return result(r.stdout || `Staged: ${files}`);
      } catch (e: any) {
        return result(e.stderr?.toString() || `Failed to stage: ${e.message}`, { isError: true });
      }
    },
  },
  {
    name: 'GitCommit',
    label: 'git-commit',
    description: 'Create a git commit with the given message.',
    parameters: Type.Object({
      message: Type.String({ description: 'Commit message' }),
    }),
    execute: async (_id, params) => {
      try {
        const { message } = params as Record<string, any>;
        // ponytail: spawnSync with array args, no shell escaping needed
        const r = spawnSync('git', ['commit', '-m', message], { encoding: 'utf8', timeout: 10000 });
        if (r.error) throw r.error;
        return result(r.stdout || 'Commit created');
      } catch (e: any) {
        return result(e.stdout?.toString() || e.stderr?.toString() || `Failed to commit: ${e.message}`, { isError: true });
      }
    },
  },
];

export function getReadOnlyTools(): AgentTool[] {
  return coreTools.filter(t => ['Read', 'Glob', 'Grep', 'Ls'].includes(t.name));
}

export function buildToolSet(config: any, mcpClient: any): AgentTool[] {
  const mcpTools = mcpClient.getTools();
  return [...coreTools, ...gitTools, ToolSearch(mcpClient), taskTool, ...mcpTools, webFetchTool];
}