import { describe, it, expect, vi, beforeEach } from 'vitest';
import { slashCommands } from '../commands/slash-commands';

vi.mock('../agent/subagent', () => ({
  taskTool: {
    execute: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: '✅ 1: Done\n\n✅ 2: Done' }],
      details: { results: [{ id: '1', summary: 'Done', error: false }, { id: '2', summary: 'Done', error: false }] }
    })
  }
}));

describe('/task command', () => {
  it('executes plan tasks via Task tool', async () => {
    const mockSession = { id: 'test', plan: [{ id: '1', type: 'code', description: 'Write auth', deps: [], status: 'pending' }, { id: '2', type: 'test', description: 'Test auth', deps: ['1'], status: 'pending' }] };
    const mockConfig = { model: 'opencode/claude-sonnet-4', orchestrator: { plannerModel: 'opencode/gpt-4o-mini' } };
    const mockSessionManager = { save: vi.fn() };
    const ctx = { config: mockConfig, session: mockSession, sessionManager: mockSessionManager };

    const result = await slashCommands.task.execute('test-id', {}, new AbortController().signal, () => {}, ctx);

    expect(result.content[0].text).toContain('Executed');
  });

  it('shows error if no plan exists', async () => {
    const mockSession = { id: 'test', plan: undefined };
    const ctx = { config: {}, session: mockSession, sessionManager: { save: vi.fn() } };

    const result = await slashCommands.task.execute('test-id', {}, new AbortController().signal, () => {}, ctx);

    expect(result.content[0].text).toContain('No plan found');
  });

  it('shows all done if plan completed', async () => {
    const mockSession = { id: 'test', plan: [{ id: '1', type: 'code', description: 'Write auth', deps: [], status: 'done' }] };
    const ctx = { config: {}, session: mockSession, sessionManager: { save: vi.fn() } };

    const result = await slashCommands.task.execute('test-id', {}, new AbortController().signal, () => {}, ctx);

    expect(result.content[0].text).toContain('All tasks completed');
  });
});