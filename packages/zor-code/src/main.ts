import { loadConfig, ZorConfig, VERSION } from './config';
import { runRpc } from './rpc';
import { getKeyStatuses, resolveKey } from './llm/keys';
import { getProvider } from './llm/providers';
import { loadLastSession, saveLastSession } from './llm/session-state';
import { configureLogger } from './utils/logger';
import { SessionManager, SessionData } from './session/manager';
import { createZorAgent } from './agent/create';
import { createInterface } from 'readline';
import { TuiApp } from './tui/app';
import { setSandboxConfig } from './agent/sandbox';
import { resolveProjectDir, setProjectRoot } from './project';

function promptProjectDir(defaultDir: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`Working folder [${defaultDir}]: `, (ans) => {
      rl.close();
      resolve(ans.trim() || defaultDir);
    });
  });
}

const IS_PIPED = !process.stdin.isTTY;
const IS_RPC = process.argv.includes('--rpc');

// ─── RPC mode ──────────────────────────────────────────────────────────────

if (IS_RPC) {
  (async () => {
    await runRpc();
  })();
  process.exit(0);
}

// ─── CLI flags ─────────────────────────────────────────────────────────────

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
  zor-code --rpc                 JSON-RPC mode
  echo "task" | zor-code         Piped input mode
  zor-code --version / -v        Show version
  zor-code --help / -h           Show help

Slash commands (inside TUI):
  /model <p>/<m>  Switch model
  /use             Browse all models
  /keys            Manage API keys
  /effort <level>  Set thinking effort
  /compact         Force context compaction
  /cost            Show pricing
  /status          Session stats
  /resume           Browse sessions
  /more             Show 200 more messages
  /clear           Clear screen
  /help            Show commands
  /exit             Exit Zor

Shortcuts:
  Enter:send  Esc:abort  Ctrl+P:cycle perms  Shift+Enter:newline`);
  process.exit(0);
}

// ─── Piped mode ────────────────────────────────────────────────────────────

if (IS_PIPED) {
  const chunks: string[] = [];
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => chunks.push(chunk));
  process.stdin.on('end', async () => {
    const input = chunks.join('').trim();
    if (!input) process.exit(0);
    const config = loadConfig();

    const { dir: projectDir } = await resolveProjectDir(); // no prompt in piped mode
    setProjectRoot(projectDir);

    const cliArg = process.argv[2];
    if (cliArg && cliArg.includes('/')) config.model = cliArg;
    else {
      const last = loadLastSession();
      if (last) config.model = `${last.provider}/${last.model}`;
      else {
        const statuses = getKeyStatuses().filter(s => s.hasKey && s.provider !== 'ollama');
        if (statuses.length === 1) {
          const p = getProvider(statuses[0].provider);
          if (p?.models[0]) config.model = safeModelId(p.id, p.models[0].id);
        }
      }
    }

    const providerId = config.model.split('/')[0];
    const provider = getProvider(providerId);
    let hasKey = provider && (provider.api === 'ollama' || !!resolveKey(provider));
    if (!hasKey) {
      const statuses = getKeyStatuses().filter(s => s.hasKey && s.provider !== 'ollama');
      if (statuses.length > 0) {
        const p = getProvider(statuses[0].provider);
        if (p?.models[0]) config.model = safeModelId(p.id, p.models[0].id);
        hasKey = true;
      }
    }
    if (!hasKey) {
      console.error('No API key configured. Run: zor-code keys set <provider> <your-key>');
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
}

// ─── Interactive mode (pi-tui) ────────────────────────────────────────────
else {
  bootstrapInteractive().catch((e: any) => {
    console.error('TUI error:', e?.message);
    process.exit(1);
  });
}

async function bootstrapInteractive() {
  const config = loadConfig();

  const { dir: projectDir } = await resolveProjectDir({ prompt: promptProjectDir });
  setProjectRoot(projectDir);

  configureLogger({
    level: config.logging?.level,
    sinks: config.logging?.sinks,
    file: config.logging?.file,
  });

  // CLI args
  const args = process.argv.slice(2);
  const cliArg = args.find(a => !a.startsWith('--')) || '';
  const continueFlag = args.includes('--continue') || args.includes('-c');
  const resumeIdx = args.indexOf('--resume');
  const resumeFlag = resumeIdx !== -1 || args.includes('-r');
  const resumeTarget = resumeIdx !== -1 ? args[resumeIdx + 1] : undefined;

  // Session resume/continue
  const sessionManager = new SessionManager(config.session.dir);
  let existingSession: SessionData | undefined;

  if (continueFlag) {
    const latest = sessionManager.getLatest();
    if (latest) {
      existingSession = latest;
    } else {
      console.error('No previous session found. Starting fresh...');
    }
  } else if (resumeFlag && resumeTarget) {
    const session = sessionManager.load(resumeTarget) ||
      sessionManager.list().find(s => s.id.includes(resumeTarget));
    if (session) {
      existingSession = session;
    } else {
      console.error(`Session not found: ${resumeTarget}. Starting fresh...`);
    }
  } else if (resumeFlag) {
    const sessions = sessionManager.list();
    if (sessions.length === 0) {
      console.error('No previous sessions found. Starting fresh...');
    } else {
      console.error('Recent sessions:');
      sessions.slice(0, 10).forEach((s, i) => {
        console.error(`  ${String(i + 1).padStart(2)}. ${s.id.slice(-12)} [${new Date(s.updatedAt).toLocaleString()}]`);
      });
      console.error('Use --resume <id> or /resume from inside TUI.');
    }
  }

  // Model resolution
  if (cliArg && cliArg.includes('/')) {
    config.model = cliArg;
  } else if (!existingSession) {
    const last = loadLastSession();
    if (last) {
      config.model = safeModelId(last.provider, last.model);
    }
  }

  // Sandbox
  setSandboxConfig(config.sandbox || { enabled: false });

  // Launch pi-tui
  const app = new TuiApp(config, existingSession);
  process.on('SIGINT', () => app.stop());
  process.on('SIGTERM', () => app.stop());
  app.start().catch((e: any) => {
    console.error('TUI error:', e.message);
    process.exit(1);
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function safeModelId(providerId: string, modelId: string): string {
  return modelId.startsWith(`${providerId}/`) ? modelId : `${providerId}/${modelId}`;
}
