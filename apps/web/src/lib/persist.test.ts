import { describe, expect, it } from 'vitest';
import { WORKSPACE_KEY, parseSavedWorkspace, readSavedWorkspace, serializeWorkspace, writeSavedWorkspace } from './persist';
import { aesDesign, aesSharedSum, hadesDesign, hadesSharedSum, primeDesign } from './presets';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe('workspace persistence', () => {
  it('round-trips inputs, the dirty flag and replaced edits', () => {
    const design = aesDesign();
    design.matrix[0]![0] = '0'; // an unfinished cell is kept as typed
    const w = {
      inputs: { design, program: aesSharedSum(), target: 'matrix' as const },
      dirty: true,
      replaced: { inputs: { design: hadesDesign(), program: hadesSharedSum(), target: 'internal' as const }, by: 'Story step 1' },
    };
    const back = parseSavedWorkspace(serializeWorkspace(w));
    expect(back).toEqual(w);
  });

  it('round-trips through a storage object', () => {
    const s = memoryStorage();
    const w = { inputs: { design: hadesDesign(3), program: null, target: 'external' as const }, dirty: false };
    expect(writeSavedWorkspace(s, w)).toBe(true);
    expect(s.map.has(WORKSPACE_KEY)).toBe(true);
    expect(readSavedWorkspace(s)).toEqual(w);
  });

  it.each([
    ['missing', null],
    ['not JSON', '{oops'],
    ['another version', JSON.stringify({ version: 2, design: aesDesign() })],
    ['a bad design', JSON.stringify({ version: 1, design: { model: 'other' } })],
    ['a mismatched program', JSON.stringify({ version: 1, design: aesDesign(), program: hadesSharedSum() })],
    ['an array', '[]'],
  ])('ignores %s data', (_, text) => {
    expect(parseSavedWorkspace(text)).toBeNull();
  });

  it('fixes a target that does not fit the field', () => {
    const text = JSON.stringify({ version: 1, design: aesDesign(), program: aesSharedSum(), target: 'internal' });
    expect(parseSavedWorkspace(text)?.inputs.target).toBe('matrix');
  });

  it('drops damaged replaced edits but keeps the inputs', () => {
    const text = JSON.stringify({ version: 1, design: aesDesign(), program: null, replaced: { design: 7 } });
    const back = parseSavedWorkspace(text);
    expect(back?.inputs.design).toEqual(aesDesign());
    expect(back?.replaced).toBeUndefined();
  });

  it('survives storage that throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(readSavedWorkspace(throwing)).toBeNull();
    expect(writeSavedWorkspace(throwing, { inputs: { design: aesDesign(), program: null, target: 'matrix' }, dirty: false })).toBe(false);
    expect(writeSavedWorkspace(null, { inputs: { design: aesDesign(), program: null, target: 'matrix' }, dirty: false })).toBe(false);
  });
});

describe('saved prime-field workspaces', () => {
  it('restores a KoalaBear design', () => {
    const w = { inputs: { design: primeDesign('koalabear'), program: null, target: 'external' as const }, dirty: true };
    // Restoring normalizes the design: unstated round constants read as unspecified.
    expect(parseSavedWorkspace(serializeWorkspace(w))?.inputs.design).toEqual({ constants: { kind: 'unspecified' }, ...w.inputs.design });
  });
});
