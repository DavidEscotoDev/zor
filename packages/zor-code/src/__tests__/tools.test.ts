import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('fs', () => ({
  readFileSync: vi.fn((path: string) => {
    if (path.includes('traversal')) throw new Error('ENOENT');
    return 'file content here\nline 2\nline 3';
  }),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  statSync: vi.fn(() => ({ size: 100 })),
  existsSync: vi.fn(() => true),
}));

vi.mock('child_process', () => ({
  execSync: vi.fn((cmd: string) => `output of: ${cmd}`),
  spawnSync: vi.fn(() => ({ stdout: 'grep output', error: null })),
}));

vi.mock('glob', () => ({
  globSync: vi.fn(() => ['src/index.ts', 'src/utils.ts']),
}));

vi.mock('../agent/tools/search', () => ({
  ToolSearch: vi.fn(() => ({
    name: 'search',
    label: 'search',
    description: 'Search tool',
    parameters: { type: 'object', properties: {} },
    execute: vi.fn(),
  })),
}));

vi.mock('../agent/subagent', () => ({
  taskTool: {
    name: 'Task',
    label: 'task',
    description: 'Spawn sub-agent',
    parameters: { type: 'object', properties: {} },
    execute: vi.fn(),
  },
}));

import { buildToolSet } from '../agent/tools';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const mockMcpClient = {
  getTools: vi.fn(() => []),
};

describe('buildToolSet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns array of tools', () => {
    const tools = buildToolSet({}, mockMcpClient);
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
  });

  it('all tools have name, label, description, parameters, execute', () => {
    const tools = buildToolSet({}, mockMcpClient);
    for (const tool of tools) {
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.label).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(tool.parameters).toBeDefined();
      expect(typeof tool.execute).toBe('function');
    }
  });

  it('Bash tool exists', () => {
    const tools = buildToolSet({}, mockMcpClient);
    const bash = tools.find(t => t.name === 'Bash');
    expect(bash).toBeDefined();
    expect(bash!.label).toBe('bash');
  });

  it('Read tool exists', () => {
    const tools = buildToolSet({}, mockMcpClient);
    const read = tools.find(t => t.name === 'Read');
    expect(read).toBeDefined();
    expect(read!.label).toBe('read');
  });

  it('Write tool exists', () => {
    const tools = buildToolSet({}, mockMcpClient);
    const write = tools.find(t => t.name === 'Write');
    expect(write).toBeDefined();
    expect(write!.label).toBe('write');
  });

  it('Edit tool exists', () => {
    const tools = buildToolSet({}, mockMcpClient);
    const edit = tools.find(t => t.name === 'Edit');
    expect(edit).toBeDefined();
    expect(edit!.label).toBe('edit');
  });

  it('Glob tool exists', () => {
    const tools = buildToolSet({}, mockMcpClient);
    const glob = tools.find(t => t.name === 'Glob');
    expect(glob).toBeDefined();
    expect(glob!.label).toBe('glob');
  });

  it('Grep tool exists', () => {
    const tools = buildToolSet({}, mockMcpClient);
    const grep = tools.find(t => t.name === 'Grep');
    expect(grep).toBeDefined();
    expect(grep!.label).toBe('grep');
  });

  it('Task tool exists', () => {
    const tools = buildToolSet({}, mockMcpClient);
    const task = tools.find(t => t.name === 'Task');
    expect(task).toBeDefined();
  });
});

describe('validatePath', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks traversal (../)', async () => {
    const tools = buildToolSet({}, mockMcpClient);
    const read = tools.find(t => t.name === 'Read')!;
    const result = await read.execute('test-id', { filepath: '../../../etc/passwd' });
    const text = result.content[0].text;
    expect(text).toMatch(/Error|traversal/i);
  });

  it('allows valid paths', async () => {
    const tools = buildToolSet({}, mockMcpClient);
    const read = tools.find(t => t.name === 'Read')!;
    const result = await read.execute('test-id', { filepath: 'src/index.ts' });
    const text = result.content[0].text;
    expect(text).toBe('file content here\nline 2\nline 3');
  });
});

describe('tool behavior', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('Write creates parent directories', async () => {
    const tools = buildToolSet({}, mockMcpClient);
    const write = tools.find(t => t.name === 'Write')!;
    const result = await write.execute('test-id', { filepath: 'new-dir/file.txt', content: 'hello' });
    expect(mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    expect(writeFileSync).toHaveBeenCalled();
    expect(result.content[0].text).toContain('Written');
  });

  it('Write returns error for path traversal', async () => {
    const tools = buildToolSet({}, mockMcpClient);
    const write = tools.find(t => t.name === 'Write')!;
    const result = await write.execute('test-id', { filepath: '../../../etc/passwd', content: 'evil' });
    const text = result.content[0].text;
    expect(text).toMatch(/Error|traversal/i);
  });

  it('Edit succeeds when oldString found', async () => {
    const tools = buildToolSet({}, mockMcpClient);
    const edit = tools.find(t => t.name === 'Edit')!;
    await edit.execute('test-id', { filepath: 'src/test.ts', oldString: 'file content', newString: 'replaced content' });
    expect(writeFileSync).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('replaced content'), 'utf8');
  });

  it('Edit fails when oldString not found', async () => {
    const tools = buildToolSet({}, mockMcpClient);
    const edit = tools.find(t => t.name === 'Edit')!;
    const result = await edit.execute('test-id', { filepath: 'src/test.ts', oldString: 'NOT_IN_FILE', newString: 'replacement' });
    expect(result.content[0].text).toMatch(/Error|not found/i);
  });

  it('Glob returns matching files', async () => {
    const tools = buildToolSet({}, mockMcpClient);
    const glob = tools.find(t => t.name === 'Glob')!;
    const result = await glob.execute('test-id', { pattern: 'src/**/*.ts' });
    expect(result.content[0].text).toContain('src/index.ts');
  });

  it('Grep returns matches', async () => {
    const tools = buildToolSet({}, mockMcpClient);
    const grep = tools.find(t => t.name === 'Grep')!;
    const result = await grep.execute('test-id', { pattern: 'function' });
    expect(result.content[0].text).toBe('grep output');
  });
});
