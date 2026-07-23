import { render } from 'ink';
import React, { useState, useEffect, useCallback, useRef, useMemo, useContext, createContext } from 'react';
import { Box, Text, useInput } from 'ink';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { relative, resolve, join } from 'path';
import { createZorAgent } from './agent/create';
import { loadConfig, ZorConfig, VERSION } from './config';
import { slashCommands } from './commands/slash-commands';
import { SPECKIT_PROMPTS } from './commands/speckit';
import { getKeyStatuses, resolveKey, setKey } from './llm/keys';
import { listAllModels } from './llm/resolve';
import { getProvider } from './llm/providers';
import { loadLastSession, saveLastSession } from './llm/session-state';
import { logger, configureLogger } from './utils/logger';
import { SessionManager, SessionData } from './session/manager';
import { SessionPicker } from './tui/session-picker';
import { StatusBar } from './tui/status-bar';
import { setConfirmationCallback, getPendingConfirmation, resolveConfirmation } from './permissions/confirm';
import { countMessagesTokens } from './utils/tokens';
import { ThemeProvider, useThemeStyles } from './theme';
import { registerTheme } from './theme/registry';
import { loadKeybindings, resolveKeybinding, Action, DEFAULT_KEYBINDINGS } from './keybindings';
import { runRpc } from './rpc';
import { createExtensionHost, ExtensionContribution } from './extensions';
import { setSandboxConfig } from './agent/sandbox';
import { mergeExtensionCommands } from './commands/slash-commands';

const MAX_INPUT_CHARS = 100_000;
const IS_PIPED = !process.stdin.isTTY;
const IS_RPC = process.argv.includes('--rpc');

if (IS_RPC) {
  (async () => {
    await runRpc();
  })();
  process.exit(0);
}

if (process.argv.includes('--version') || process.argv.includes('-v')) {
  console.log(`Zor Code v${VERSION}`);
  process.exit(0);
}
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`Zor Code v${VERSION} — Open-source AI coding agent
Usage:
  zor-code [provider/model]      Start interactive TUI
  zor-code --continue            Resume latest session
  zor-code --resume [id]         Resume specific session
  zor-code --rpc                 Start JSON-RPC mode (stdin/stdout)
  echo "task" | zor-code         Piped input mode
  zor-code --version             Show version
  zor-code --help                Show this help

Slash commands (inside TUI):
  /plan <goal>       Create multi-task execution plan (cheap planner model)
  /task              Execute next ready tasks from plan (parallel)
  /model, /use, /keys, /providers, /models, /ollama
  /effort, /cost, /status, /context, /init
  /fork, /tree, /compact, /rename, /resume
  /speckit.constitution, /speckit.specify, /speckit.clarify
  /speckit.plan, /speckit.tasks, /speckit.implement, /speckit.converge
  /clear, /more, /help, /exit`);
  process.exit(0);
}

function wordLeft(text: string, pos: number): number {
  let skip = 0;
  while (pos - skip > 0 && text[pos - skip - 1] === ' ') skip++;
  while (pos - skip > 0 && text[pos - skip - 1] !== ' ') skip++;
  return skip;
}

function wordRight(text: string, pos: number): number {
  let skip = 0;
  while (pos + skip < text.length && text[pos + skip] !== ' ') skip++;
  while (pos + skip < text.length && text[pos + skip] === ' ') skip++;
  return skip;
}

process.on('uncaughtException', (err) => {
  logger.fatal('Uncaught exception', { error: err.message, stack: err.stack });
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: String(reason) });
});

function DiffLine({ content }: { content: string }) {
  const theme = useThemeStyles();
  const lines = content.split('\n');
  const firstDiff = lines.findIndex(l => l.startsWith('+') || l.startsWith('-'));
  if (firstDiff === -1 || firstDiff >= lines.length * 0.8) return <Text>{content}</Text>;

  return (
    <Box flexDirection="column">
      {lines.map((line, i) => {
        if (line.startsWith('+')) return <Text key={i} color={theme.diffAdd} backgroundColor={theme.diffAdd}>{line}</Text>;
        if (line.startsWith('-')) return <Text key={i} color={theme.diffRemove} backgroundColor={theme.diffRemove}>{line}</Text>;
        return <Text key={i} color={theme.textMuted}>{line}</Text>;
      })}
    </Box>
  );
}

function MessageContent({ content }: { content: string }) {
  if (content.length > 5000) {
    const hasDiff = content.includes('\n+') || content.includes('\n-');
    if (hasDiff) return <DiffLine content={content} />;
  }
  return <Text>{content}</Text>;
}

function StartupHeader() {
  const theme = useThemeStyles();
  const cwd = process.cwd();
  const shortCwd = cwd.split(/[\\/]/).slice(-2).join('/');
  return (
    <Box flexDirection="row" justifyContent="space-between" paddingX={1} marginBottom={1}>
      <Text color={theme.primary} bold>{' ⚡ Zor Code'}</Text>
      <Text color={theme.textMuted}>v{VERSION} | {shortCwd}</Text>
    </Box>
  );
}

function promptLine(question: string): Promise<string> {
  return new Promise((resolve) => {
    const wasRaw = process.stdin.isRaw;

    if (!process.stdin.isTTY) {
      import('readline').then(({ createInterface }) => {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        rl.question(question, (ans) => { rl.close(); resolve(ans.trim()); });
      });
      return;
    }

    try {
      try { if (!wasRaw) process.stdin.setRawMode(true); } catch { /* ponytail: setRawMode fails on some Windows terminals, non-critical */ }
    } catch {
      import('readline').then(({ createInterface }) => {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        rl.question(question, (ans) => { rl.close(); resolve(ans.trim()); });
      });
      return;
    }

    process.stdout.write(question);
    let buf = '';
    const onData = (chunk: Buffer | string) => {
      const str = typeof chunk === 'string' ? chunk : chunk.toString();
      for (const ch of str) {
        if (ch === '\r' || ch === '\n') {
          process.stdout.write('\n');
          if (!wasRaw && process.stdin.isTTY) {
            try { process.stdin.setRawMode(false); } catch { /* ponytail: non-critical on Windows */ }
          }
          process.stdin.off('data', onData);
          resolve(buf.trim());
          return;
        }
        if (ch === '\x7f' || ch === '\b') {
          if (buf.length > 0) {
            buf = buf.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        if (ch === '\x03') {
          process.stdout.write('\n');
          if (!wasRaw && process.stdin.isTTY) {
            try { process.stdin.setRawMode(false); } catch { /* ponytail: non-critical on Windows */ }
          }
          process.stdin.off('data', onData);
          process.exit(0);
        }
        buf += ch;
        process.stdout.write(ch);
      }
    };
    process.stdin.on('data', onData);
  });
}

async function pickNewProvider(config: ZorConfig): Promise<void> {
  const statuses = getKeyStatuses();
  const configured = statuses.filter(s => s.hasKey);
  console.error('Saved provider not found or invalid.');
  if (configured.length === 0) {
    console.error('No API keys configured. Set one with: /keys set <provider> <key>');
  } else {
    console.error('Providers with keys:');
    configured.forEach(s => console.error(`  ${s.provider.padEnd(12)} ${s.name}`));
  }
  const answer = await promptLine('Enter provider/model to use: ');
  if (!answer || !answer.includes('/')) {
    console.error('Invalid format. Expected provider/model');
    process.exit(1);
  }
  const providerId = answer.split('/')[0];
  const modelId = answer.split('/').slice(1).join('/');
  if (!getProvider(providerId)) {
    console.error(`Unknown provider: ${providerId}`);
    process.exit(1);
  }
  config.model = answer;
  saveLastSession(providerId, modelId);
}

async function ensureKeyForProvider(config: ZorConfig): Promise<void> {
  const providerId = config.model.split('/')[0];
  const provider = getProvider(providerId);
  if (!provider) return;
  if (provider.api === 'ollama') return;
  const key = resolveKey(provider);
  if (key) return;
  const answer = await promptLine(`No API key for ${provider.name}. Enter key: `);
  if (!answer) {
    console.error('No key provided. Exiting.');
    process.exit(1);
  }
  setKey(provider.id, answer);
}

async function pickProviderFromKeys(config: ZorConfig): Promise<void> {
  const statuses = getKeyStatuses().filter(s => s.hasKey);
  const candidates = statuses.filter(s => s.provider !== 'ollama');
  if (candidates.length === 0 && statuses.length > 0) candidates.push(...statuses);
  if (candidates.length === 0) return;

  if (candidates.length === 1) {
    const p = getProvider(candidates[0].provider);
    if (p && p.models[0]) {
      config.model = `${p.id}/${p.models[0].id}`;
      saveLastSession(p.id, p.models[0].id);
    }
    return;
  }

  console.error('Multiple API keys found. Pick a provider:');
  candidates.forEach((s, i) => {
    console.error(`  ${String(i + 1).padStart(2)}. ${s.provider.padEnd(12)} ${s.name}`);
  });
  const answer = await promptLine('Enter number or provider/model: ');
  if (!answer) {
    console.error('No selection. Exiting.');
    process.exit(1);
  }
  let chosen = answer.trim();
  const idx = parseInt(chosen) - 1;
  if (!isNaN(idx) && idx >= 0 && idx < candidates.length) {
    chosen = candidates[idx].provider;
  }
  if (!chosen.includes('/')) {
    const p = getProvider(chosen);
    if (!p || !p.models[0]) {
      console.error(`Invalid provider: ${chosen}`);
      process.exit(1);
    }
    config.model = `${p.id}/${p.models[0].id}`;
  } else {
    config.model = chosen;
  }
  const providerId = config.model.split('/')[0];
  const modelId = config.model.split('/').slice(1).join('/');
  saveLastSession(providerId, modelId);
}

interface ExtensionRegistries {
  tools: { register: (id: string, item: any) => void; get: (id: string) => any; getAll: () => any[] };
  commands: { register: (id: string, item: any) => void; get: (id: string) => any; getAll: () => any[] };
  overlays: { register: (id: string, item: any) => void; get: (id: string) => any; getAll: () => any[] };
  themes: { register: (id: string, item: any) => void; get: (id: string) => any; getAll: () => any[] };
  skills: { register: (id: string, item: any) => void; get: (id: string) => any; getAll: () => any[] };
  providers: { register: (id: string, item: any) => void; get: (id: string) => any; getAll: () => any[] };
  keybindings: { register: (action: string, keys: string | string[]) => void; get: (action: string) => string[] | undefined; getAll: () => Record<string, string[] | undefined> };
}

function App({ initialConfig, existingSession, extensionRegistries }: { initialConfig: ZorConfig; existingSession?: SessionData; extensionRegistries: ExtensionRegistries }) {
  const [config, setConfig] = useState<ZorConfig>(initialConfig);
  const theme = useThemeStyles();
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [effort, setEffort] = useState(config.effort);
  const [model, setModel] = useState(config.model);
  const [agentRef, setAgentRef] = useState<any>(null);
  const [ctx, setCtx] = useState<any>(null);
  const [pickerModels, setPickerModels] = useState<Array<{providerId: string, id: string, name: string}> | null>(null);
  const [visibleCount, setVisibleCount] = useState(200);
  const [cursorPos, setCursorPos] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [permMode, setPermMode] = useState(config.permissions);
  const [sessionName, setSessionName] = useState<string | undefined>(existingSession?.name);
  const [pickerMode, setPickerMode] = useState<'session' | null>(null);
  const [pickerSessions, setPickerSessions] = useState<SessionData[]>([]);
  const [confirmInfo, setConfirmInfo] = useState<{ toolName: string; args: any } | null>(null);
  const confirmResolveRef = useRef<((approved: boolean) => void) | null>(null);
  const [tokenEstimate, setTokenEstimate] = useState(0);
  const [gitBranch, setGitBranch] = useState<string | undefined>(undefined);

  // Register extension themes
  useEffect(() => {
    if (extensionRegistries?.themes) {
      for (const t of extensionRegistries.themes.getAll()) {
        registerTheme(t.name, t);
      }
    }
  }, [extensionRegistries]);

  // Merge extension commands
  useEffect(() => {
    if (extensionRegistries?.commands) {
      mergeExtensionCommands(extensionRegistries.commands.getAll());
    }
  }, [extensionRegistries]);

  // Merge extension keybindings into config
  const mergedKeybindings = useMemo(() => {
    const base = config.keybindings || {};
    const ext = extensionRegistries?.keybindings?.getAll() || {};
    const mergedBindings: Record<string, string | string[]> = { ...base.bindings };
    for (const [key, value] of Object.entries(ext)) {
      if (value) mergedBindings[key] = value;
    }
    return { ...base, bindings: mergedBindings };
  }, [config.keybindings, extensionRegistries]);

  useEffect(() => {
    if (ctx) setCtx({ ...ctx, config });
  }, [ctx, config]);

  const MULTILINE_HEIGHT = 6;
  const inputRef = useRef('');
  const savedInputRef = useRef('');
  const submitRef = useRef<(text: string) => void>((t: string) => {});
  const processingRef = useRef(false);
  const initAgentRef = useRef<(opts?: { skipFallback?: boolean }) => Promise<any>>(() => Promise.resolve(null));
  const abortRef = useRef<(() => void) | null>(null);
  const checkpointsRef = useRef<Array<{ path: string; content: string }>>([]);

  const initAgent = useCallback(async (opts?: { skipFallback?: boolean }): Promise<any> => {
    const statuses = getKeyStatuses();
    const configuredProviders = statuses.filter(s => s.hasKey);
    if (configuredProviders.length === 0) {
      setModel('No API key set');
      return null;
    }
    const defaultProvider = config.model.split('/')[0];
    const hasDefaultKey = configuredProviders.some(s => s.provider === defaultProvider);
    if (!hasDefaultKey) {
      if (opts?.skipFallback) throw new Error(`No API key for ${defaultProvider}. Set: /keys set ${defaultProvider} <key>`);
      const fallback = configuredProviders[0];
      config.model = `${fallback.provider}/${fallback.provider === 'ollama' ? 'llama3' : 'claude-sonnet-4'}`;
    }
    try {
      const { agent, resolved, sessionManager, session, mcpErrors } = await createZorAgent(config, existingSession, extensionRegistries?.tools?.getAll() || []);
      setAgentRef(agent);
      setModel(resolved.provider.id + '/' + resolved.model.id);
      setCtx({ agent, config, sessionManager, session });
      saveLastSession(resolved.provider.id, resolved.model.id);
      if (mcpErrors.length > 0) setMessages(prev => [...prev, { role: 'system', content: `MCP warnings:\n${mcpErrors.join('\n')}` }]);
      agent.subscribe((event: any) => {
        try {
          switch (event.type) {
            case 'message_update':
              if (event.assistantMessageEvent?.type === 'text_delta') {
                setMessages(prev => {
                  const last = prev[prev.length - 1];
                  if (last && last.role === 'assistant') return [...prev.slice(0, -1), { ...last, content: last.content + event.assistantMessageEvent.delta }];
                  return [...prev, { role: 'assistant', content: event.assistantMessageEvent.delta }];
                });
              }
              break;
             case 'message_end':
              if (event.message?.stopReason === 'error') {
                const errMsg = event.message.errorMessage || 'Unknown API error';
                setMessages(prev => [...prev, { role: 'system', content: `Error: ${errMsg}` }]);
              }
              break;
            case 'tool_execution_update':
              if (event.partialResult?.content) {
                const text = event.partialResult.content.map((c: any) => c.text || '').join('');
                if (text) {
                  setMessages(prev => {
                    const last = prev[prev.length - 1];
                    if (last && last.role === 'tool' && last.content.startsWith(event.toolName || 'Bash')) {
                      return [...prev.slice(0, -1), { ...last, content: last.content + text }];
                    }
                    return [...prev, { role: 'tool', content: text }];
                  });
                }
              }
              break;
              if ((event.toolName === 'Write' || event.toolName === 'Edit') && event.args?.filepath) {
                try {
                  const fp = event.args.filepath;
                  if (existsSync(fp)) {
                    checkpointsRef.current.push({ path: fp, content: readFileSync(fp, 'utf8') });
                    if (checkpointsRef.current.length > 20) checkpointsRef.current.shift();
                  }
                } catch { /* ponytail: checkpoint read best-effort */ }
              }
              {
                const argsShort = event.args ? JSON.stringify(event.args).slice(0, 120) : '';
                setMessages(prev => [...prev, { role: 'tool', content: `${event.toolName} ${argsShort}` }]);
              }
              break;
            case 'turn_end':
              if (event.message) {
                try {
                  const agent = agentRef;
                  if (agent) {
                    const newMsgs = agent.state.messages;
                    setMessages(prev => {
                      const existing = new Set(prev.map(m => `${m.role}:${m.content.slice(0, 80)}`));
                      const toAdd = newMsgs.filter((m: any) => !existing.has(`${m.role}:${(typeof m.content === 'string' ? m.content : '').slice(0, 80)}`));
                      const toolResults = toAdd.filter((m: any) => m.role === 'tool_result' || m.role === 'tool');
                      return [...prev, ...toolResults.map((m: any) => {
                        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
                        return { role: m.role || 'tool_result', content: content.slice(0, 5000) };
                      })];
                    });
                  }
                } catch { /* ponytail: session message sync best-effort */ }
              }
              break;
            case 'agent_end':
              if (event.messages?.length) {
                const last = event.messages[event.messages.length - 1];
                if (last?.stopReason === 'error' && last.errorMessage) {
                  setMessages(prev => [...prev, { role: 'system', content: `API Error: ${last.errorMessage}` }]);
                }
              }
              setIsProcessing(false);
              break;
          }
        } catch (e: any) { logger.error('Agent event handler error', { error: e.message }); }
      });
      return agent;
    } catch (e: any) {
      setMessages([{ role: 'system', content: e.message }]);
      setModel('init failed');
      return null;
    }
  }, [config]);

  useEffect(() => { initAgent(); }, [initAgent]);
  useEffect(() => { initAgentRef.current = initAgent; }, [initAgent]);
  useEffect(() => {
    setConfirmationCallback((info) => {
      if (info) {
        setConfirmInfo({ toolName: info.toolName, args: info.args });
      } else {
        setConfirmInfo(null);
      }
    });
  }, []);

  useEffect(() => {
    if (!ctx) return;
    const updateMetrics = () => {
      try {
        const msgs = ctx.agent.state.messages;
        setTokenEstimate(countMessagesTokens(msgs));
      } catch {}
      try {
        const { execSync } = require('child_process');
        const branch = execSync('git branch --show-current 2>/dev/null', { encoding: 'utf8', timeout: 500 }).trim();
        if (branch) setGitBranch(branch);
      } catch {}
    };
    updateMetrics();
    const id = setInterval(updateMetrics, 5000);
    return () => clearInterval(id);
  }, [ctx]);

  const handleSlashCommand = useCallback(async (trimmed: string) => {
    const parts = trimmed.slice(1).split(' ');
    const cmd = parts[0];

    if (cmd === 'clear') { setMessages([]); setIsProcessing(false); return; }
    if (cmd === 'more') { setVisibleCount(prev => prev + 200); setIsProcessing(false); return; }
    if (cmd === 'exit') { process.exit(0); }
    if (cmd === 'rename' && ctx) {
      const newName = parts.slice(1).join(' ').trim();
      if (!newName) {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Usage: /rename <name>' }]);
        setIsProcessing(false);
        return;
      }
      ctx.session.name = newName;
      ctx.sessionManager.save(ctx.session);
      setSessionName(newName);
      setMessages(prev => [...prev, { role: 'assistant', content: `Session renamed to: ${newName}` }]);
      setIsProcessing(false);
      return;
    }

    if (cmd === 'resume') {
      const sm = new SessionManager(config.session.dir);
      const sessions = sm.list().slice(0, 100);
      if (sessions.length === 0) {
        setMessages(prev => [...prev, { role: 'assistant', content: 'No previous sessions found.' }]);
        setIsProcessing(false);
        return;
      }
      setPickerSessions(sessions);
      setPickerMode('session');
      setIsProcessing(false);
      return;
    }

    if (cmd === 'context' && ctx) {
      const msgs = ctx.agent.state.messages;
      const tokenEstimate = countMessagesTokens(msgs);
      const summary = `Context:
  Messages: ${msgs.length}
  Model: ${config.model}
  Effort: ${config.effort}
  Permission: ${permMode}
  Tools: ${ctx.agent.state.tools.length}
  Est. tokens: ${tokenEstimate.toLocaleString()}
  Limit: ${config.session.compactThreshold.toLocaleString()}`;
      setMessages(prev => [...prev, { role: 'assistant', content: summary }]);
      setIsProcessing(false);
      return;
    }

    if (cmd === 'init') {
      const defModel = await promptLine(`Default model [opencode/claude-sonnet-4]: `) || 'opencode/claude-sonnet-4';
      const defEffort = await promptLine(`Effort level (off/minimal/low/medium/high/xhigh) [high]: `) || 'high';
      const defPerm = await promptLine(`Permission mode (auto/confirm/plan/deny) [confirm]: `) || 'confirm';
      const zorJson = JSON.stringify({
        $schema: 'https://zor-ai.github.io/zor/schema.json',
        model: defModel,
        effort: defEffort,
        permissions: defPerm,
        sandbox: false,
        session: { dir: './.zor/sessions', compactThreshold: 160000 },
        mcp: { servers: [] },
      }, null, 2);
      writeFileSync('zor.json', zorJson, 'utf8');
      setMessages(prev => [...prev, { role: 'assistant', content: `Created zor.json with model=${defModel} effort=${defEffort} permissions=${defPerm}` }]);
      setIsProcessing(false);
      return;
    }

    if (cmd === 'help') {
      const lines = Object.values(slashCommands).map(c => `  ${c.name.padEnd(12)} ${c.description}`);
      lines.push('  /speckit.constitution  Set project principles');
      lines.push('  /speckit.specify  Create feature spec');
      lines.push('  /speckit.clarify  Clarify underspecified areas');
      lines.push('  /speckit.plan     Create implementation plan');
      lines.push('  /speckit.tasks    Generate task breakdown');
      lines.push('  /speckit.implement  Execute implementation');
lines.push('  /speckit.converge Audit code vs spec');
  lines.push('  /export          Export session (html|json|md)');
  lines.push('  /skill           Run skill template');
  lines.push('  /replay          Replay a session');
  lines.push('  /clear           Clear screen');
  lines.push('  /more            Show 200 more messages');
  lines.push('  /exit            Exit Zor');
  lines.push('  /help            This help');
  lines.push('');
  lines.push('  Enter            Interrupt agent (during processing)');
  lines.push('  Alt+Enter        Queue follow-up (during processing)');
      setMessages(prev => [...prev, { role: 'assistant', content: `Commands:\n${lines.join('\n')}` }]);
      setIsProcessing(false);
      return;
    }

    // Speckit commands: build prompt, feed to agent
    if (cmd.startsWith('speckit.')) {
      const speckitCmd = cmd.replace('speckit.', '');
      if (!SPECKIT_PROMPTS[speckitCmd]) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Unknown speckit command: ${speckitCmd}. Available: ${Object.keys(SPECKIT_PROMPTS).join(', ')}` }]);
        setIsProcessing(false);
        return;
      }
      const userInput = parts.slice(1).join(' ').trim();
      const prompt = SPECKIT_PROMPTS[speckitCmd](userInput);

      let agent = agentRef;
      if (!initAgentRef.current) { setIsProcessing(false); return; }
      if (!agent) {
        try { agent = await initAgentRef.current({ skipFallback: true }); } catch { setIsProcessing(false); return; }
        if (!agent) { setIsProcessing(false); return; }
      }

      setMessages(prev => [...prev, { role: 'user', content: prompt }]);
      try {
        agent.prompt(prompt);
      } catch (e: any) {
        setMessages(prev => [...prev, { role: 'system', content: `Error: ${e.message}` }]);
      }
      setTimeout(() => setIsProcessing(false), 120000);
      return;
    }

    // Commands that don't need ctx (agent)
    const ctxFree = ['keys', 'providers', 'models', 'ollama'];
    if (ctxFree.includes(cmd)) {
      const tool = slashCommands[cmd];
      if (!tool) { setIsProcessing(false); return; }
      const argsStr = parts.slice(1).join(' ');
      const params: any = {};
      const toolParams = tool.parameters as any;
      const paramNames = Object.keys(toolParams?.properties || {});
      if (paramNames.includes('action') && paramNames.includes('provider') && paramNames.includes('key')) {
        const sp = argsStr.split(' ');
        params.action = sp[0] || 'set';
        params.provider = sp[1];
        params.key = sp.slice(2).join(' ');
      } else if (paramNames.includes('provider') && paramNames.includes('key')) {
        const sp = argsStr.split(' ');
        params.provider = sp[0];
        params.key = sp.slice(1).join(' ');
        params.action = 'set';
      } else if (paramNames.includes('action') && paramNames.includes('provider')) {
        params.action = argsStr.split(' ')[0] || 'list';
        params.provider = argsStr.split(' ')[1];
      } else if (paramNames.length === 1) { params[paramNames[0]] = argsStr; }
      try {
        const result = await (tool as any).execute('cmd', params, new AbortController().signal, () => {}, null);
        const text = result.content?.[0]?.type === 'text' ? result.content[0].text : JSON.stringify(result);
        setMessages(prev => [...prev, { role: 'assistant', content: text }]);
      } catch (e: any) { setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }]); }
      setIsProcessing(false);
      return;
    }

    if (cmd === 'use') {
      const arg = parts.slice(1).join(' ').trim();
      if (arg && pickerModels) {
        const idx = parseInt(arg) - 1;
        if (idx >= 0 && idx < pickerModels.length) {
          const m = pickerModels[idx];
          config.model = `${m.providerId}/${m.id}`;
          setPickerModels(null);
          setMessages(prev => [...prev, { role: 'assistant', content: `Switching to ${m.providerId}/${m.id}...` }]);
          try {
            await initAgentRef.current({ skipFallback: true });
            setMessages(prev => [...prev, { role: 'assistant', content: `Model set to ${m.providerId}/${m.id}` }]);
          } catch (e: any) {
            setMessages(prev => [...prev, { role: 'assistant', content: `Failed: ${e.message}` }]);
          }
          setIsProcessing(false);
          return;
        }
      }
      try {
        const models = await listAllModels();
        setPickerModels(models.map(m => ({ providerId: m.providerId, id: m.id, name: m.name })));
        const lines = models.map((m, i) => `  ${String(i + 1).padStart(2)}. ${m.providerId.padEnd(12)} ${m.id.padEnd(40)} ctx:${(m.contextWindow / 1000).toFixed(0)}k`);
        setMessages(prev => [...prev, { role: 'assistant', content: `Models (type /use <number> to select):\n${lines.join('\n')}` }]);
      } catch (e: any) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }]);
      }
      setIsProcessing(false);
      return;
    }

    if (cmd === 'model') {
      const target = parts.slice(1).join(' ');
      if (!target) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Current: ${config.model}\nUsage: /model <provider> or /model <provider/model>\nExample: /model nvidia` }]);
        setIsProcessing(false);
        return;
      }
      let finalTarget = target;
      if (!target.includes('/')) {
        const p = getProvider(target);
        if (!p) {
          setMessages(prev => [...prev, { role: 'assistant', content: `Unknown provider: ${target}` }]);
          setIsProcessing(false);
          return;
        }
        const defaultModel = p.models[0]?.id;
        if (!defaultModel) {
          setMessages(prev => [...prev, { role: 'assistant', content: `No models for provider: ${target}` }]);
          setIsProcessing(false);
          return;
        }
        finalTarget = `${p.id}/${defaultModel}`;
      }
      config.model = finalTarget;
      setMessages(prev => [...prev, { role: 'assistant', content: `Switching to ${finalTarget}...` }]);
      try {
        await initAgentRef.current({ skipFallback: true });
        setMessages(prev => [...prev, { role: 'assistant', content: `Model set to ${finalTarget}` }]);
      } catch (e: any) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Failed: ${e.message}` }]);
      }
      setIsProcessing(false);
      return;
    }

    if (!ctx) { setIsProcessing(false); return; }

    const tool = slashCommands[cmd];
    if (!tool) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Unknown command: /${cmd}. Type /help` }]);
      setIsProcessing(false);
      return;
    }

    const argsStr = parts.slice(1).join(' ');
    const params: any = {};
    const toolParams = tool.parameters as any;
    const paramNames = Object.keys(toolParams?.properties || {});
    if (paramNames.length === 1 && paramNames[0] !== 'action') {
      params[paramNames[0]] = argsStr;
    } else if (paramNames.includes('target')) {
      params.target = argsStr;
    } else if (paramNames.includes('level')) {
      params.level = argsStr || 'high';
    } else if (paramNames.includes('action') && paramNames.includes('provider') && paramNames.includes('key')) {
      const sp = argsStr.split(' ');
      params.action = sp[0] || 'set'; params.provider = sp[1]; params.key = sp.slice(2).join(' ');
    } else if (paramNames.includes('provider') && paramNames.includes('key')) {
      const sp = argsStr.split(' ');
      params.provider = sp[0]; params.key = sp.slice(1).join(' '); params.action = 'set';
    } else if (paramNames.includes('action') && paramNames.includes('provider')) {
      params.action = argsStr.split(' ')[0] || 'list'; params.provider = argsStr.split(' ')[1];
    }

    try {
      const result = await (tool as any).execute('cmd', params, new AbortController().signal, () => {}, ctx);
      const text = result.content?.[0]?.type === 'text' ? result.content[0].text : JSON.stringify(result);
      setMessages(prev => [...prev, { role: 'assistant', content: text }]);
      if (result.details?.theme) {
        setConfig(c => ({ ...c, theme: result.details.theme }));
      }
    } catch (e: any) { setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }]); }
    setIsProcessing(false);
  }, [ctx, pickerModels]);

  const handleSubmit = useCallback((text: string) => {
    if (!text.trim()) return;
    const trimmed = text.trim();
    inputRef.current = '';
    setInput('');
    setCursorPos(0);
    setHistoryIdx(-1);
    setHistory(prev => {
      const next = [...prev, trimmed];
      return next.length > 500 ? next.slice(next.length - 500) : next;
    });
    setMessages(prev => [...prev, { role: 'user', content: trimmed }]);
    setIsProcessing(true);

    if (trimmed.startsWith('/')) {
      handleSlashCommand(trimmed);
      return;
    }

    if (!agentRef) {
      const statuses = getKeyStatuses();
      const hasKeys = statuses.some(s => s.hasKey);
      if (hasKeys) {
        setMessages(prev => [...prev, { role: 'system', content: 'Keys detected. Reinitializing...' }]);
        setIsProcessing(true);
        initAgent().then((agent) => {
          if (!agent) return;
          agent.prompt(trimmed);
          setTimeout(() => setIsProcessing(false), 120000);
        });
        return;
      }
      setMessages(prev => [...prev, { role: 'assistant', content: 'No API key configured. Run: /keys set <provider> <api-key>' }]);
      setIsProcessing(false);
      return;
    }

    try {
      const isPlan = permMode === 'plan';
      const finalPrompt = isPlan ? `${trimmed}\n\n[Plan mode active. Do NOT run Write/Edit/Bash tools. Instead, explain what you WOULD do: which files to modify, what commands to run, and why. Present a plan for user approval.]` : trimmed;
      const result = agentRef.prompt(finalPrompt);
      if (result && typeof result.then === 'function') {
        result.catch((err: any) => {
          setMessages(prev => [...prev, { role: 'system', content: `Agent error: ${err.message}` }]);
          setIsProcessing(false);
        });
      }
      setTimeout(() => setIsProcessing(false), 120000);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }]);
      setIsProcessing(false);
    }
  }, [agentRef, ctx, handleSlashCommand]);
  submitRef.current = handleSubmit;

  useEffect(() => { processingRef.current = isProcessing; }, [isProcessing]);

  useInput((inputValue: string, key: any) => {
    if (confirmInfo && (inputValue === 'y' || inputValue === 'Y' || inputValue === 'n' || inputValue === 'N')) {
      resolveConfirmation(inputValue === 'y' || inputValue === 'Y');
      return;
    }

    const keyInfo = {
      ctrl: key.ctrl,
      alt: key.alt,
      shift: key.shift,
      meta: key.meta,
      key: key.name || key.key || inputValue,
    };

    const kbConfig = loadKeybindings(mergedKeybindings);

    // Check for interrupt (highest priority when processing)
    if (resolveKeybinding(keyInfo, kbConfig) === 'interrupt' && processingRef.current) {
      if (agentRef) {
        agentRef.abort();
        setIsProcessing(false);
        setMessages(prev => [...prev, { role: 'system', content: 'Interrupted.' }]);
      }
      return;
    }

    // Check for follow-up
    if (resolveKeybinding(keyInfo, kbConfig) === 'followup' && processingRef.current) {
      const current = inputRef.current;
      if (current && agentRef) {
        agentRef.followUp({ role: 'user', content: current });
        setMessages(prev => [...prev, { role: 'system', content: `Follow-up queued: ${current.slice(0, 80)}...` }]);
        inputRef.current = '';
        setInput('');
        setCursorPos(0);
      }
      return;
    }

    // Check for undo
    if (resolveKeybinding(keyInfo, kbConfig) === 'undo') {
      const cps = checkpointsRef.current;
      if (cps.length > 0) {
        const cp = cps.pop()!;
        try {
          writeFileSync(cp.path, cp.content, 'utf8');
          setMessages(prev => [...prev, { role: 'system', content: `Undid change to ${cp.path}` }]);
        } catch (e: any) {
          setMessages(prev => [...prev, { role: 'system', content: `Undo failed: ${e.message}` }]);
        }
      } else {
        setMessages(prev => [...prev, { role: 'system', content: 'Nothing to undo.' }]);
      }
      return;
    }

    // Check for permission cycle
    if (resolveKeybinding(keyInfo, kbConfig) === 'cyclePerms') {
      const modes: Array<'auto' | 'confirm' | 'plan' | 'deny'> = ['auto', 'confirm', 'plan', 'deny'];
      const idx = modes.indexOf(permMode);
      const next = modes[(idx + 1) % modes.length];
      setPermMode(next);
      config.permissions = next;
      return;
    }

    // Handle history navigation
    if (resolveKeybinding(keyInfo, kbConfig) === 'historyUp' && history.length > 0) {
      if (historyIdx === -1) savedInputRef.current = inputRef.current;
      const newIdx = Math.min(history.length - 1, historyIdx + 1);
      setHistoryIdx(newIdx);
      const val = history[history.length - 1 - newIdx];
      inputRef.current = val;
      setInput(val);
      setCursorPos(val.length);
      return;
    }

    if (resolveKeybinding(keyInfo, kbConfig) === 'historyDown') {
      if (historyIdx <= 0) {
        if (historyIdx === 0) {
          setHistoryIdx(-1);
          inputRef.current = savedInputRef.current;
          setInput(savedInputRef.current);
          setCursorPos(savedInputRef.current.length);
        }
        return;
      }
      const newIdx = historyIdx - 1;
      setHistoryIdx(newIdx);
      const val = history[history.length - 1 - newIdx];
      inputRef.current = val;
      setInput(val);
      setCursorPos(val.length);
      return;
    }

    // Handle cursor movement
    if (resolveKeybinding(keyInfo, kbConfig) === 'cursorLeft') {
      setCursorPos(prev => Math.max(0, prev - (key.ctrl ? wordLeft(inputRef.current, prev) : 1)));
      return;
    }
    if (resolveKeybinding(keyInfo, kbConfig) === 'cursorRight') {
      setCursorPos(prev => Math.min(inputRef.current.length, prev + (key.ctrl ? wordRight(inputRef.current, prev) : 1)));
      return;
    }
    if (resolveKeybinding(keyInfo, kbConfig) === 'cursorHome') {
      setCursorPos(0);
      return;
    }
    if (resolveKeybinding(keyInfo, kbConfig) === 'deleteBackward') {
      const pos = cursorPos;
      if (pos > 0) {
        inputRef.current = inputRef.current.slice(0, pos - 1) + inputRef.current.slice(pos);
        setInput(inputRef.current);
        setCursorPos(pos - 1);
      }
      return;
    }
    if (resolveKeybinding(keyInfo, kbConfig) === 'deleteForward') {
      const pos = cursorPos;
      const left = inputRef.current.slice(0, pos);
      const wordStart = left.lastIndexOf(' ');
      const newStart = wordStart === -1 ? 0 : wordStart + 1;
      inputRef.current = inputRef.current.slice(0, newStart) + inputRef.current.slice(pos);
      setInput(inputRef.current);
      setCursorPos(newStart);
      return;
    }

    // Handle Enter for submit or newline
    if (resolveKeybinding(keyInfo, kbConfig) === 'submit') {
      if ((keyInfo.shift && resolveKeybinding(keyInfo, kbConfig) === 'newline') || key.shift) {
        const pos = cursorPos;
        inputRef.current = inputRef.current.slice(0, pos) + '\n' + inputRef.current.slice(pos);
        setInput(inputRef.current);
        setCursorPos(pos + 1);
      } else if (!processingRef.current) {
        const current = inputRef.current;
        if (current) submitRef.current(current);
      }
      return;
    }

    // Autocomplete
    if (resolveKeybinding(keyInfo, kbConfig) === 'complete') {
      const current = inputRef.current;
      if (current.startsWith('/')) {
        const allCommands = ['/plan', '/task', '/clear', '/more', '/exit', '/help', '/use', '/model', '/keys', '/providers', '/models', '/ollama', '/fork', '/tree', '/cost', '/compact', '/status', '/effort', '/rename', '/context', '/init', '/resume', '/export', '/skill', '/replay', '/speckit.constitution', '/speckit.specify', '/speckit.clarify', '/speckit.plan', '/speckit.tasks', '/speckit.implement', '/speckit.converge'];
        const matches = allCommands.filter(c => c.startsWith(current.toLowerCase()));
        if (matches.length === 1) {
          inputRef.current = matches[0];
          setInput(matches[0]);
          setCursorPos(matches[0].length);
        } else if (matches.length > 1) {
          const common = matches[0];
          let prefix = '';
          for (let i = 0; i < common.length; i++) {
            if (matches.every(m => m[i] === common[i])) prefix += common[i];
            else break;
          }
          if (prefix.length > current.length) {
            inputRef.current = prefix;
            setInput(prefix);
            setCursorPos(prefix.length);
          }
        }
      } else if (current.includes('@')) {
        const atIdx = current.lastIndexOf('@');
        const partial = current.slice(atIdx + 1).split(/[\s()]+/)[0];
        try {
          const searchDir = partial.includes('/') ? partial.substring(0, partial.lastIndexOf('/')) || '.' : '.';
          const prefix = partial.includes('/') ? partial.split('/').pop() || '' : partial;
          const absDir = resolve(process.cwd(), searchDir);
          const entries = readdirSync(absDir, { withFileTypes: true }).filter(e => e.name.startsWith(prefix)).slice(0, 20);
          if (entries.length === 1) {
            const match = entries[0];
            const rel = relative(process.cwd(), join(absDir, match.name)).replace(/\\/g, '/');
            const replacement = match.isDirectory() ? `@${rel}/` : `@${rel} `;
            inputRef.current = current.slice(0, atIdx) + replacement;
            setInput(inputRef.current);
            setCursorPos(atIdx + replacement.length);
          }
        } catch { /* ponytail: @-completion file listing best-effort */ }
      }
      return;
    }

    // Regular character input
if (inputValue && inputValue !== '\x7f' && inputValue !== '\b') {
      if (inputRef.current.length >= MAX_INPUT_CHARS) return;
      const pos = cursorPos;
      inputRef.current = inputRef.current.slice(0, pos) + inputValue + inputRef.current.slice(pos);
      setInput(inputRef.current);
      setCursorPos(pos + inputValue.length);
    }
  });

  return (
    <Box flexDirection="column" height="100%">
      {pickerMode === 'session' && (
        <SessionPicker
          sessions={pickerSessions}
          onSelect={async (sessionId) => {
            setPickerMode(null);
            setMessages([]);
            const sm = new SessionManager(config.session.dir);
            const session = sm.load(sessionId);
            if (session) {
              try {
                const { agent, resolved, session: sess, mcpErrors } = await createZorAgent(config, session);
                setAgentRef(agent);
                setModel(resolved.provider.id + '/' + resolved.model.id);
                setCtx({ agent, config, sessionManager: sm, session: sess });
                if (mcpErrors.length > 0) setMessages(prev => [...prev, { role: 'system', content: `MCP warnings:\n${mcpErrors.join('\n')}` }]);
                agent.subscribe((event: any) => {
                  try {
                    switch (event.type) {
                      case 'message_update':
                        if (event.assistantMessageEvent?.type === 'text_delta') {
                          setMessages(prev => {
                            const last = prev[prev.length - 1];
                            if (last && last.role === 'assistant') return [...prev.slice(0, -1), { ...last, content: last.content + event.assistantMessageEvent.delta }];
                            return [...prev, { role: 'assistant', content: event.assistantMessageEvent.delta }];
                          });
                        }
                        break;
                      case 'message_end':
                        if (event.message?.stopReason === 'error') {
                          setMessages(prev => [...prev, { role: 'system', content: `Error: ${event.message.errorMessage || 'Unknown API error'}` }]);
                        }
                        break;
                      case 'agent_end':
                        setIsProcessing(false);
                        break;
                    }
                  } catch (e: any) { logger.error('Event handler error', { error: e.message }); }
                });
                setMessages(prev => [...prev,
                  { role: 'system', content: `Resumed session ${sessionId.slice(-12)} (${session.messages.length} messages)` }]);
              } catch (e: any) {
                setMessages([{ role: 'system', content: `Failed to resume: ${e.message}` }]);
              }
            }
          }}
          onCancel={() => setPickerMode(null)}
        />
      )}
      {!pickerMode && (<>
      <Box flexDirection="column" flexGrow={1} padding={1}>
        <StartupHeader />
        {messages.length > visibleCount && (
          <Text color={theme.textMuted}>{messages.length - visibleCount} more messages hidden. /more to show</Text>
        )}
        {messages.slice(Math.max(0, messages.length - visibleCount)).map((msg, i) => (
          <Box key={i} marginBottom={1}>
            <Text color={
              msg.role === 'user' ? theme.userMsg :
              msg.role === 'assistant' ? theme.assistantMsg :
              msg.role === 'tool' ? theme.toolMsg :
              msg.role === 'tool_result' ? theme.toolResultMsg : theme.systemMsg
            }>
              {msg.role === 'user' ? '>' : msg.role === 'assistant' ? '●' : msg.role === 'tool' ? '⚡' : '!'}{' '}
            </Text>
            {(msg.role === 'assistant' || msg.role === 'tool_result') ? (
              <MessageContent content={msg.content} />
            ) : (
              <Text>{msg.content}</Text>
            )}
          </Box>
        ))}
        {isProcessing && <Text color={theme.textMuted}>▋</Text>}
      </Box>
      {input.startsWith('/') && input.length <= 15 && !input.includes(' ') && (
        <Box flexDirection="column" marginBottom={1} paddingLeft={3}>
          {['/plan', '/task', '/clear', '/more', '/exit', '/help', '/use', '/model', '/keys', '/providers', '/models', '/ollama', '/fork', '/tree', '/cost', '/compact', '/status', '/effort', '/rename', '/context', '/init', '/resume', '/speckit.constitution', '/speckit.specify', '/speckit.clarify', '/speckit.plan', '/speckit.tasks', '/speckit.implement', '/speckit.converge']
            .filter(c => c.startsWith(input.toLowerCase()))
            .slice(0, 10)
            .map((cmd, i) => (
              <Text key={i} color={theme.primary}>{cmd}</Text>
            ))}
        </Box>
      )}
{confirmInfo && (
        <Box borderStyle="single" borderColor={theme.primary} paddingX={1} marginBottom={1}>
          <Box flexDirection="column">
            <Text color={theme.primary} bold> Confirm tool execution</Text>
            <Text color={theme.toolMsg}>  Tool: {confirmInfo.toolName}</Text>
            {confirmInfo.args && <Text color={theme.textMuted}>  {JSON.stringify(confirmInfo.args).slice(0, 200)}</Text>}
            <Text color={theme.textMuted}>  Approve? (y/n) </Text>
          </Box>
        </Box>
        )}
        {config.statusBar?.enabled !== false && (
          <StatusBar
            sessionName={sessionName}
            model={model}
            effort={effort}
            permMode={permMode}
            isProcessing={isProcessing}
            config={config}
            theme={theme}
            tokenEstimate={tokenEstimate}
            compactThreshold={config.session?.compactThreshold || 160000}
            mcpConnected={!!ctx?.mcpClient?.servers?.size}
            gitBranch={gitBranch}
          />
        )}
        {!config.statusBar?.enabled && (
          <Box borderStyle="single" borderColor={theme.border} padding={1}>
            <Box flexDirection="column">
              {input.split('\n').map((line, li, arr) => (
                <Box key={li} flexDirection="row">
                  <Text color={theme.primary}>{li === 0 ? '› ' : '  '}</Text>
                  <Text>{line || (input.length === 0 && li === 0 ? <Text color={theme.textMuted}>Type a task... (/help)</Text> : '')}</Text>
                  {li === arr.length - 1 && <Text color={theme.textMuted}>█</Text>}
                </Box>
              ))}
              {!input && <Box flexDirection="row"><Text color={theme.primary}>› </Text><Text color={theme.textMuted}>Type a task... (/help)</Text><Text color={theme.textMuted}>█</Text></Box>}
            </Box>
            <Text color={theme.textMuted}>{sessionName ? `[${sessionName}] ` : ''}{model} | effort:{effort} | [{permMode}]{input.includes('\n') ? ' [MULTI]' : ''} Shift+Tab cycle | Shift+Enter newline | Enter=interrupt | Alt+Enter=follow-up</Text>
          </Box>
        )}
      </>)}
    </Box>
  );
}

async function bootstrapInteractive() {
  const config = loadConfig();

  configureLogger({
    level: config.logging?.level,
    sinks: config.logging?.sinks,
    file: config.logging?.file,
  });

  let existingSession: SessionData | undefined;
  const args = process.argv.slice(2);
  const cliArg = args.find(a => !a.startsWith('--')) || '';
  const continueFlag = args.includes('--continue') || args.includes('-c');
  const resumeIdx = args.indexOf('--resume');
  const resumeFlag = resumeIdx !== -1 || args.includes('-r');
  const resumeTarget = resumeIdx !== -1 ? args[resumeIdx + 1] : undefined;

  const sessionManager = new SessionManager(config.session.dir);

  if (continueFlag) {
    const latest = sessionManager.getLatest();
    if (latest) {
      existingSession = latest;
      config.model = config.model; // keep config model, agent will use session context
    } else {
      console.error('No previous session found to continue.');
      process.exit(1);
    }
  } else if (resumeFlag && resumeTarget) {
    const session = sessionManager.load(resumeTarget) || sessionManager.list().find(s => s.id.includes(resumeTarget));
    if (session) {
      existingSession = session;
    } else {
      console.error(`Session not found: ${resumeTarget}`);
      process.exit(1);
    }
  } else if (resumeFlag) {
    const sessions = sessionManager.list();
    if (sessions.length === 0) {
      console.error('No previous sessions found.');
      process.exit(1);
    }
    console.error('Recent sessions:');
    sessions.slice(0, 10).forEach((s, i) => {
      console.error(`  ${String(i + 1).padStart(2)}. ${s.id.slice(-12)} [${new Date(s.updatedAt).toLocaleString()}]`);
    });
    console.error('Use --resume <id> to pick one.');
    process.exit(1);
  }

  if (cliArg && cliArg.includes('/')) {
    config.model = cliArg;
  } else if (!existingSession) {
    const last = loadLastSession();
    if (last) {
      config.model = `${last.provider}/${last.model}`;
    } else {
      await pickProviderFromKeys(config);
    }
  }

  let provider = getProvider(config.model.split('/')[0]);
  while (!provider) {
    await pickNewProvider(config);
    provider = getProvider(config.model.split('/')[0]);
  }

  await ensureKeyForProvider(config);
  checkUpdate();

  // Initialize sandbox
  setSandboxConfig(config.sandbox);

  // Load extensions via ExtensionHost (registers all contributions into registries)
  const builtInContributions: ExtensionContribution = {
    tools: [], commands: [], overlays: [], themes: [],
    skills: [], providers: [], keybindings: [],
  };
  const extensionHost = await createExtensionHost(
    builtInContributions,
    config.keybindings?.path || '~/.zor/extensions'
  );
  const extensionRegistries = extensionHost.getRegistries();

  render(
    <ThemeProvider config={config}>
      <App initialConfig={config} existingSession={existingSession} extensionRegistries={extensionRegistries} />
    </ThemeProvider>
  );
  if (process.stdin.isTTY) {
    try { process.stdin.setRawMode(true); } catch { /* ponytail: non-critical on Windows */ }
  }
}

async function checkUpdate() {
  try {
    const res = await fetch('https://api.github.com/repos/zor-ai/zor/releases/latest', {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return;
    const data: any = await res.json();
    const latest = data.tag_name?.replace('v', '').split('.').map(Number) || [];
    const current = VERSION.split('.').map(Number);
    if (latest[0] > current[0] || (latest[0] === current[0] && latest[1] > current[1]) ||
        (latest[0] === current[0] && latest[1] === current[1] && latest[2] > current[2])) {
      console.error(`\n  Zor v${data.tag_name} available (current: v${VERSION})\n  Update: curl -fsSL https://raw.githubusercontent.com/zor-ai/zor/main/install.sh | sh\n`);
    }
  } catch { /* ponytail: update check is best-effort, no network = no warning */ }
}
 
if (process.argv.includes('--rpc')) {
  const { runRpc } = await import('./rpc');
  await runRpc();
  process.exit(0);
}
 
if (IS_PIPED) {
  const chunks: string[] = [];
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => chunks.push(chunk));
  process.stdin.on('end', async () => {
    const input = chunks.join('').trim();
    if (!input) process.exit(0);
    const config = loadConfig();

    const cliArg = process.argv[2];
    if (cliArg && cliArg.includes('/')) {
      config.model = cliArg;
    } else {
      const last = loadLastSession();
      if (last) {
        config.model = `${last.provider}/${last.model}`;
      } else {
        const statuses = getKeyStatuses().filter(s => s.hasKey && s.provider !== 'ollama');
        if (statuses.length === 1) {
          const p = getProvider(statuses[0].provider);
          if (p && p.models[0]) config.model = `${p.id}/${p.models[0].id}`;
        }
      }
    }

    const providerId = config.model.split('/')[0];
    const provider = getProvider(providerId);
    const hasKey = provider && (provider.api === 'ollama' || !!resolveKey(provider));
    if (!hasKey) {
      console.error(`No API key for ${provider ? provider.name : providerId}. Run: zor-code keys set ${providerId} <your-key>`);
      process.exit(1);
    }
    try {
      const { agent, resolved } = await createZorAgent(config);
      console.error(`Using: ${resolved.provider.id}/${resolved.model.id}`);
      saveLastSession(resolved.provider.id, resolved.model.id);

      let responseText = '';
      agent.subscribe((event: any) => {
        if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
          process.stdout.write(event.assistantMessageEvent.delta);
          responseText += event.assistantMessageEvent.delta;
        }
        if (event.type === 'message_end' && event.message?.stopReason === 'error') {
          console.error(`\nAPI Error: ${event.message.errorMessage || 'unknown'}`);
        }
      });

      await agent.prompt(input);
      if (!responseText) console.error('(no response)');
    } catch (e: any) {
      console.error('Error:', e.message);
    }
    process.exit(0);
  });
} else {
  bootstrapInteractive();
}
