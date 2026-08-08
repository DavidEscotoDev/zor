import { Type, type Static } from '@sinclair/typebox';
import { resolve } from 'path';
import { homedir } from 'os';

export const ZorConfigSchema = Type.Object({
  model: Type.String({ default: 'opencode/claude-sonnet-4', description: 'provider/model format' }),
  effort: Type.Union([
    Type.Literal('off'),
    Type.Literal('minimal'),
    Type.Literal('low'),
    Type.Literal('medium'),
    Type.Literal('high'),
    Type.Literal('xhigh'),
  ], { default: 'off' }),
  permissions: Type.Union([
    Type.Literal('auto'),
    Type.Literal('confirm'),
    Type.Literal('plan'),
    Type.Literal('deny'),
  ], { default: 'auto' }),
  sandbox: Type.Optional(Type.Object({
    enabled: Type.Boolean({ default: false }),
    allowPaths: Type.Optional(Type.Array(Type.String(), { default: [] })),
    denyPaths: Type.Optional(Type.Array(Type.String(), { default: [] })),
    allowHosts: Type.Optional(Type.Array(Type.String(), { default: [] })),
    denyHosts: Type.Optional(Type.Array(Type.String(), { default: [] })),
  })),
  theme: Type.Union([
    Type.Literal('light'),
    Type.Literal('dark'),
    Type.Literal('auto'),
    Type.Literal('custom'),
  ], { default: 'auto' }),
  session: Type.Object({
    dir: Type.String({ default: './.zor/sessions' }),
    compactThreshold: Type.Number({ default: 50000 }),
  }),
  mcp: Type.Object({
    servers: Type.Array(Type.String(), { default: [] }),
  }),
  skills: Type.Optional(Type.Object({
    dir: Type.String({ default: '~/.zor/skills' }),
  })),
  statusBar: Type.Optional(Type.Object({
    enabled: Type.Boolean(),
    builtIn: Type.Optional(Type.Array(Type.Union([
      Type.Literal('model'), Type.Literal('context'), Type.Literal('perms'),
      Type.Literal('mcp'), Type.Literal('tokens'), Type.Literal('git'),
      Type.Literal('clock'), Type.Literal('memory'), Type.Literal('version'),
    ]))),
    overlays: Type.Optional(Type.Array(Type.Object({
      id: Type.String(),
      position: Type.Union([Type.Literal('left'), Type.Literal('center'), Type.Literal('right')]),
      component: Type.String(),
      props: Type.Optional(Type.Record(Type.String(), Type.Any())),
    }))),
  })),
  keybindings: Type.Optional(Type.Object({
    preset: Type.Optional(Type.Union([Type.Literal('default'), Type.Literal('vim'), Type.Literal('emacs')])),
    bindings: Type.Optional(Type.Record(Type.String(), Type.Union([Type.String(), Type.Array(Type.String())]))),
    path: Type.Optional(Type.String({ default: '~/.zor/keys.json' })),
  })),
  logging: Type.Optional(Type.Object({
    level: Type.Union([
      Type.Literal('debug'), Type.Literal('info'), Type.Literal('warn'), Type.Literal('error'), Type.Literal('fatal')
    ], { default: 'info' }),
    sinks: Type.Optional(Type.Array(Type.Union([
      Type.Literal('stdout'), Type.Literal('stderr'), Type.Literal('file')
    ]), { default: ['stdout'] })),
    file: Type.Optional(Type.Object({
      dir: Type.String({ default: '~/.zor/logs' }),
      maxSizeMB: Type.Number({ default: 10, minimum: 1, maximum: 100 }),
      maxFiles: Type.Number({ default: 5, minimum: 1, maximum: 50 }),
    })),
  })),
  orchestrator: Type.Optional(Type.Object({
    plannerModel: Type.Optional(Type.String({ default: 'opencode/gpt-4o-mini' })),
  })),
});

export type ZorConfig = Static<typeof ZorConfigSchema>;

export const defaultConfig: ZorConfig = {
  model: 'opencode/claude-sonnet-4',
  effort: 'off',
  permissions: 'auto',
  sandbox: {
    enabled: false,
    allowPaths: [],
    denyPaths: [],
    allowHosts: [],
    denyHosts: [],
  },
  theme: 'auto',
  session: {
    dir: './.zor/sessions',
    compactThreshold: 50000,
  },
  mcp: { servers: [] },
  skills: { dir: '~/.zor/skills' },
  statusBar: {
    enabled: true,
    builtIn: ['model', 'context', 'perms', 'mcp', 'tokens', 'git'],
    overlays: [],
  },
  keybindings: {
    preset: 'default',
    bindings: {},
    path: '~/.zor/keys.json',
  },
  logging: {
    level: 'info',
    sinks: ['stdout'],
    file: {
      dir: '~/.zor/logs',
      maxSizeMB: 10,
      maxFiles: 5,
    },
  },
  orchestrator: {
    plannerModel: 'opencode/gpt-4o-mini',
  },
};

function expandPath(p: string): string {
  if (p.startsWith('~/')) return resolve(homedir(), p.slice(2));
  return resolve(p);
}

export { loadConfig } from './config/loader';

export const VERSION = '0.6.4';