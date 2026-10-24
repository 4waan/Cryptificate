import { describe, expect, it } from 'vitest';
import { BN254_P, powMod } from './bn254';
import { activityBound, activityFormula } from './design';
import { aesSbox, gfMul } from './gf256';
import { powerPreview, previewDesign, previewEquivalence } from './preview';
import {
  aesDesign,
  aesSharedSum,
  hadesDesign,
  hadesSharedSum,
  identityDesign,
  identityProgram,
  miswiredSharedSum,
  rowScaledAesDesign,
} from './presets';

describe('field arithmetic', () => {
  it('matches the contract gates', () => {
    expect(gfMul(0x02, 0x80)).toBe(0x1b);
    expect(aesSbox()[0]).toBe(0x63);
    expect(aesSbox()[1]).toBe(0x7c);
    expect(aesSbox()[0x53]).toBe(0xed);
  });
});

describe('activity bound', () => {
  it('follows floor(r/4)*25 + (5 if r mod 4 >= 2)', () => {
    expect([4, 6, 10, 32].map(activityBound)).toEqual([25, 30, 55, 200]);
    expect(activityBound(5)).toBe(25);
    expect(activityFormula(10)).toBe('⌊10/4⌋·25 + 5 = 2·25 + 5 = 55');
  });
});

describe('browser previews', () => {
  it('AES passes every design check', () => {
    expect(previewDesign(aesDesign()).map((p) => p.outcome)).toEqual(['holds', 'holds', 'holds', 'holds']);
    expect(previewDesign(rowScaledAesDesign())[0]!.outcome).toBe('holds');
  });

  it('identity fails MDS with [01,00,00,00] and leaves activity unknown', () => {
    const [mds, , , activity] = previewDesign(identityDesign());
    expect(mds!.outcome).toBe('fails');
    expect(mds!.witness).toEqual({
      kind: 'branch',
      input: ['01', '00', '00', '00'],
      output: ['01', '00', '00', '00'],
      inputWeight: 1,
      outputWeight: 1,
      bound: 5,
    });
    expect(activity!.outcome).toBe('unknown');
    expect(previewEquivalence(identityDesign(), identityProgram())!.outcome).toBe('holds');
  });

  it('finds an offset collision', () => {
    const [, offsets] = previewDesign({ ...aesDesign(), offsets: [0, 1, 1, 3] });
    expect(offsets!.witness).toEqual({ kind: 'offset-collision', rows: [1, 2], offset: 1 });
  });

  it('the miswired circuit is distinguished on a basis input', () => {
    const eq = previewEquivalence(aesDesign(), miswiredSharedSum());
    expect(eq!.outcome).toBe('fails');
    expect(eq!.witness).toEqual({
      kind: 'distinguishing-input',
      input: ['00', '01', '00', '00'],
      expected: ['03', '02', '01', '01'],
      actual: ['01', '02', '01', '01'],
      differing: [0],
    });
    expect(previewEquivalence(aesDesign(), aesSharedSum())!.outcome).toBe('holds');
  });

  it('BN254: shared sum is equivalent, exponent 5 is a permutation, exponent 3 is not', () => {
    expect(previewEquivalence(hadesDesign(), hadesSharedSum())!.outcome).toBe('holds');
    expect(previewDesign(hadesDesign()).map((p) => p.outcome)).toEqual(['holds', 'holds', 'holds']);
    const five = powerPreview(5);
    expect(five.outcome).toBe('holds');
    const three = powerPreview(3);
    expect(three.outcome).toBe('fails');
    const w = three.witness;
    expect(w?.kind).toBe('power-collision');
    if (w?.kind === 'power-collision') {
      const omega = BigInt(w.x2);
      expect(omega).not.toBe(1n);
      expect(powMod(omega, 3n)).toBe(1n);
      expect(omega < BN254_P).toBe(true);
    }
  });
});
