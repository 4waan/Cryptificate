import { coerceDesign, coerceProgram } from './importer';
import { fieldTarget, type Snapshot } from './snapshot';

/**
 * The workspace saved in this browser. Values are stored as typed, so an
 * unfinished cell survives a reload; shapes are checked on the way back in
 * and anything that does not parse is ignored.
 */

export const WORKSPACE_KEY = 'cryptificate.workspace.v1';

export interface SavedWorkspace {
  inputs: Snapshot;
  /** The user changed the workspace since the last story step loaded it. */
  dirty: boolean;
  /** Edits a story step replaced, kept so they can be restored. */
  replaced?: { inputs: Snapshot; by: string };
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function snapshotJson(s: Snapshot) {
  return { design: s.design, program: s.program, target: s.target };
}

export function serializeWorkspace(w: SavedWorkspace): string {
  return JSON.stringify({
    version: 1,
    ...snapshotJson(w.inputs),
    dirty: w.dirty,
    ...(w.replaced ? { replaced: { ...snapshotJson(w.replaced.inputs), by: w.replaced.by } } : {}),
  });
}

function coerceSnapshot(x: unknown): Snapshot {
  if (typeof x !== 'object' || x === null) throw new Error('not an object');
  const o = x as Record<string, unknown>;
  const design = coerceDesign(o.design, '/design');
  const program = o.program === null || o.program === undefined ? null : coerceProgram(o.program, '/program');
  if (program && program.field !== design.field) throw new Error('field mismatch');
  const t = o.target;
  const target = fieldTarget(design, t === 'internal' || t === 'external' || t === 'matrix' ? t : undefined);
  return { design, program, target };
}

/** Parses saved text; returns null for missing, foreign or corrupt data. */
export function parseSavedWorkspace(text: string | null): SavedWorkspace | null {
  if (!text) return null;
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    if (typeof raw !== 'object' || raw === null || raw.version !== 1) return null;
    const out: SavedWorkspace = { inputs: coerceSnapshot(raw), dirty: raw.dirty === true };
    const r = raw.replaced as Record<string, unknown> | undefined;
    if (r && typeof r === 'object') {
      try {
        out.replaced = { inputs: coerceSnapshot(r), by: typeof r.by === 'string' ? r.by.slice(0, 80) : 'a story step' };
      } catch {
        // A damaged snapshot of replaced edits is dropped; the current inputs still load.
      }
    }
    return out;
  } catch {
    return null;
  }
}

export function readSavedWorkspace(storage: StorageLike | null | undefined): SavedWorkspace | null {
  try {
    return parseSavedWorkspace(storage?.getItem(WORKSPACE_KEY) ?? null);
  } catch {
    return null;
  }
}

/** Saves the workspace; returns false when storage is unavailable or full. */
export function writeSavedWorkspace(storage: StorageLike | null | undefined, w: SavedWorkspace): boolean {
  if (!storage) return false;
  try {
    storage.setItem(WORKSPACE_KEY, serializeWorkspace(w));
    return true;
  } catch {
    return false;
  }
}
