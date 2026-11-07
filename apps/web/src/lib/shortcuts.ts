/** Keyboard shortcuts for workspace history: Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z and Ctrl+Y. */

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export type HistoryShortcut = 'undo' | 'redo' | null;

export function historyShortcut(e: KeyLike): HistoryShortcut {
  if (e.altKey || !(e.ctrlKey || e.metaKey) || (e.ctrlKey && e.metaKey)) return null;
  const key = e.key.toLowerCase();
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && e.ctrlKey && !e.shiftKey) return 'redo';
  return null;
}

export interface TargetLike {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
  getAttribute?(name: string): string | null;
}

/**
 * Whether the focused element keeps the browser's own undo: multi-line text
 * (S-box tables, import boxes, paste boxes), editable regions and fields
 * marked data-native-undo (the preset search). Matrix cells, numbers and
 * selects use workspace undo, so Ctrl/Cmd+Z there steps back through edits.
 */
export function keepsNativeUndo(el: TargetLike | null | undefined): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = (el.tagName ?? '').toUpperCase();
  if (tag === 'TEXTAREA') return true;
  return tag === 'INPUT' && el.getAttribute?.('data-native-undo') != null;
}

export function isMacPlatform(platform: string): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** Workbench-wide shortcuts handled by the window key handler. */
export type AppShortcut = 'check' | 'experiment' | 'stop' | 'help' | 'palette' | null;

/**
 * Ctrl/Cmd+Enter checks and Ctrl/Cmd+Shift+Enter runs a quick experiment,
 * also from inside a field; Ctrl/Cmd+K opens the command palette. Escape
 * stops the running job and "?" opens the shortcuts, but only when focus is
 * not in a text field, so typing a "?" or leaving a field never triggers them.
 */
export function appShortcut(e: KeyLike, inTextField: boolean): AppShortcut {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && !e.altKey && !(e.ctrlKey && e.metaKey)) {
    if (e.key === 'Enter') return e.shiftKey ? 'experiment' : 'check';
    if (!e.shiftKey && e.key.toLowerCase() === 'k') return 'palette';
    return null;
  }
  if (mod || e.altKey || inTextField) return null;
  if (e.key === 'Escape') return 'stop';
  if (e.key === '?') return 'help';
  return null;
}

const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'color', 'file', 'image']);

/** Whether keys typed here are text (inputs, text areas, selects, editable regions). */
export function isTextField(el: TargetLike | null | undefined): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = (el.tagName ?? '').toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  return !NON_TEXT_INPUTS.has((el.type ?? 'text').toLowerCase());
}
