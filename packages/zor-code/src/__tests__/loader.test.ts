import { describe, it, expect, vi } from 'vitest';
import { loadConfig } from '../config/loader';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const tmpDir = path.join(os.tmpdir(), `zor-loader-test-${Date.now()}`);
fs.mkdirSync(tmpDir, { recursive: true });

describe('loadConfig', () => {
  it('falls back to default config when no file found', () => {
    const config = loadConfig('/nonexistent/path/zor.json');
    expect(config.model).toBe('opencode/claude-sonnet-4');
    expect(config.effort).toBe('off');
    expect(config.permissions).toBe('auto');
  });

  it('handles invalid JSON gracefully', () => {
    const file = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(file, '{ invalid json }');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const config = loadConfig(file);
    expect(config.model).toBe('opencode/claude-sonnet-4');
    consoleSpy.mockRestore();
    fs.unlinkSync(file);
  });

  it('returns complete default config with all required fields', () => {
    const config = loadConfig('/nonexistent');
    expect(config).toHaveProperty('model');
    expect(config).toHaveProperty('effort');
    expect(config).toHaveProperty('permissions');
    expect(config).toHaveProperty('session');
    expect(config).toHaveProperty('mcp');
    expect(config.session).toHaveProperty('dir');
    expect(config.session).toHaveProperty('compactThreshold');
    expect(config.mcp).toHaveProperty('servers');
  });
});