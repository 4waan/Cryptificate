/**
 * Bounded undo/redo history over immutable values. Edits in the same group
 * (for example successive keystrokes in matrix cells) that arrive within
 * COALESCE_MS of each other form one undo step; an edit without a group
 * (loading a preset, an import, a story step) is always its own step.
 */

export const HISTORY_LIMIT = 100;
export const COALESCE_MS = 600;

export interface History<T> {
  past: T[];
  future: T[];
  lastGroup: string | null;
  lastAt: number;
}

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [], lastGroup: null, lastAt: 0 };
}

/** Records `before`, the value an edit at time `now` replaces. Clears the redo stack. */
export function record<T>(h: History<T>, before: T, now: number, group: string | null = null): History<T> {
  if (group !== null && h.lastGroup === group && now - h.lastAt < COALESCE_MS && h.past.length) {
    return { ...h, future: [], lastAt: now };
  }
  return { past: [...h.past, before].slice(-HISTORY_LIMIT), future: [], lastGroup: group, lastAt: now };
}

/** Steps back: returns the value to show and the new history, or null when there is nothing to undo. */
export function undo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  if (!h.past.length) return null;
  const value = h.past[h.past.length - 1]!;
  return {
    value,
    history: { past: h.past.slice(0, -1), future: [current, ...h.future].slice(0, HISTORY_LIMIT), lastGroup: null, lastAt: 0 },
  };
}

export function redo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  if (!h.future.length) return null;
  const value = h.future[0]!;
  return {
    value,
    history: { past: [...h.past, current].slice(-HISTORY_LIMIT), future: h.future.slice(1), lastGroup: null, lastAt: 0 },
  };
}
