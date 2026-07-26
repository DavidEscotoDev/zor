import { describe, it, expect } from 'vitest';
import { ZorConfigSchema, defaultConfig } from '../config';
import { Value } from '@sinclair/typebox/value';

describe('ZorConfig orchestrator config', () => {
  it('has orchestrator field in schema', () => {
    const schema = ZorConfigSchema.properties;
    expect(schema).toHaveProperty('orchestrator');
  });

  it('has orchestrator in defaultConfig with correct defaults', () => {
    expect(defaultConfig).toHaveProperty('orchestrator');
    expect(defaultConfig.orchestrator).toEqual({
      plannerModel: 'opencode/gpt-4o-mini',
    });
  });

  it('validates orchestrator config against schema', () => {
    const config = {
      ...defaultConfig,
      orchestrator: {
        plannerModel: 'opencode/gpt-4o',
      },
    };
    expect(Value.Check(ZorConfigSchema, config)).toBe(true);
  });
});