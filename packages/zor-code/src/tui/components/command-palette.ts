import type { Component } from '@earendil-works/pi-tui';
import { TUI, matchesKey } from '@earendil-works/pi-tui';

const ESC = '\x1b[';
const F = (n: number) => (s: string) => `${ESC}${n}m${s}${ESC}0m`;
const c = {
  primary: F(36),
  text:    F(37),
  muted:   F(90),
  bold:    F(1),
  warning: F(33),
  error:   F(31),
  success: F(32),
  dim:     F(2),
  bgSelect: (s: string) => `${ESC}46;30m${s}${ESC}0m`,
};

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[\d+(;\d+)*m/g, '');
}

export interface Command {
  name: string;
  description: string;
}

export function showCommandPalette(
  tui: TUI,
  commands: Command[],
  onSelect: (name: string) => void,
  onClose: () => void
): void {
  let filter = '';
  let selectedIdx = 0;

  const getFiltered = () => commands.filter(cmd =>
    cmd.name.toLowerCase().includes(filter.toLowerCase()) ||
    cmd.description.toLowerCase().includes(filter.toLowerCase())
  );

  const paletteComp: Component = {
    render(width: number): string[] {
      const w = Math.min(width - 4, 70);
      const filtered = getFiltered();
      const lines: string[] = [];

      lines.push(c.bold(` Commands ${filter ? c.dim(`(${filter})`) : ''}`));
      lines.push(c.dim('─'.repeat(w - 2)));

      const maxH = 12;
      const start = Math.max(0, selectedIdx - maxH + 3);
      const end = Math.min(filtered.length, start + maxH);

      for (let i = start; i < end; i++) {
        const cmd = filtered[i];
        const num = String(i + 1).padStart(2);
        const prefix = i === selectedIdx ? c.bgSelect(` ${num}. `) : c.dim(` ${num}. `);
        const name = i === selectedIdx ? c.bold(c.primary(cmd.name)) : c.primary(cmd.name);
        const desc = c.muted(`  ${cmd.description}`);
        const line = `${prefix}${name}${desc}`;
        const pad = Math.max(0, w - 2 - stripAnsi(line).length);
        lines.push(`  ${line}${' '.repeat(pad)}`);
      }

      if (filtered.length === 0) {
        lines.push(`  ${c.muted('No matching commands')}`);
      }

      lines.push(c.dim('─'.repeat(w - 2)));
      lines.push(c.dim('  ↑↓:navigate  Enter:select  Tab:complete  Esc:close'));

      return lines.map(l => {
        const p = Math.max(0, w - stripAnsi(l).length);
        return l + ' '.repeat(p);
      });
    },

    handleInput(data: string): void {
      const filtered = getFiltered();

      if (matchesKey(data, 'up') || matchesKey(data, 'ctrl+p')) {
        selectedIdx = Math.max(0, selectedIdx - 1);
        tui.requestRender();
        return;
      }
      if (matchesKey(data, 'down') || matchesKey(data, 'ctrl+n')) {
        selectedIdx = Math.min(filtered.length - 1, selectedIdx + 1);
        tui.requestRender();
        return;
      }
      if (matchesKey(data, 'enter') || matchesKey(data, 'tab')) {
        const cmd = filtered[selectedIdx];
        if (cmd) onSelect(cmd.name);
        onClose();
        return;
      }
      if (matchesKey(data, 'escape') || matchesKey(data, 'ctrl+c')) {
        onClose();
        return;
      }
      if (matchesKey(data, 'backspace') || data === '\x7f') {
        filter = filter.slice(0, -1);
        selectedIdx = 0;
        tui.requestRender();
        return;
      }
      if (data.length === 1 && data.charCodeAt(0) >= 32) {
        filter += data;
        selectedIdx = 0;
        tui.requestRender();
      }
    },

    invalidate(): void {},
  };

const handle = tui.showOverlay(paletteComp, {
    anchor: 'bottom-left',
    width: '80%',
    maxHeight: 18,
    margin: 1,
  });
  handle.focus();

  const origClose = onClose;
  onClose = () => {
    origClose();
    handle.hide();
  };
}