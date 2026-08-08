import { globSync } from 'glob';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { ZorConfig } from '../config';
import { getProjectRoot } from '../project';

export async function fetchRelevantFiles(task: string, _config: ZorConfig): Promise<string[]> {
  const keywords = task.toLowerCase().match(/\b\w{4,}\b/g) || [];
  const uniqueKeywords = [...new Set(keywords)].slice(0, 8);
  const patterns = uniqueKeywords.map(k => `**/*${k}*`);

  const files = patterns.flatMap(p => globSync(p, { cwd: getProjectRoot(), nodir: true }));
  return [...new Set(files)].slice(0, 15);
}

export async function readFileContent(filepath: string, offset = 0, limit = 100): Promise<string> {
  const safePath = resolve(getProjectRoot(), filepath);
  const content = readFileSync(safePath, 'utf8');
  const lines = content.split('\n');
  const selected = lines.slice(offset, offset + limit);
  return selected.join('\n') + (selected.length < lines.length ? `\n... (${lines.length - offset - selected.length} more lines)` : '');
}