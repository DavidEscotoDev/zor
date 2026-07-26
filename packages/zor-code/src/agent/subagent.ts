import { Type } from '@sinclair/typebox';
import { Agent, AgentTool } from '@earendil-works/pi-agent-core';
import { getModel } from '@earendil-works/pi-ai';
import { resolveModel } from '../llm/resolve';
import type { ZorConfig } from '../config';
import { coreTools, getReadOnlyTools } from './tools';
import { fetchRelevantFiles, readFileContent } from './rag';

// ponytail: lazy init breaks circular import between tools.ts <-> subagent.ts
function getPresets(): Record<string, { name: string; systemPrompt: string; tools: AgentTool[] }> {
  const ro = getReadOnlyTools();
  return {
    explorer: { name: 'explorer', systemPrompt: 'You are an exploration agent. Read files, search code, gather information. Do not modify files. Report findings concisely.', tools: ro },
    reviewer: { name: 'reviewer', systemPrompt: 'You are a code reviewer. Analyze code quality, security issues, and bugs. Provide specific, actionable feedback. Do not modify files.', tools: ro },
    debugger: { name: 'debugger', systemPrompt: 'You are a debugging specialist. Read error logs, trace code paths, identify root causes. Report findings with file paths and line numbers.', tools: ro },
    builder: { name: 'builder', systemPrompt: 'You are a builder. Create files, write code, run tests. Be precise and follow conventions.', tools: [...coreTools] },
  };
}

export async function createSubAgent(
  parentConfig: ZorConfig,
  name: string,
  task: string
) {
  const presets = getPresets();
  const preset = presets[name] || presets.explorer;
  const resolved = await resolveModel(parentConfig);
  const model = getModel(resolved.provider.id as any, resolved.model.id as any);

  const subAgent = new Agent({
    initialState: {
      systemPrompt: preset.systemPrompt + `\n\nTask: ${task}`,
      model,
      thinkingLevel: parentConfig.effort === 'xhigh' ? 'xhigh' : parentConfig.effort as any,
      tools: preset.tools,
      messages: [],
    },
    toolExecution: 'parallel',
  });

  return subAgent;
}

export const taskTool: AgentTool = {
  name: 'Task',
  label: 'task',
  description: 'Spawn an isolated sub-agent for exploration, review, or parallel work. Sub-agents have their own context window and return only a summary. Accepts single task (name, task, id) or tasks array for parallel execution with RAG context.',
  parameters: Type.Object({
    name: Type.Optional(Type.String({ description: 'Sub-agent type: explorer, reviewer, debugger, builder' })),
    task: Type.String({ description: 'Task description for the sub-agent' }),
    id: Type.Optional(Type.String({ description: 'Optional task ID for plan tracking' })),
    tasks: Type.Optional(Type.Array(Type.Object({
      name: Type.Optional(Type.String({ description: 'Sub-agent type' })),
      task: Type.String({ description: 'Task description' }),
      id: Type.Optional(Type.String({ description: 'Optional task ID' })),
    }), { description: 'Array of tasks to run in parallel' })),
  }),
  execute: async (_id: any, params: any, _signal: any, _onUpdate: any, ctx: any) => {
    if (!ctx?.config) {
      return { content: [{ type: 'text' as const, text: 'Error: config not available' }], details: {} };
    }

    // Accept both single task (backward compat) and tasks array
    const tasks = Array.isArray(params.tasks) ? params.tasks : [{ name: params.name, task: params.task, id: params.id }];
    const plan = ctx.session?.plan || [];

    // Enrich each task with RAG context
    const enrichedTasks = await Promise.all(tasks.map(async (t: any) => ({
      ...t,
      contextFiles: await fetchRelevantFiles(t.task, ctx.config)
    })));

    // Run tasks in parallel
    const results = await Promise.all(enrichedTasks.map(async (t: any) => {
      const preset = getPresets()[t.name] || getPresets().explorer;
      const resolved = await resolveModel(ctx.config);
      const model = getModel(resolved.provider.id as any, resolved.model.id as any);

      const context = t.contextFiles.length
        ? `\n\nRelevant files:\n${await Promise.all(t.contextFiles.map((f: string) => readFileContent(f, 0, 100))).then(r => r.join('\n---\n'))}`
        : '';

      const agent = new Agent({
        initialState: {
          systemPrompt: preset.systemPrompt + `\nTask: ${t.task}${context}`,
          model,
          thinkingLevel: ctx.config.effort === 'xhigh' ? 'xhigh' : ctx.config.effort as any,
          tools: preset.tools,
          messages: [],
        },
        toolExecution: 'parallel',
      });

      const result = await agent.prompt(t.task) as any;
      const summary = agent.state.messages
        .filter((m: any) => m.role === 'assistant')
        .map((m: any) => typeof m.content === 'string' ? m.content : '')
        .join('\n')
        .slice(0, 3000);

      // Update plan status if task has ID
      if (t.id && plan.length) {
        const p = plan.find((pt: any) => pt.id === t.id);
        if (p) p.status = result.stopReason === 'error' ? 'failed' : 'done';
      }

      return { id: t.id, summary, error: result.stopReason === 'error' };
    }));

    if (plan.length) ctx.sessionManager.save(ctx.session);

    const output = results.map(r => r.error ? `❌ ${r.id}: ${r.summary}` : `✅ ${r.id}: ${r.summary}`).join('\n\n');
    return { content: [{ type: 'text' as const, text: output || 'Tasks completed with no output' }], details: { results } };
  },
} as any as AgentTool;