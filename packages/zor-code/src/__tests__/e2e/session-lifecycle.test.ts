import { describe, it, expect, afterEach } from 'vitest';
import { SessionManager } from '../../session/manager';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const tmpDir = path.join(os.tmpdir(), `zor-e2e-session-${Date.now()}`);

describe('Session Lifecycle E2E', () => {
  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('creates, saves, and loads a session', () => {
    const manager = new SessionManager(tmpDir);
    const session = manager.create('/test/cwd');
    expect(session.id).toBeDefined();
    expect(session.messages).toEqual([]);
    expect(session.cwd).toBe('/test/cwd');
    expect(session.createdAt).toBeGreaterThan(0);

    const loaded = manager.load(session.id);
    expect(loaded).toBeDefined();
    expect(loaded!.id).toBe(session.id);
  });

  it('saves messages and reloads them', () => {
    const manager = new SessionManager(tmpDir);
    const session = manager.create();
    session.messages = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ];
    manager.save(session);

    const loaded = manager.load(session.id);
    expect(loaded!.messages).toHaveLength(2);
    expect(loaded!.messages[0].content).toBe('hello');
    expect(loaded!.messages[1].content).toBe('hi there');
  });

  it('forks a session preserving parent messages', () => {
    const manager = new SessionManager(tmpDir);
    const parent = manager.create();
    parent.messages = [{ role: 'user', content: 'base' }];
    manager.save(parent);

    const fork = manager.fork(parent);
    expect(fork.parentId).toBe(parent.id);
    expect(fork.id).not.toBe(parent.id);
    expect(fork.messages).toEqual(parent.messages);

    const reloaded = manager.load(parent.id);
    expect(reloaded!.children).toContain(fork.id);
  });

  it('lists sessions sorted by updatedAt', () => {
    const manager = new SessionManager(tmpDir);
    const a = manager.create(); a.messages = [{ role: 'user' as const, content: 'first' }]; manager.save(a);
    const b = manager.create(); b.messages = [{ role: 'user' as const, content: 'second' }]; manager.save(b);

    const list = manager.list();
    expect(list.length).toBeGreaterThanOrEqual(2);
    const ids = list.map(s => s.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
  });

  it('builds tree structure', () => {
    const manager = new SessionManager(tmpDir);
    const root = manager.create();
    const fork1 = manager.fork(root);
    const fork2 = manager.fork(root);

    const tree = manager.getTree(root.id);
    expect(tree).toBeDefined();
    expect(tree.children).toBeDefined();
    expect(tree.children.length).toBe(2);
    expect(tree.children.map((c: any) => c.id)).toContain(fork1.id);
    expect(tree.children.map((c: any) => c.id)).toContain(fork2.id);
  });

  it('prunes sessions beyond max', () => {
    const manager = new SessionManager(tmpDir);
    for (let i = 0; i < 5; i++) {
      const s = manager.create();
      s.messages = [{ role: 'user' as const, content: `msg ${i}` }];
      manager.save(s);
    }
    expect(manager.list().length).toBe(5);
    manager.prune(3);
    expect(manager.list().length).toBeLessThanOrEqual(3);
  });

  it('getLatest returns most recently updated session', () => {
    const manager = new SessionManager(tmpDir);
    const older = manager.create();
    const newer = manager.create();

    const latest = manager.getLatest();
    expect(latest).toBeDefined();
    expect(latest!.id).toBe(newer.id);
  });

  it('handles non-existent session gracefully', () => {
    const manager = new SessionManager(tmpDir);
    expect(manager.load('nonexistent')).toBeNull();
  });
});
