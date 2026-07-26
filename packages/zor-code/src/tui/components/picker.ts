import type { Component } from '@earendil-works/pi-tui';
import { TUI, Container, Text, matchesKey } from '@earendil-works/pi-tui';

// ─── ANSI ──────────────────────────────────────────────────────────────────

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

// ─── PickerItem ────────────────────────────────────────────────────────────

interface PickerItem {
  label: string;
  value: string;
  detail?: string; // shown muted on the right
}

// ─── PickerOverlay ─────────────────────────────────────────────────────────

/** Generic pickable list shown as a TUI overlay. Returns selected value or null. */
export function showPicker(
  tui: TUI,
  title: string,
  items: PickerItem[],
  onSelect: (value: string | null) => void,
  opts?: { maxHeight?: number },
): void {
  if (items.length === 0) { onSelect(null); return; }

  let selectedIdx = 0;
  const maxH = opts?.maxHeight ?? 15;

  const pickerComp: Component = {
    render(width: number): string[] {
      const w = Math.min(width - 4, 60);
      const lines: string[] = [];
      lines.push(c.bold(` ${title}`));
      lines.push(c.dim('─'.repeat(w - 2)));
      const start = Math.max(0, selectedIdx - maxH + 3);
      const end = Math.min(items.length, start + maxH);
      for (let i = start; i < end; i++) {
        const item = items[i];
        const num = String(i + 1).padStart(2);
        const prefix = i === selectedIdx ? c.bgSelect(` ${num}. `) : c.dim(` ${num}. `);
        const label = i === selectedIdx ? c.bold(c.text(item.label)) : c.text(item.label);
        const detail = item.detail ? c.muted(`  ${item.detail}`) : '';
        const line = `${prefix}${label}${detail}`;
        const pad = Math.max(0, w - 2 - stripAnsi(line).length);
        lines.push(`  ${line}${' '.repeat(pad)}`);
      }
      lines.push(c.dim('─'.repeat(w - 2)));
      lines.push(c.dim('  ↑↓:navigate  Enter:select  Esc:cancel'));
      // Pad to w
      return lines.map(l => {
        const p = Math.max(0, w - stripAnsi(l).length);
        return l + ' '.repeat(p);
      });
    },

    handleInput(data: string): void {
      if (matchesKey(data, 'up') || matchesKey(data, 'ctrl+p')) {
        selectedIdx = Math.max(0, selectedIdx - 1);
        tui.requestRender();
        return;
      }
      if (matchesKey(data, 'down') || matchesKey(data, 'ctrl+n')) {
        selectedIdx = Math.min(items.length - 1, selectedIdx + 1);
        tui.requestRender();
        return;
      }
      if (matchesKey(data, 'enter')) {
        onSelect(items[selectedIdx]?.value ?? null);
        return;
      }
      if (matchesKey(data, 'escape') || matchesKey(data, 'ctrl+c')) {
        onSelect(null);
        return;
      }
      // Number quick-select
      const digit = parseInt(data);
      if (digit >= 1 && digit <= items.length) {
        onSelect(items[digit - 1]?.value ?? null);
        return;
      }
    },

    invalidate(): void {},
  };

  const handle = tui.showOverlay(pickerComp, {
    anchor: 'bottom-center',
    width: '70%',
    maxHeight: '60%',
    margin: 1,
  });
  handle.focus();

  // One-shot: first selection hides overlay
  const origSelect = onSelect;
  onSelect = (val: string | null) => {
    origSelect(val);
    handle.hide();
    tui.setFocus(null); // focus falls back to previous
  };
}

// ─── ConfirmOverlay ────────────────────────────────────────────────────────

/** Simple confirmation dialog. Calls onConfirm with true/false. */
export function showConfirm(
  tui: TUI,
  title: string,
  message: string,
  onConfirm: (approved: boolean) => void,
): void {
  const confirmComp: Component = {
    render(width: number): string[] {
      const w = Math.min(width - 4, 60);
      return [
        c.bold(` ${title}`),
        c.dim('─'.repeat(w - 2)),
        ` ${c.text(message)}`,
        '',
        ` ${c.warning('Approve? (y/n)')}`,
      ].map(l => {
        const p = Math.max(0, w - stripAnsi(l).length);
        return l + ' '.repeat(p);
      });
    },
    handleInput(data: string): void {
      if (data === 'y' || data === 'Y') { onConfirm(true); }
      else if (data === 'n' || data === 'N') { onConfirm(false); }
      else if (matchesKey(data, 'escape') || matchesKey(data, 'ctrl+c')) { onConfirm(false); }
    },
    invalidate(): void {},
  };

  const handle = tui.showOverlay(confirmComp, {
    anchor: 'center',
    width: 50,
    maxHeight: 8,
    margin: 1,
  });
  handle.focus();

  const orig = onConfirm;
  onConfirm = (approved: boolean) => {
    orig(approved);
    handle.hide();
    tui.setFocus(null);
  };
}

// ─── InputOverlay ──────────────────────────────────────────────────────────

/** Simple single-line input overlay. Returns the text or null. */
export function showInput(
  tui: TUI,
  title: string,
  placeholder: string,
  onSubmit: (text: string | null) => void,
): void {
  let text = '';

  const inputComp: Component = {
    render(width: number): string[] {
      const w = Math.min(width - 4, 60);
      return [
        c.bold(` ${title}`),
        c.dim('─'.repeat(w - 2)),
        ` ${c.text(`> ${text}`)}${c.dim(text.length === 0 ? placeholder : '█')}`,
        '',
        c.dim('  Enter:confirm  Esc:cancel'),
      ].map(l => {
        const p = Math.max(0, w - stripAnsi(l).length);
        return l + ' '.repeat(p);
      });
    },
    handleInput(data: string): void {
      if (matchesKey(data, 'enter')) {
        onSubmit(text || null);
        return;
      }
      if (matchesKey(data, 'escape') || matchesKey(data, 'ctrl+c')) {
        onSubmit(null);
        return;
      }
      if (matchesKey(data, 'backspace') || data === '\x7f') {
        text = text.slice(0, -1);
        tui.requestRender();
        return;
      }
      // Printable characters only (skip control sequences)
      if (data.length === 1 && data.charCodeAt(0) >= 32) {
        text += data;
        tui.requestRender();
      }
    },
    invalidate(): void {},
  };

  const handle = tui.showOverlay(inputComp, {
    anchor: 'center',
    width: '60%',
    maxHeight: 6,
    margin: 1,
  });
  handle.focus();

  const orig = onSubmit;
  onSubmit = (val: string | null) => {
    orig(val);
    handle.hide();
    tui.setFocus(null);
  };
}
