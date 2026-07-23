import { describe, it, expect, vi, beforeEach } from 'vitest';
import { slashCommands } from '../commands/slash-commands';
import { getModel } from '@earendil-works/pi-ai';

vi.mock('@earendil-works/pi-ai', () => ({
  getModel: vi.fn(() => ({
    generate: vi.fn().mockResolvedValue({
      text: JSON.stringify([
        { id: '1', type: 'code', description: 'Write auth.ts', deps: [] },
        { id: '2', type: 'test', description: 'Write auth.test.ts', deps: ['1'] }
      ])
    })
  }))
}));

describe('/plan command', () => {
  let mockSession: any;
  let mockSessionManager: any;
  let mockConfig: any;
  let mockAgent: any;
  let ctx: any;

  beforeEach(() => {
    mockSession = { id: 'test', messages: [], plan: undefined };
    mockSessionManager = { save: vi.fn() };
    mockConfig = { model: 'opencode/claude-sonnet-4', orchestrator: { plannerModel: 'opencode/gpt-4o-mini' } };
    mockAgent = { state: { model: { generate: vi.fn() } } };
    ctx = { config: mockConfig, session: mockSession, sessionManager: mockSessionManager, agent: mockAgent };
  });

  it('creates plan and stores in session', async () => {
    const controller = new AbortController();
    const result = await slashCommands.plan.execute('test-id', { goal: 'implement auth' }, controller.signal, () => {}, ctx);

    expect(mockSession.plan).toBeDefined();
    expect(mockSession.plan).toHaveLength(2);
    expect(mockSessionManager.save).toHaveBeenCalledWith(mockSession);
    expect(result.content[0].text).toContain('Plan created (2 tasks)');
  });
});