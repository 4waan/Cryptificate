import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COALESCE_MS } from '../lib/history';
import { presetById } from '../lib/library';
import { WORKSPACE_KEY } from '../lib/persist';
import { aesDesign, aesSharedSum, hadesDesign, hadesSharedSum, identityDesign, identityProgram } from '../lib/presets';
import { encodeShare } from '../lib/share';
import {
  applyPreset,
  loadInputs,
  openShareLink,
  redo,
  restoreReplaced,
  restoreWorkspace,
  SHARED_LINK,
  setDesign,
  setProgram,
  startPersistence,
  undo,
} from './actions';
import { getState, initialState, setState } from './store';

function memoryStorage() {
  const map = new Map<string, string>();
  return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}

function editCell(r: number, c: number, v: string, group = `design:matrix:${r},${c}`) {
  const d = getState().design;
  if (d.model !== 'aes-like/gf256/v1') throw new Error('expected AES-like');
  const matrix = d.matrix.map((row, i) => row.map((x, j) => (i === r && j === c ? v : x)));
  setDesign({ ...d, matrix }, { group });
}
const cell = (r: number, c: number) => {
  const d = getState().design;
  return d.model === 'aes-like/gf256/v1' ? d.matrix[r]![c] : undefined;
};

describe('workspace edits, history and story snapshots', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    setState(initialState());
  });
  afterEach(() => vi.useRealTimers());

  it('coalesces typing in one cell, but not across cells or pastes', () => {
    editCell(0, 0, '0');
    vi.advanceTimersByTime(100);
    editCell(0, 0, '04');
    vi.advanceTimersByTime(100);
    editCell(0, 1, '05');
    vi.advanceTimersByTime(100);
    editCell(1, 1, 'FF', null as unknown as string); // a paste: its own step
    expect(getState().history.past).toHaveLength(3);
    expect(undo()).toBe(true);
    expect(cell(1, 1)).toBe('02');
    undo();
    expect(cell(0, 1)).toBe('03');
    undo();
    expect(cell(0, 0)).toBe('02');
    expect(undo()).toBe(false);
    redo();
    expect(cell(0, 0)).toBe('04');
  });

  it('starts a new step after a pause in the same cell', () => {
    editCell(0, 0, '04');
    vi.advanceTimersByTime(COALESCE_MS + 1);
    editCell(0, 0, '05');
    expect(getState().history.past).toHaveLength(2);
  });

  it('ignores edits that change nothing', () => {
    loadInputs({ design: aesDesign(), program: aesSharedSum() });
    expect(getState().history.past).toHaveLength(0);
  });

  it('keeps user edits that a story step replaces, and restores them', () => {
    editCell(0, 0, '07');
    expect(getState().dirty).toBe(true);
    loadInputs({ design: identityDesign(), program: identityProgram() }, { origin: 'story', label: 'Story step 3' });
    const s = getState();
    expect(s.dirty).toBe(false);
    expect(s.replaced?.by).toBe('Story step 3');
    expect(s.replaced?.inputs.design.model === 'aes-like/gf256/v1' && s.replaced.inputs.design.matrix[0]![0]).toBe('07');
    // A second story step does not overwrite the kept edits.
    loadInputs({ design: hadesDesign(5), program: hadesSharedSum(), target: 'external' }, { origin: 'story', label: 'Story step 4' });
    expect(getState().replaced?.by).toBe('Story step 3');
    restoreReplaced();
    expect(cell(0, 0)).toBe('07');
    expect(getState().replaced).toBeUndefined();
    expect(getState().dirty).toBe(true);
  });

  it('does not keep anything when the story replaces untouched inputs', () => {
    loadInputs({ design: identityDesign(), program: identityProgram() }, { origin: 'story', label: 'Story step 3' });
    expect(getState().replaced).toBeUndefined();
    setProgram(aesSharedSum(), 'story');
    expect(getState().dirty).toBe(false);
  });

  it('applies a preset as one undo step', () => {
    applyPreset(presetById('design.poseidon2-bad-internal')!);
    const s = getState();
    expect(s.design.model).toBe('hades/bn254/v1');
    expect(s.target).toBe('internal');
    expect(s.announcement.text).toMatch(/Loaded/);
    undo();
    expect(getState().design.model).toBe('aes-like/gf256/v1');
  });
});

describe('persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setState(initialState());
  });
  afterEach(() => vi.useRealTimers());

  it('saves 300 ms after the last edit and restores on the next visit', () => {
    const storage = memoryStorage();
    const stop = startPersistence(storage);
    editCell(0, 0, '09');
    vi.advanceTimersByTime(200);
    editCell(0, 0, '0A');
    vi.advanceTimersByTime(299);
    expect(storage.map.has(WORKSPACE_KEY)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(storage.map.has(WORKSPACE_KEY)).toBe(true);
    expect(getState().storage).toBe('saved');
    stop();

    setState(initialState());
    expect(restoreWorkspace(storage)).toBe(true);
    expect(cell(0, 0)).toBe('0A');
    expect(getState().dirty).toBe(true);
  });

  it('reports unavailable storage and keeps working', () => {
    const stop = startPersistence({
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    });
    editCell(0, 0, '09');
    vi.advanceTimersByTime(300);
    expect(getState().storage).toBe('unavailable');
    expect(cell(0, 0)).toBe('09');
    stop();
  });

  it('ignores corrupt saved data', () => {
    const storage = memoryStorage();
    storage.map.set(WORKSPACE_KEY, '{"version":1,"design":{"model":"nope"}}');
    expect(restoreWorkspace(storage)).toBe(false);
    expect(getState().design).toEqual(aesDesign());
  });
});

describe('share links', () => {
  beforeEach(() => setState(initialState()));

  it('loads a link as one undo step with a notice', async () => {
    const token = await encodeShare({ design: hadesDesign(7), program: hadesSharedSum(), target: 'external' });
    await openShareLink(token);
    const s = getState();
    expect(s.design.model === 'hades/bn254/v1' && s.design.sbox.exponent).toBe(7);
    expect(s.notice?.kind).toBe('info');
    undo();
    expect(getState().design).toEqual(aesDesign());
  });

  it('keeps edits a share link replaces, across a reload, until restored', async () => {
    const storage = memoryStorage();
    const stop = startPersistence(storage);
    editCell(1, 1, '07');
    const token = await encodeShare({ design: hadesDesign(7), program: hadesSharedSum(), target: 'external' });
    await openShareLink(token);
    expect(getState().design.model).toBe('hades/bn254/v1');
    expect(getState().replaced?.by).toBe(SHARED_LINK);
    // The banner says what happened, so no second notice.
    expect(getState().notice).toBeUndefined();
    stop(); // flushes the pending save, as leaving the page does

    // A fresh visit: no undo history, but the kept edits come back with the saved workspace.
    setState(initialState());
    expect(restoreWorkspace(storage)).toBe(true);
    expect(getState().history.past).toHaveLength(0);
    expect(getState().design.model).toBe('hades/bn254/v1');
    expect(getState().replaced?.by).toBe(SHARED_LINK);
    restoreReplaced();
    expect(cell(1, 1)).toBe('07');
    expect(getState().replaced).toBeUndefined();
  });

  it('treats the shared inputs as the user workspace', async () => {
    editCell(0, 0, '07');
    await openShareLink(await encodeShare({ design: hadesDesign(5), program: hadesSharedSum(), target: 'external' }));
    expect(getState().dirty).toBe(true);
    // A later story step keeps the shared inputs, not the older edits.
    loadInputs({ design: identityDesign(), program: identityProgram() }, { origin: 'story', label: 'Story step 3' });
    expect(getState().replaced?.by).toBe('Story step 3');
    expect(getState().replaced?.inputs.design.model).toBe('hades/bn254/v1');
  });

  it('says so when a link holds the inputs already open', async () => {
    await openShareLink(await encodeShare({ design: aesDesign(), program: aesSharedSum(), target: 'matrix' }));
    expect(getState().notice).toBeUndefined();
    expect(getState().history.past).toHaveLength(0);
    expect(getState().announcement.text).toMatch(/already in your workspace/);
  });

  it('leaves the workspace alone when a link is broken', async () => {
    await openShareLink('zNOT-A-REAL-LINK');
    expect(getState().notice?.kind).toBe('error');
    expect(getState().notice?.text).toMatch(/unchanged/);
    expect(getState().design).toEqual(aesDesign());
    expect(getState().history.past).toHaveLength(0);
  });
});
