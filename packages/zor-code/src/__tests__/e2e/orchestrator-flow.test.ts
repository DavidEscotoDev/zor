import { describe, it, expect, vi, beforeEach } from 'vitest';
import { slashCommands } from '../../commands/slash-commands';

vi.mock('@earendil-works/pi-ai', () => ({
  getModel: vi.fn(() => ({
    generate: vi.fn().mockResolvedValue({ text: JSON.stringify([
      { id: '1', type: 'code', description: 'Create auth.ts with login function', deps: [] },
      { id: '2', type: 'test', description: 'Create auth.test.ts', deps: ['1'] }
    ]) }),
  })),
}));

vi.mock('../../agent/subagent', () => ({
  taskTool: {
    execute: vi.fn().mockImplementation(async (_id, params, _signal, _onUpdate, ctx) => {
      // Simulate status updates as real taskTool would
      const tasks = params.tasks || [];
      const plan = ctx.session?.plan || [];
      for (const t of tasks) {
        const p = plan.find((pt: any) => pt.id === t.id);
        if (p) p.status = 'done';
      }
      if (plan.length) ctx.sessionManager.save(ctx.session);
      return {
        content: [{ type: 'text', text: tasks.map((t: any) => `✅ ${t.id}: Done`).join('\n\n') }],
        details: { results: tasks.map((t: any) => ({ id: t.id, summary: 'Done', error: false })) },
      };
    }),
  },
}));

describe('Orchestrator flow', () => {
  let ctx: any;

  beforeEach(() => {
    ctx = {
      config: { model: 'opencode/claude-sonnet-4', orchestrator: { plannerModel: 'opencode/gpt-4o-mini' }, effort: 'high' },
      session: { id: 'test', messages: [], plan: undefined },
      sessionManager: { save: vi.fn() },
      agent: { state: { model: { generate: vi.fn() } } },
    };
  });

  it('creates plan then executes tasks', async () => {
    const planResult = await slashCommands.plan.execute('1', { goal: 'implement auth' }, new AbortController().signal, () => {}, ctx);
    expect(ctx.session.plan).toHaveLength(2);
    expect(ctx.session.plan[0].status).toBe('pending');
    expect(planResult.content[0].text).toContain('Plan created (2 tasks)');

    // First /task runs task 1 (no deps)
    const taskResult1 = await slashCommands.task.execute('2', {}, new AbortController().signal, () => {}, ctx);
    expect(taskResult1.content[0].text).toContain('Executed');
    expect(ctx.session.plan[0].status).toBe('done');
    expect(ctx.session.plan[1].status).toBe('pending');

    // Second /task runs task 2 (dep 1 now done)
    const taskResult2 = await slashCommands.task.execute('3', {}, new AbortController().signal, () => {}, ctx);
    expect(taskResult2.content[0].text).toContain('Executed');
    expect(ctx.session.plan[1].status).toBe('done');
  });

  it('shows all done on third /task call', async () => {
    await slashCommands.plan.execute('1', { goal: 'implement auth' }, new AbortController().signal, () => {}, ctx);
    await slashCommands.task.execute('2', {}, new AbortController().signal, () => {}, ctx);
    await slashCommands.task.execute('3', {}, new AbortController().signal, () => {}, ctx);

    const taskResult = await slashCommands.task.execute('4', {}, new AbortController().signal, () => {}, ctx);
    expect(taskResult.content[0].text).toContain('All tasks completed');
  });
});