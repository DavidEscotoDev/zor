import {
  TUI, Container, Text, Editor, Markdown,
  type Component, type EditorTheme, type MarkdownTheme,
  matchesKey,
} from '@earendil-works/pi-tui';
import { ProcessTerminal } from '@earendil-works/pi-tui';
import { ZorConfig, VERSION } from '../config';
import { createZorAgent } from '../agent/create';
import { getKeyStatuses, setKey, listKeys, getKey, getKeySource } from '../llm/keys';
import { getProvider } from '../llm/providers';
import { saveLastSession, loadLastSession } from '../llm/session-state';
import { countMessagesTokens } from '../utils/tokens';
import { SessionData, SessionManager } from '../session/manager';
import { setConfirmationCallback, resolveConfirmation, getPendingConfirmation } from '../permissions/confirm';
import { listAllModels } from '../llm/resolve';
import { showPicker, showConfirm } from './components/picker';
import { showCommandPalette, type Command } from './components/command-palette';

// ─── ANSI helpers ───────────────────────────────────────────────────────────

const ESC = '\x1b[';
const F = (n: number) => (s: string) => `${ESC}${n}m${s}${ESC}0m`;

const c = {
  text:       F(37),
  primary:    F(36),
  purple:     (s: string) => `\x1b[38;5;135m${s}\x1b[0m`, // medium violet (color code 135)
  success:    F(32),
  warning:    F(33),
  error:      F(31),
  muted:      F(90),
  bold:       F(1),
  dim:        F(2),
  italic:     F(3),
  border:     F(90),
  user:       F(36),   // cyan for user
  assistant:  F(37),   // white for assistant
  tool:       F(33),   // yellow for tool
  system:     F(31),   // red for system
};

// ─── Themes ────────────────────────────────────────────────────────────────

const editTheme: EditorTheme = {
  borderColor: c.border,
  selectList: {} as any,
};

const mdTheme: MarkdownTheme = {
  heading:    c.bold,
  link:       c.primary,
  linkUrl:    c.muted,
  code:       c.warning,
  codeBlock:  c.text,
  codeBlockBorder: c.border,
  quote:      c.muted,
  quoteBorder: c.border,
  hr:         c.border,
  listBullet: c.primary,
  bold:       c.bold,
  italic:     c.italic,
  strikethrough: (s: string) => `${ESC}9m${s}${ESC}0m`,
  underline:  (s: string) => `${ESC}4m${s}${ESC}0m`,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function safeModelId(providerId: string, modelId: string): string {
  return modelId.startsWith(`${providerId}/`) ? modelId : `${providerId}/${modelId}`;
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[\d+(;\d+)*m/g, '');
}

interface AgentHandle {
  agent: any;
  resolved: { provider: { id: string; name: string }; model: { id: string; name: string } };
  sessionManager: any;
  session: any;
  mcpErrors: string[];
}

// ─── TuiApp ────────────────────────────────────────────────────────────────

export class TuiApp {
  ui: TUI;
  config: ZorConfig;

  private headerLine = new Text('', 1, 1);
  private chatBox = new Container();
  private statusLine = new Text('', 1, 0);
  private spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private spinnerIdx = 0;
  private commandPaletteOpen = false;

  editor!: Editor;
  private agentRef: AgentHandle | null = null;
  private messages: Array<{ role: string; content: string }> = [];
  private isProcessing = false;
  private chatDirty = true;
  private tokenEstimate = 0;
  private gitBranch = '';
  private visibleCount = 200; // /more increases this
  private messageCount = 0;   // track for token updates

  constructor(config: ZorConfig, private existingSession?: SessionData) {
    this.config = config;
    this.ui = new TUI(new ProcessTerminal());
  }

  // ─── Layout ─────────────────────────────────────────────────────────────

  private buildLayout() {
    this.ui.clear();

    this.headerLine.render = (w: number) => this.renderHeader(w);
    this.ui.addChild(this.headerLine);
    this.ui.addChild(this.chatBox);

    this.statusLine.render = (w: number) => this.renderStatusBar(w);
    this.ui.addChild(this.statusLine);

    this.editor = new Editor(this.ui, editTheme, { paddingX: 1 });
    this.editor.borderColor = c.primary;
    this.editor.onSubmit = (text: string) => {
      if (text.trim()) this.handleSubmit(text.trim());
    };
    this.editor.onChange = (text: string) => {
      if (text === '/' && !this.commandPaletteOpen) {
        this.commandPaletteOpen = true;
        this.showCommandPalette();
      }
    };
    this.ui.addChild(this.editor);

    // Global input listener for special keys
    this.ui.addInputListener((data: string) => {
      if (matchesKey(data, 'escape') && this.isProcessing) {
        this.abort();
        return { consume: true };
      }
      if (matchesKey(data, 'alt+enter') && this.isProcessing) {
        const text = this.editor.getText();
        if (text && this.agentRef?.agent?.followUp) {
          try { this.agentRef.agent.followUp({ role: 'user', content: text }); } catch {/* noop */}
          this.addSystem(`Queued: ${text.slice(0, 80)}`);
          this.editor.setText('');
        }
        return { consume: true };
      }
      // Ctrl+P = cycle permissions
      if (matchesKey(data, 'ctrl+p') && !this.isProcessing) {
        this.cyclePerms();
        return { consume: true };
      }
      return undefined;
    });
  }

  // ─── Header & Status ────────────────────────────────────────────────────

  private renderHeader(w: number): string[] {
    const cwd = process.cwd().split(/[\\/]/).slice(-2).join('/');
    const pu = c.purple;

    // Thick diagonal Z (full top bar → ███ diagonal → full bottom bar)
    const logo = [
      pu('███████╗  ██████╗  ██████╗      ██████╗  ██████╗  ██████╗  ███████╗'),
      pu('╚══███╔╝ ██╔═══██╗ ██╔══██╗    ██╔════╝ ██╔═══██╗ ██╔══██╗ ██╔════╝'),
      pu('  ███╔╝  ██║   ██║ ██████╔╝    ██║      ██║   ██║ ██║  ██║ █████╗  '),
      pu(' ███╔╝   ██║   ██║ ██╔══██╗    ██║      ██║   ██║ ██║  ██║ ██╔══╝  '),
      pu('███████╗ ╚██████╔╝ ██║  ██║    ╚██████╗ ╚██████╔╝ ██████╔╝ ███████╗'),
      pu('╚══════╝  ╚═════╝  ╚═╝  ╚═╝     ╚═════╝  ╚═════╝  ╚═════╝  ╚══════╝'),
    ];

    const tagline = c.muted(`v${VERSION}  ·  multi-agent AI coding terminal  ·  ${cwd}`);

    const lines: string[] = [];
    lines.push('');
    for (const line of logo) lines.push('  ' + line);
    lines.push('');
    lines.push('  ' + tagline);
    lines.push('');
    return lines;
  }

  private renderStatusBar(w: number): string[] {
    if (this.messages.length === 0 && !this.agentRef) {
      return [c.dim(' Type a message or /help for commands. Set a key with /keys set <provider> <key>')];
    }
    if (!this.agentRef) {
      return [` ${c.warning('No key — use /keys set <provider> <key>')}`];
    }

    const m = this.agentRef.resolved;
    const modelStr = safeModelId(m.provider.id, m.model.id);
    
    // Reserve space for other status bar elements
    const right = ` ${c.dim('Enter:send  │  Esc:abort  │  Ctrl+P:perm  │  /help')}`;
    const vr = stripAnsi(right).length;
    const minLeftWidth = 10;
    const availableForModel = Math.max(minLeftWidth, w - vr - 25); // reserve for middle + padding
    const truncatedModel = modelStr.length > availableForModel 
      ? modelStr.slice(0, availableForModel - 1) + '…'
      : modelStr;
    const left = ` ${c.primary(c.bold('❯'))} ${truncatedModel}`;

    const threshold = this.config.session?.compactThreshold || 50000;
    const ctxPct = Math.round((this.tokenEstimate / threshold) * 100);
    const ctxColor = ctxPct > 80 ? c.error : ctxPct > 60 ? c.warning : c.success;
    const middle = `  ${c.dim('ctx:')}${ctxColor(`${ctxPct}%`)}  ${c.dim('perm:')}${c.bold(this.config.permissions)}`;

    if (this.isProcessing) {
      const frame = this.spinnerFrames[this.spinnerIdx % this.spinnerFrames.length];
      return [`${left}${middle}  ${c.warning(`${frame} ...`)}`];
    }

    const vl = stripAnsi(left).length;
    const vm = stripAnsi(middle).length;
    const pad = Math.max(1, w - vl - vm - vr);
    return [`${left}${middle}${' '.repeat(pad)}${right}`];
  }

  // ─── Perms ──────────────────────────────────────────────────────────────

  private cyclePerms() {
    const modes: Array<'auto' | 'confirm' | 'plan' | 'deny'> = ['auto', 'confirm', 'plan', 'deny'];
    const idx = modes.indexOf(this.config.permissions as any);
    this.config.permissions = modes[(idx + 1) % modes.length];
    this.ui.requestRender();
  }

  // ─── Agent ──────────────────────────────────────────────────────────────

  async initAgent(opts?: { skipFallback?: boolean }): Promise<AgentHandle | null> {
    const statuses = getKeyStatuses();
    const configured = statuses.filter(s => s.hasKey);
    if (configured.length === 0) {
      this.addSystem(c.error('No API key configured. Use: /keys set <provider> <key>'));
      return null;
    }

    // Provider fallback: if current model's provider has no key, use first available
    const defaultProvider = this.config.model.split('/')[0];
    const hasDefaultKey = configured.some(s => s.provider === defaultProvider);
    if (!hasDefaultKey && !opts?.skipFallback) {
      const fb = configured[0];
      const fbProvider = getProvider(fb.provider);
      if (fbProvider?.models[0]) {
        this.config.model = safeModelId(fbProvider.id, fbProvider.models[0].id);
        this.addSystem(`Switched to ${c.primary(this.config.model)} (${defaultProvider} has no key)`);
      }
    } else if (!hasDefaultKey && opts?.skipFallback) {
      this.addSystem(`No API key for ${defaultProvider}. Set: /keys set ${defaultProvider} <key>`);
      return null;
    }

    try {
      const { agent, resolved, sessionManager, session, mcpErrors } =
        await createZorAgent(this.config, this.existingSession);
      this.existingSession = undefined; // only used once on init

      const h: AgentHandle = { agent, resolved, sessionManager, session, mcpErrors };
      this.agentRef = h;
      saveLastSession(resolved.provider.id, resolved.model.id);

      if (mcpErrors.length > 0)
        this.addSystem(c.warning(`MCP: ${mcpErrors.join(', ')}`));

      agent.subscribe((e: any) => {
        try { this.handleAgentEvent(e); } catch { /* best-effort */ }
      });

      return h;
    } catch (e: any) {
      this.addSystem(c.error(`Init failed: ${e.message}. Use /keys to check keys.`));
      return null;
    }
  }

  // ─── Event handling ─────────────────────────────────────────────────────

  private handleAgentEvent(event: any) {
    switch (event.type) {
      case 'message_update':
        if (event.assistantMessageEvent?.type === 'text_delta') {
          const delta = event.assistantMessageEvent.delta;
          const last = this.messages[this.messages.length - 1];
          if (last?.role === 'assistant') last.content += delta;
          else this.messages.push({ role: 'assistant', content: delta });
          this.chatDirty = true;
        }
        break;

      case 'tool_execution_start': {
        const args = event.args || {};
        let label = `[${event.toolName}]`;
        if (args.command) label += ` ${args.command.slice(0, 60)}`;
        else if (args.filepath) label += ` ${args.filepath}`;
        else if (args.pattern) label += ` ${args.pattern}`;
        else if (args.path) label += ` ${args.path}`;
        else label += ` ${Object.keys(args).join(', ')}`;
        this.messages.push({ role: 'tool', content: label });
        this.chatDirty = true;
        break;
      }

      case 'tool_execution_update':
        if (event.partialResult?.content) {
          const text = event.partialResult.content
            .map((c: any) => c.text || '').join('');
          if (text) {
            const last = this.messages[this.messages.length - 1];
            if (last?.role === 'tool') last.content += text;
            else this.messages.push({ role: 'tool', content: text });
            this.chatDirty = true;
          }
        }
        break;

      case 'tool_execution_end':
        this.chatDirty = true;
        break;

      case 'turn_end':
        if (event.message && this.agentRef) {
          try {
            const agentMsgs = this.agentRef.agent.state.messages;
            const seen = new Set(
              this.messages.map(m => `${m.role}:${m.content.slice(0, 60)}`)
            );
            for (const m of agentMsgs) {
              // Skip user messages - already added via handleSubmit
              if (m.role === 'user') continue;
              let content: string;
              if (Array.isArray((m as any).content)) {
                // Extract text from structured content (thinking + text parts)
                content = (m as any).content
                  .filter((p: any) => p.type === 'text')
                  .map((p: any) => p.text)
                  .join('\n');
              } else {
                content = typeof (m as any).content === 'string' ? (m as any).content : JSON.stringify((m as any).content);
              }
              // Skip assistant text messages (already handled by text_delta)
              if (m.role === 'assistant' && typeof (m as any).content === 'string' && !content.startsWith('[')) continue;
              const key = `${m.role || 'system'}:${content.slice(0, 60)}`;
              if (!seen.has(key)) {
                this.messages.push({
                  role: m.role || 'system',
                  content: content.slice(0, 4000),
                });
              }
            }
            this.messageCount = this.messages.length;
            this.chatDirty = true;
          } catch { /* best-effort */ }
        }
        break;

      case 'agent_end':
        this.isProcessing = false;
        if (event.messages?.length) {
          const last = event.messages[event.messages.length - 1];
          if (last?.stopReason === 'error' && last.errorMessage)
            this.addSystem(`API Error: ${last.errorMessage}`);
        }
        this.updateTokens();
        this.chatDirty = true;
        break;

      case 'message_end':
        if (event.message?.stopReason === 'error') {
          this.addSystem(`Error: ${event.message.errorMessage || 'Unknown API error'}`);
        }
        break;
    }
    this.ui.requestRender();
  }

  private abort() {
    if (!this.isProcessing || !this.agentRef) return;
    try { this.agentRef.agent.abort?.(); } catch {/* noop */}
    this.isProcessing = false;
    this.addSystem('Interrupted.');
  }

  private updateTokens() {
    try {
      if (this.agentRef?.agent?.state?.messages) {
        this.tokenEstimate = countMessagesTokens(this.agentRef.agent.state.messages);
      }
    } catch { /* best-effort */ }
  }

  // ─── Messages ───────────────────────────────────────────────────────────

  private addSystem(text: string) {
    this.messages.push({ role: 'system', content: text });
    this.chatDirty = true;
    this.ui.requestRender();
  }

  private ensureChatRendered(w: number) {
    if (!this.chatDirty) return;
    this.chatDirty = false;

    this.chatBox.clear();
    const visible = this.messages.slice(-this.visibleCount);
    const wrapW = Math.max(30, w - 2);

    // Older messages hint
    if (this.messages.length > this.visibleCount) {
      this.chatBox.addChild(new Text(
        c.dim(` ... ${this.messages.length - this.visibleCount} older messages hidden. Use /more to show.`),
        2, 0
      ));
    }

    for (const msg of visible) {
      this.renderMessage(msg, wrapW);
    }
  }

  private renderMessage(msg: { role: string; content: string }, w: number) {
    const maxW = Math.max(30, w - 4); // leave some margin

    switch (msg.role) {
      case 'user':
        this.chatBox.addChild(new Text('', 0, 0));
        this.chatBox.addChild(
          new Text(`${c.user(c.bold('▸'))} ${c.user(msg.content.slice(0, maxW))}`, 1, 0)
        );
        break;

      case 'assistant': {
        try {
          const md = new Markdown(msg.content, 1, 0, mdTheme);
          const wrapper = new Container();
          wrapper.addChild(md);
          const orig = wrapper.render.bind(wrapper);
          wrapper.render = (width: number) => {
            const lines = orig(Math.min(width, maxW));
            if (lines.length > 0) lines[0] = `${c.primary(c.bold('●'))} ${lines[0]}`;
            for (let i = 1; i < lines.length; i++) lines[i] = `  ${lines[i]}`;
            return lines;
          };
          this.chatBox.addChild(wrapper);
        } catch {
          this.chatBox.addChild(
            new Text(`${c.primary(c.bold('●'))} ${c.text(msg.content.slice(0, maxW))}`, 1, 0)
          );
        }
        this.chatBox.addChild(new Text('', 0, 0));
        break;
      }

      case 'tool':
        this.chatBox.addChild(new Text('', 0, 0));
        this.chatBox.addChild(
          new Text(`${c.tool('■')} ${c.tool(msg.content.slice(0, maxW))}`, 1, 0)
        );
        break;

      case 'system':
      case 'tool_result':
      default:
        this.chatBox.addChild(new Text('', 0, 0));
        for (const line of msg.content.split('\n')) {
          this.chatBox.addChild(new Text(`${c.system('!')} ${c.dim(line.slice(0, maxW))}`, 1, 0));
        }
    }
  }

  // ─── Submit ─────────────────────────────────────────────────────────────

  private async handleSubmit(text: string) {
    if (!text.trim()) return;

    // Slash commands
    if (text.startsWith('/')) {
      const handled = await this.handleSlash(text);
      if (handled) return;
      // Unrecognized slash command — pass to agent
    }

    this.messages.push({ role: 'user', content: text });
    this.chatDirty = true;
    this.editor.setText('');
    this.isProcessing = true;
    this.ui.requestRender();

    // Lazy init if agent not ready
    if (!this.agentRef) {
      const h = await this.initAgent();
      if (!h) {
        this.isProcessing = false;
        this.ui.requestRender();
        return;
      }
    }

    try {
      this.agentRef!.agent.prompt(text).catch((err: any) => {
        this.addSystem(`Error: ${err.message}`);
        this.isProcessing = false;
      });
    } catch (e: any) {
      this.addSystem(`Error: ${e.message}`);
      this.isProcessing = false;
    }
  }

  // ─── Slash commands ─────────────────────────────────────────────────────

  private async handleSlash(input: string): Promise<boolean> {
    const parts = input.slice(1).split(/\s+/);
    const cmd = parts[0]?.toLowerCase();

    switch (cmd) {
      case 'clear':
        this.messages = [];
        this.chatBox.clear();
        this.chatDirty = true;
        this.ui.requestRender();
        return true;

      case 'exit':
        this.stop();
        return true;

      case 'more':
        this.visibleCount += 200;
        this.chatDirty = true;
        this.ui.requestRender();
        this.addSystem(`Showing ${this.visibleCount} messages.`);
        return true;

      case 'help':
        this.showCommandPalette();
        return true;

      case 'keys':
        return this.handleKeys(parts);

      case 'model':
        return await this.handleModel(parts);

      case 'effort': {
        const level = parts[1];
        const valid = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'];
        if (level && valid.includes(level)) {
          this.config.effort = level as any;
          this.addSystem(`Effort set to ${c.primary(level)}. Restart or reinit to apply.`);
        } else {
          this.addSystem(`Current: ${c.primary(this.config.effort)}\nValid: ${valid.join(', ')}\nSet with: /effort <level>`);
        }
        return true;
      }

      case 'fast': {
        this.config.effort = 'minimal';
        this.addSystem(`Effort set to ${c.primary('minimal')} (fast mode). Restart or reinit to apply.`);
        return true;
      }

      case 'compact': {
        if (!this.agentRef) { this.addSystem('No active session.'); return true; }
        const { compactStrategy } = await import('../session/compact');
        const messages = this.agentRef.agent.state.messages || [];
        const threshold = this.config.session?.compactThreshold || 50000;
        const compacted = await compactStrategy(messages, 0);
        this.agentRef.agent.state.messages = compacted;
        this.addSystem(`Context compacted: ${messages.length} → ${compacted.length} messages.`);
        return true;
      }

      case 'status':
      case 'context': {
        if (!this.agentRef) { this.addSystem('No active session.'); return true; }
        const m = this.agentRef.resolved;
        const msgs = this.agentRef.agent.state.messages || [];
        const tools = this.agentRef.agent.state.tools?.length || 0;
        this.addSystem([
          `Model:       ${safeModelId(m.provider.id, m.model.id)}`,
          `Effort:      ${this.config.effort}`,
          `Permission:  ${this.config.permissions}`,
          `Messages:    ${msgs.length}`,
          `Tools:       ${tools}`,
          `Tokens:      ~${this.tokenEstimate.toLocaleString()}`,
          `Threshold:   ${(this.config.session?.compactThreshold || 50000).toLocaleString()}`,
        ].join('\n'));
        return true;
      }

      case 'cost': {
        if (!this.agentRef) { this.addSystem('No active session.'); return true; }
        const p = this.agentRef.resolved.model as any;
        const inp = p?.pricing?.input ?? 0;
        const out = p?.pricing?.output ?? 0;
        if (inp === 0 && out === 0) {
          this.addSystem(`Pricing info not available for ${c.primary(p.id)}`);
        } else {
          this.addSystem(`${c.primary(p.id)}: $${inp}/M input | $${out}/M output`);
        }
        return true;
      }

      case 'resume': {
        // Session picker
        const sm = new SessionManager(this.config.session.dir);
        const sessions = sm.list().slice(0, 100);
        if (sessions.length === 0) {
          this.addSystem('No previous sessions found.');
          return true;
        }
        showPicker(
          this.ui,
          'Sessions (select to resume)',
          sessions.map(s => ({
            label: s.id.slice(-16) + (s.name ? ` [${s.name}]` : ''),
            value: s.id,
            detail: new Date(s.updatedAt).toLocaleString(),
          })),
          async (id) => {
            if (!id) { this.ui.requestRender(); return; }
            const ss = sm.load(id);
            if (!ss) { this.addSystem(`Session not found: ${id}`); return; }
            this.existingSession = ss;
            this.messages = [];
            this.agentRef = null;
            this.chatDirty = true;
            // pre-load messages
            for (const m of ss.messages) {
              const content = typeof (m as any).content === 'string' ? (m as any).content : JSON.stringify((m as any).content);
              this.messages.push({ role: m.role || 'system', content: content.slice(0, 4000) });
            }
            this.addSystem(`Resumed ${ss.id.slice(-12)}.`);
            await this.initAgent();
            this.ui.setFocus(this.editor);
            this.ui.requestRender();
          }
        );
        return true;
      }

      case 'use': {
        // Model picker
        let models: any[] = [];
        try {
          models = await listAllModels();
        } catch (e: any) {
          this.addSystem(`Failed to list models: ${e.message}`);
          return true;
        }
        if (models.length === 0) {
          this.addSystem('No models available (check API keys).');
          return true;
        }
        // Group by provider to show key source
        const providerSource = new Map<string, string>();
        for (const m of models) {
          if (!providerSource.has(m.providerId)) {
            const p = getProvider(m.providerId);
            providerSource.set(m.providerId, p ? getKeySource(p) : 'none');
          }
        }
        showPicker(
          this.ui,
          'Select Model',
          models.map(m => {
            const source = providerSource.get(m.providerId) || 'none';
            const srcLabel = source === 'env' ? 'env' : source === 'auth' ? 'auth' : source === 'saved' ? 'saved' : 'none';
            return {
              label: safeModelId(m.providerId, m.id),
              value: safeModelId(m.providerId, m.id),
              detail: `${m.name}  ctx:${(m.contextWindow / 1000).toFixed(0)}k  [${srcLabel}]`,
            };
          }),
          async (model) => {
            if (!model) { this.ui.requestRender(); return; }
            this.config.model = model;
            this.addSystem(`Switching to ${c.primary(model)}...`);
            await this.initAgent();
            this.ui.setFocus(this.editor);
            this.ui.requestRender();
          },
          { maxHeight: 20 }
        );
        return true;
      }

      default:
        return false; // pass unrecognized slash commands to agent
    }
  }

  private handleKeys(parts: string[]): boolean {
    const action = parts[1];
    if (action === 'set' && parts[2]) {
      const key = parts.slice(3).join(' ');
      setKey(parts[2], key);
      this.addSystem(`Key saved for ${c.primary(parts[2])}.`);
      this.initAgent();
    } else if (action === 'list' || action === 'ls' || !action) {
      const keys = listKeys();
      if (keys.length > 0) {
        this.addSystem(
          keys.map(k =>
            `  ${c.primary(k.provider.padEnd(14))} ${c.dim(k.masked)}  ${c.muted(k.setAt.slice(0, 10))}`
          ).join('\n')
        );
      } else {
        this.addSystem('No keys configured. Use: /keys set <provider> <key>');
      }
    } else {
      this.addSystem('Usage: /keys set <provider> <key>  |  /keys list');
    }
    return true;
  }

  private async handleModel(parts: string[]): Promise<boolean> {
    const target = parts.slice(1).join(' ');
    if (!target) {
      this.addSystem(`Current: ${c.primary(this.config.model)}\nUsage: /model <provider/model>`);
      return true;
    }
    if (target.includes('/')) this.config.model = target;
    else {
      const p = getProvider(target);
      if (p?.models[0]) this.config.model = safeModelId(p.id, p.models[0].id);
    }
    this.addSystem(`Switching to ${c.primary(this.config.model)}...`);
    const h = await this.initAgent();
    if (h) this.addSystem(`Now using ${c.primary(safeModelId(h.resolved.provider.id, h.resolved.model.id))}`);
    return true;
  }

  // ─── Help overlay ──────────────────────────────────────────────────────────

  // ─── Command palette ────────────────────────────────────────────────────────

  private showCommandPalette() {
    const commands: Command[] = [
      { name: '/clear',        description: 'Clear screen' },
      { name: '/more',         description: 'Show 200 more messages' },
      { name: '/resume',       description: 'Resume a previous session' },
      { name: '/use',          description: 'Select model' },
      { name: '/exit',         description: 'Exit Zor' },
      { name: '/help',         description: 'Show commands' },
      { name: '/keys set',     description: 'Set API key' },
      { name: '/keys list',    description: 'Show configured keys' },
      { name: '/model',        description: 'Switch model (provider/model)' },
      { name: '/effort',       description: 'Set thinking effort level' },
      { name: '/cost',         description: 'Show token/cost estimate' },
      { name: '/status',       description: 'Show session info' },
      { name: '/context',      description: 'Show context stats' },
    ];

    showCommandPalette(
      this.ui,
      commands,
      (name: string) => {
        this.editor.setText(name + ' ');
        this.ui.setFocus(this.editor);
        this.ui.requestRender();
      },
      () => {
        this.commandPaletteOpen = false;
        this.ui.setFocus(this.editor);
        this.ui.requestRender();
      }
    );
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  async start() {
    // Resolve model from args or last session
    const args = process.argv.slice(2);
    const cliArg = args.find(a => !a.startsWith('--')) || '';
    if (cliArg?.includes('/')) {
      this.config.model = cliArg;
    } else if (!this.existingSession) {
      const last = loadLastSession();
      if (last) this.config.model = safeModelId(last.provider, last.model);
    }

    // Load existing messages from resumed session
    if (this.existingSession?.messages) {
      for (const m of this.existingSession.messages) {
        const content = typeof (m as any).content === 'string' ? (m as any).content : JSON.stringify((m as any).content);
        this.messages.push({ role: m.role || 'system', content: content.slice(0, 4000) });
      }
      this.addSystem(
        c.dim(`Resumed ${this.existingSession.id.slice(-12)} (${this.existingSession.messages.length} messages)`)
      );
    }

    this.buildLayout();

    // Override chatBox.render to eagerly rebuild content
    const origRender = this.chatBox.render.bind(this.chatBox);
    this.chatBox.render = (w: number) => {
      this.ensureChatRendered(w);
      return origRender(w);
    };



    // Spinner tick (80ms for smoother animation)
    setInterval(() => {
      if (this.isProcessing) { this.spinnerIdx++; this.ui.requestRender(); }
    }, 80);

    // Confirmation callback for tool permissions
    setConfirmationCallback((info) => {
      if (!info) return;
      showConfirm(
        this.ui,
        'Confirm tool execution',
        `${c.bold(info.toolName)}\n${c.dim(JSON.stringify(info.args).slice(0, 200))}`,
        (approved: boolean) => {
          resolveConfirmation(approved);
          this.ui.requestRender();
        }
      );
    });

    // Background token updates
    setInterval(() => this.updateTokens(), 10000);

    this.fetchGitBranch();

    this.ui.start();
    this.ui.setFocus(this.editor);

    await this.initAgent();
    this.ui.requestRender();
  }

  private fetchGitBranch() {
    try {
      const { execSync } = require('child_process');
      const branch = execSync('git branch --show-current', {
        encoding: 'utf8', timeout: 500,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (branch) this.gitBranch = branch;
    } catch { /* ponytail: git may not be installed */ }
  }

  stop() {
    this.ui.stop();
    process.exit(0);
  }
}
