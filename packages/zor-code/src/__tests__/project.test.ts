import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const fsStore = vi.hoisted(() => new Map<string, string>());

vi.mock('os', () => ({ homedir: () => '/home/testuser' }));

vi.mock('fs', () => ({
  __store: fsStore,
  existsSync: (p: string) => fsStore.has(p),
  mkdirSync: (p: string) => { fsStore.set(p, ''); },
  readFileSync: (p: string) => fsStore.get(p) ?? '',
  writeFileSync: (p: string, data: string) => { fsStore.set(p, data); },
}));

import { getProjectRoot, setProjectRoot, loadProjectDir, saveProjectDir, resolveProjectDir, resolveSessionDir } from '../project';

describe('project', () => {
  const realCwd = process.cwd();

  beforeEach(() => {
    fsStore.clear();
  });

  afterEach(() => {
    setProjectRoot('');
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
    it('returns null when no saved project file exists', () => {
      expect(loadProjectDir()).toBeNull();
    });

    it('round-trips a saved directory', () => {
      fs.mkdirSync('/tmp/proj-a');
      saveProjectDir('/tmp/proj-a');
      expect(loadProjectDir()).toBe('/tmp/proj-a');
    });

    it('returns null when saved dir no longer exists', () => {
      saveProjectDir('/gone');
      expect(loadProjectDir()).toBeNull();
    });
  });

  describe('resolveProjectDir', () => {
    it('returns remembered dir with first=false when present', async () => {
      fs.mkdirSync('/tmp/remembered');
      saveProjectDir('/tmp/remembered');
      const prompt = vi.fn();
      const r = await resolveProjectDir({ prompt });
      expect(r.dir).toBe('/tmp/remembered');
      expect(r.first).toBe(false);
      expect(prompt).not.toHaveBeenCalled();
    });

    it('prompts when nothing remembered, saves the choice', async () => {
      const prompt = vi.fn(async (d: string) => '/tmp/picked' || d);
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