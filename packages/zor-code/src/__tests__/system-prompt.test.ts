import { describe, it, expect } from 'vitest';

import { assembleSystemPrompt } from '../agent/system-prompt';

describe('assembleSystemPrompt', () => {
  it('returns string', () => {
    const result = assembleSystemPrompt({});
    expect(typeof result).toBe('string');
  });

  it('contains role information', () => {
    const result = assembleSystemPrompt({});
    expect(result).toContain('Zor Code');
    expect(result).toContain('AI coding agent');
  });

  it('contains tool usage rules', () => {
    const result = assembleSystemPrompt({});
    expect(result).toContain('CORE TOOLS');
    expect(result).toContain('Bash');
    expect(result).toContain('Read');
    expect(result).toContain('Write');
    expect(result).toContain('Edit');
    expect(result).toContain('Grep');
    expect(result).toContain('Task');
  });

  it('contains security rules', () => {
    const result = assembleSystemPrompt({});
    expect(result).toContain('RULES');
    expect(result).toContain('Prefer bash');
  });

  it('config variations affect output', () => {
    const configA = { model: 'anthropic/claude-sonnet-4-20250514', effort: 'high' };
    const configB = { model: 'openai/gpt-5', effort: 'low' };
    const resultA = assembleSystemPrompt(configA);
    const resultB = assembleSystemPrompt(configB);
    expect(resultA).toBe(resultB);
  });


});
