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
