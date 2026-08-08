import { describe, it, expect, vi } from 'vitest';
import { fetchRelevantFiles, readFileContent } from '../agent/rag';

vi.mock('../project', () => ({ getProjectRoot: () => '/proj/x' }));

vi.mock('glob', () => ({
  globSync: vi.fn((pattern) => {
    if (pattern.includes('auth')) return ['src/auth.ts', 'src/auth.test.ts'];
    if (pattern.includes('user')) return ['src/user.ts'];
    if (pattern.includes('login')) return ['src/auth/login.ts'];
    return [];
  })
}));

vi.mock('fs', () => ({
  readFileSync: vi.fn((path: string) => {
    if (path.includes('auth.ts')) return 'export function login() {}\nexport function logout() {}\n';
    return 'line1\nline2\nline3\nline4\nline5\n';
  })
}));

vi.mock('path', () => ({
  resolve: vi.fn((base: string, path: string) => `${base}/${path}`)
}));

describe('fetchRelevantFiles', () => {
  it('extracts keywords and finds matching files', async () => {
    const config = { model: 'opencode/claude-sonnet-4' } as any;
    const files = await fetchRelevantFiles('implement auth login', config);
    expect(files).toContain('src/auth.ts');
    expect(files).toContain('src/auth.test.ts');
  });

  it('deduplicates and limits results', async () => {
    const config = { model: 'opencode/claude-sonnet-4' } as any;
    const files = await fetchRelevantFiles('auth auth authentication login', config);
    expect(files.length).toBeLessThanOrEqual(15);
    expect(new Set(files).size).toBe(files.length);
  });

  it('returns empty array for no matches', async () => {
    const config = { model: 'opencode/claude-sonnet-4' } as any;
    const files = await fetchRelevantFiles('xyzxyzxyz', config);
    expect(files).toEqual([]);
  });

  it('uses the project root as glob cwd', async () => {
    const { globSync } = await import('glob');
    const config = { model: 'opencode/claude-sonnet-4' } as any;
    await fetchRelevantFiles('auth login', config);
    expect(globSync).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ cwd: '/proj/x' }));
  });
});

describe('readFileContent', () => {
  it('reads file content with offset and limit', async () => {
    const content = await readFileContent('src/auth.ts', 0, 2);
    expect(content).toContain('export function login() {}');
    expect(content).toContain('export function logout() {}');
  });

  it('shows truncation indicator when file is longer', async () => {
    const content = await readFileContent('src/other.ts', 0, 2);
    expect(content).toContain('more lines');
  });
});