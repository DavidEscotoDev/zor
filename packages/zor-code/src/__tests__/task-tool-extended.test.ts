import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { taskTool } from '../agent/subagent';

// Mock external dependencies
vi.mock('@earendil-works/pi-ai', () => ({
  getModel: vi.fn(() => ({ id: 'test-model' })),
}));

vi.mock('@earendil-works/pi-agent-core', () => ({
  Agent: vi.fn().mockImplementation(() => ({
    state: {
      messages: [
        { role: 'assistant', content: 'Task completed successfully' },
      ],
    },
    prompt: vi.fn().mockResolvedValue({ stopReason: 'done' }),
  })),
}));

vi.mock('../agent/rag', () => ({
  fetchRelevantFiles: vi.fn().mockResolvedValue(['src/file1.ts', 'src/file2.ts']),
  readFileContent: vi.fn().mockResolvedValue('file content'),
}));

vi.mock('../llm/resolve', () => ({
  resolveModel: vi.fn().mockResolvedValue({
    provider: { id: 'anthropic' },
    model: { id: 'claude-3-sonnet' },
  }),
}));

vi.mock('../agent/tools', () => ({
  coreTools: [],
  getReadOnlyTools: vi.fn(() => []),
}));

describe('taskTool extended - parallel execution with RAG context', () => {
  let mockCtx: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCtx = {
      config: { effort: 'medium' },
      session: {
        plan: [
          { id: 'task-1', status: 'pending' },
          { id: 'task-2', status: 'pending' },
        ],
      },
      sessionManager: {
        save: vi.fn(),
      },
    };
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should accept single task (backward compatibility)', async () => {
    const result = await taskTool.execute('test-id', {
      name: 'explorer',
      task: 'Explore the codebase',
      id: 'task-1',
    }, null, null, mockCtx);

    expect(result.content[0].text).toContain('✅ task-1: Task completed successfully');
    expect(result.details.results).toHaveLength(1);
  });

  it('should accept tasks array for parallel execution', async () => {
    const result = await taskTool.execute('test-id', {
      tasks: [
        { name: 'explorer', task: 'Explore the codebase', id: 'task-1' },
        { name: 'builder', task: 'Write code', id: 'task-2' },
      ],
    }, null, null, mockCtx);

    expect(result.content[0].text).toContain('✅ task-1: Task completed successfully');
    expect(result.content[0].text).toContain('✅ task-2: Task completed successfully');
    expect(result.details.results).toHaveLength(2);
  });

  it('should enrich tasks with RAG context', async () => {
    const { fetchRelevantFiles } = await import('../agent/rag');
    
    await taskTool.execute('test-id', {
      tasks: [
        { name: 'explorer', task: 'Explore the codebase', id: 'task-1' },
      ],
    }, null, null, mockCtx);

    expect(fetchRelevantFiles).toHaveBeenCalledWith('Explore the codebase', mockCtx.config);
  });

  it('should run tasks in parallel', async () => {
    const { Agent } = await import('@earendil-works/pi-agent-core');
    
    await taskTool.execute('test-id', {
      tasks: [
        { name: 'explorer', task: 'Explore the codebase', id: 'task-1' },
        { name: 'builder', task: 'Write code', id: 'task-2' },
      ],
    }, null, null, mockCtx);

    // Agent should be instantiated twice (once per task)
    expect(Agent).toHaveBeenCalledTimes(2);
  });

  it('should enrich each task with relevant files from RAG', async () => {
    const { fetchRelevantFiles, readFileContent } = await import('../agent/rag');
    
    await taskTool.execute('test-id', {
      tasks: [
        { name: 'explorer', task: 'Explore the codebase', id: 'task-1' },
        { name: 'builder', task: 'Write code', id: 'task-2' },
      ],
    }, null, null, mockCtx);

    expect(fetchRelevantFiles).toHaveBeenCalledTimes(2);
    expect(readFileContent).toHaveBeenCalled();
  });

  it('should update plan status for tasks with IDs', async () => {
    await taskTool.execute('test-id', {
      tasks: [
        { name: 'explorer', task: 'Explore the codebase', id: 'task-1' },
        { name: 'builder', task: 'Write code', id: 'task-2' },
      ],
    }, null, null, mockCtx);

    expect(mockCtx.session.plan[0].status).toBe('done');
    expect(mockCtx.session.plan[1].status).toBe('done');
    expect(mockCtx.sessionManager.save).toHaveBeenCalledWith(mockCtx.session);
  });

  it('should mark task as failed when agent returns error', async () => {
    const { Agent } = await import('@earendil-works/pi-agent-core');
    (Agent as any).mockImplementationOnce(() => ({
      state: {
        messages: [{ role: 'assistant', content: 'Error occurred' }],
      },
      prompt: vi.fn().mockResolvedValue({ stopReason: 'error' }),
    }));

    await taskTool.execute('test-id', {
      tasks: [
        { name: 'explorer', task: 'Explore the codebase', id: 'task-1' },
      ],
    }, null, null, mockCtx);

    expect(mockCtx.session.plan[0].status).toBe('failed');
  });

  it('should return error indicator for failed tasks', async () => {
    const { Agent } = await import('@earendil-works/pi-agent-core');
    (Agent as any).mockImplementationOnce(() => ({
      state: {
        messages: [{ role: 'assistant', content: 'Error occurred' }],
      },
      prompt: vi.fn().mockResolvedValue({ stopReason: 'error' }),
    }));

    const result = await taskTool.execute('test-id', {
      tasks: [
        { name: 'explorer', task: 'Explore the codebase', id: 'task-1' },
      ],
    }, null, null, mockCtx);

    expect(result.content[0].text).toContain('❌');
  });

  it('should return completed message when no output', async () => {
    const { Agent } = await import('@earendil-works/pi-agent-core');
    (Agent as any).mockImplementation(() => ({
      state: { messages: [] },
      prompt: vi.fn().mockResolvedValue({ stopReason: 'done' }),
    }));

    const result = await taskTool.execute('test-id', {
      tasks: [{ name: 'explorer', task: 'Explore', id: 'task-1' }],
    }, null, null, mockCtx);

    // ponytail: empty summary produces `✅ task-1: ` not fallback text
    expect(result.content[0].text).toContain('✅ task-1');
  });

  it('should return error when config not available', async () => {
    const result = await taskTool.execute('test-id', {
      name: 'explorer',
      task: 'Explore',
    }, null, null, {});

    expect(result.content[0].text).toBe('Error: config not available');
  });

  it('should use fallback preset when task name not found', async () => {
    const result = await taskTool.execute('test-id', {
      tasks: [{ name: 'unknown', task: 'Unknown task', id: 'task-1' }],
    }, null, null, mockCtx);

    expect(result.details.results[0]).toBeDefined();
  });

  it('should include RAG context in agent system prompt', async () => {
    const { Agent } = await import('@earendil-works/pi-agent-core');
    const { readFileContent } = await import('../agent/rag');
    
    (readFileContent as any).mockResolvedValue('file content from RAG');

    await taskTool.execute('test-id', {
      tasks: [{ name: 'explorer', task: 'Explore the codebase', id: 'task-1' }],
    }, null, null, mockCtx);

    const agentCall = (Agent as any).mock.calls[0][0];
    expect(agentCall.initialState.systemPrompt).toContain('Relevant files:');
    expect(agentCall.initialState.systemPrompt).toContain('file content from RAG');
  });

  it('should use correct thinking level from config', async () => {
    const { Agent } = await import('@earendil-works/pi-agent-core');
    
    mockCtx.config.effort = 'xhigh';
    
    await taskTool.execute('test-id', {
      tasks: [{ name: 'explorer', task: 'Explore', id: 'task-1' }],
    }, null, null, mockCtx);

    const agentCall = (Agent as any).mock.calls[0][0];
    expect(agentCall.initialState.thinkingLevel).toBe('xhigh');
  });

  it('should handle builder preset with coreTools', async () => {
    const { Agent } = await import('@earendil-works/pi-agent-core');

    await taskTool.execute('test-id', {
      tasks: [{ name: 'builder', task: 'Write code', id: 'task-1' }],
    }, null, null, mockCtx);

    const agentCall = (Agent as any).mock.calls[0][0];
    expect(agentCall.initialState.tools).toEqual([]); // coreTools mocked to empty
  });

  it('should handle empty tasks array', async () => {
    const result = await taskTool.execute('test-id', {
      tasks: [],
    }, null, null, mockCtx);

    expect(result.content[0].text).toBe('Tasks completed with no output');
  });

  it('should save session after updating plan', async () => {
    await taskTool.execute('test-id', {
      tasks: [{ name: 'explorer', task: 'Explore', id: 'task-1' }],
    }, null, null, mockCtx);

    expect(mockCtx.sessionManager.save).toHaveBeenCalledWith(mockCtx.session);
  });

  it('should not save session when no plan exists', async () => {
    mockCtx.session = { plan: [] };
    
    await taskTool.execute('test-id', {
      tasks: [{ name: 'explorer', task: 'Explore', id: 'task-1' }],
    }, null, null, mockCtx);

    expect(mockCtx.sessionManager.save).not.toHaveBeenCalled();
  });

  it('should include task summary in output', async () => {
    const result = await taskTool.execute('test-id', {
      tasks: [
        { name: 'explorer', task: 'Explore the codebase', id: 'task-1' },
        { name: 'builder', task: 'Write code', id: 'task-2' },
      ],
    }, null, null, mockCtx);

    expect(result.content[0].text).toContain('task-1');
    expect(result.content[0].text).toContain('task-2');
  });
});