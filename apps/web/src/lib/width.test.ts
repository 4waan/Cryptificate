import { describe, expect, it } from 'vitest';
import { normalizeAnalysisRequest } from './canonical';
import { validateProgram } from './circuit';
import { validateDesign } from './design';
import { previewDesign, previewEquivalence } from './preview';
import { aesDesign, aesSharedSum } from './presets';
import { AES_WIDTHS, defaultMatrix, isExperimentalWidth, resizeAesDesign } from './width';

describe('AES-like width selector', () => {
  it.each(AES_WIDTHS)('width %i: a valid design whose matrix is MDS (browser preview)', (w) => {
    const { design, program } = resizeAesDesign(aesDesign(), aesSharedSum(), w);
    expect(design.width).toBe(w);
    expect(design.matrix).toEqual(defaultMatrix(w));
    expect(design.offsets).toEqual(Array.from({ length: w }, (_, i) => i));
    expect(validateDesign(design)).toEqual([]);
    expect(program && validateProgram(program, w)).toEqual([]);
    const items = previewDesign(design);
    expect(items.find((i) => i.id === 'matrix.mds')?.outcome).toBe('holds');
    expect(items.find((i) => i.id === 'offsets.dispersion')?.outcome).toBe('holds');
    // The activity bound is stated for width 4 only.
    expect(items.find((i) => i.id === 'activity.bound')?.outcome).toBe(w === 4 ? 'holds' : 'unknown');
    expect(previewEquivalence(design, program!)?.outcome).toBe('holds');
  });

  it('marks widths 2 and 3 experimental, in the design and in the request', () => {
    expect(AES_WIDTHS.filter(isExperimentalWidth)).toEqual([3, 2]);
    const three = resizeAesDesign(aesDesign(), null, 3);
    expect(three.design.experimental).toBe(true);
    expect(three.program).toBeNull();
    expect(normalizeAnalysisRequest({ design: three.design }).design).toMatchObject({ width: 3, experimental: true });
    const back = resizeAesDesign(three.design, null, 4);
    expect('experimental' in back.design).toBe(false);
  });

  it('keeps rounds and the S-box', () => {
    const d = { ...aesDesign(10), sbox: { kind: 'table' as const, table: Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0').toUpperCase()) } };
    const { design } = resizeAesDesign(d, null, 2);
    expect(design.rounds).toBe(10);
    expect(design.sbox).toBe(d.sbox);
  });
});
