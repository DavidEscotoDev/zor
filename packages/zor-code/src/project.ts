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
  } catch { /* caller handles unwritable */ }
  saveProjectDir(dir);
  return { dir, first: true };
}

export function resolveSessionDir(configDir?: string): string {
  if (configDir && isAbsolute(configDir)) return configDir;
  return join(getProjectRoot(), configDir || join('.zor', 'sessions'));
}