import { describe, it, expect, vi, beforeEach } from 'vitest';
import { slashCommands } from '../commands/slash-commands';
import * as keys from '../llm/keys';
import * as providers from '../llm/providers';
import * as project from '../project';

vi.mock('../llm/keys');
vi.mock('../llm/ollama');
vi.mock('../llm/resolve');
vi.mock('../project', () => ({
  getProjectRoot: vi.fn(() => 'C:/projects/current'),
  setProjectRoot: vi.fn(),
  saveProjectDir: vi.fn(),
}));

const mockCtx = {
  config: { model: 'anthropic/claude-sonnet-4-20250514', effort: 'high' },
  sessionManager: { fork: vi.fn(), getTree: vi.fn() },
  session: { id: 'test-session', messages: [] },
  agent: { state: { tools: [], usage: { input: 100, output: 50 } }, compact: vi.fn() },
};

describe('slashCommands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCtx.config.effort = 'high';
    mockCtx.config.model = 'anthropic/claude-sonnet-4-20250514';
  });

  it('/effort sets config.effort', async () => {
    const cmd = slashCommands.effort;
    const result = await (cmd as any).execute('id', { level: 'low' }, null, null, mockCtx);
    expect(mockCtx.config.effort).toBe('low');
    expect(result.content[0].text).toContain('low');
  });

  it('/model sets config.model', async () => {
    const cmd = slashCommands.model;
    const result = await (cmd as any).execute('id', { target: 'openai/gpt-5' }, null, null, mockCtx);
    expect(mockCtx.config.model).toBe('openai/gpt-5');
    expect(result.content[0].text).toContain('openai/gpt-5');
  });

  it('/keys list returns key statuses', async () => {
    vi.mocked(keys.getKeyStatuses).mockReturnValue([
      { provider: 'anthropic', name: 'Anthropic', hasKey: true },
      { provider: 'openai', name: 'OpenAI', hasKey: false },
    ]);
    const cmd = slashCommands.keys;
    const result = await (cmd as any).execute('id', { action: 'list' }, null, null, mockCtx);
    expect(result.content[0].text).toContain('API Keys');
    expect(result.content[0].text).toContain('Anthropic');
    expect(result.details.statuses).toHaveLength(2);
  });

  it('/providers returns provider list', async () => {
    vi.spyOn(providers, 'getAllProviders').mockReturnValue([
      { id: 'anthropic', name: 'Anthropic', api: 'anthropic', baseUrl: '', envKey: '', models: [{ id: 'm1', name: 'M1', contextWindow: 200000, maxTokens: 8192, supportsThinking: true, supportsVision: true, pricing: { input: 3, output: 15 } }] },
    ] as any);
    const cmd = slashCommands.providers;
    const result = await (cmd as any).execute('id', {}, null, null, mockCtx);
    expect(result.content[0].text).toContain('Providers');
    expect(result.details.providers).toContain('anthropic');
  });

  it('/ollama command is wrapped in try/catch', async () => {
    const cmd = slashCommands.ollama;
    const result = await (cmd as any).execute('id', {}, null, null, mockCtx);
    expect(result.content[0].text).toBeDefined();
    expect(result.details).toBeDefined();
  });

  it('/status shows model and effort', async () => {
    const cmd = slashCommands.status;
    const result = await (cmd as any).execute('id', {}, null, null, mockCtx);
    expect(result.content[0].text).toContain('anthropic/claude-sonnet-4-20250514');
    expect(result.content[0].text).toContain('high');
  });

  it('/cost shows usage', async () => {
    const cmd = slashCommands.cost;
    const result = await (cmd as any).execute('id', {}, null, null, mockCtx);
    expect(result.content[0].text).toContain('100');
    expect(result.content[0].text).toContain('50');
  });

  it('/project with no dir shows current root', async () => {
    const cmd = slashCommands.project;
    const result = await (cmd as any).execute('id', {}, null, null, mockCtx);
    expect(result.content[0].text).toContain('C:/projects/current');
  });

  it('/project with dir sets and saves root', async () => {
    const cmd = slashCommands.project;
    const result = await (cmd as any).execute('id', { dir: 'other-proj' }, null, null, mockCtx);
    expect(result.content[0].text).toContain('other-proj');
    expect(project.setProjectRoot).toHaveBeenCalledWith(expect.stringMatching(/other-proj$/));
    expect(project.saveProjectDir).toHaveBeenCalledWith(expect.stringMatching(/other-proj$/));
  });
});
