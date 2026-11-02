import { describe, expect, it } from 'vitest';
import { BN254_P } from './bn254';
import { coefficientMatrix, validateProgram } from './circuit';
import { targetMatrix, validateDesign } from './design';
import { BN254 as BNF, GF256 } from './field';
import { BAD_INTERNAL, PRESETS, circulant, factLabels, presetById, searchPresets } from './library';
import { branchWitness, matVec } from './linalg';
import { aesDesign, aesSharedSum, hadesDesign, hadesSharedSum } from './presets';
import { previewDesign, previewEquivalence } from './preview';
import type { Snapshot } from './snapshot';

const aesStart: Snapshot = { design: aesDesign(), program: aesSharedSum(), target: 'matrix' };
const bnStart: Snapshot = { design: hadesDesign(), program: hadesSharedSum(), target: 'external' };

function outcome(s: Snapshot, id: string) {
  return previewDesign(s.design).find((i) => i.id === id)?.outcome;
}

describe('presets library', () => {
  it('has unique ids', () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
  });

  for (const p of PRESETS) {
    describe(p.id, () => {
      for (const start of [aesStart, bnStart]) {
        it(`applies to a ${start.design.field} workspace with valid inputs of its field`, () => {
          const s = p.apply(start);
          expect(s.design.field).toBe(p.field);
          expect(validateDesign(s.design)).toEqual([]);
          if (s.program) {
            expect(s.program.field).toBe(p.field);
            expect(validateProgram(s.program, s.design.width)).toEqual([]);
          }
          if (p.field === 'gf256') expect(s.target).toBe('matrix');
          else expect(['external', 'internal']).toContain(s.target);
        });
      }

      const s = p.apply(p.field === 'gf256' ? aesStart : bnStart);
      if (p.facts.mds !== undefined) {
        it(`is ${p.facts.mds ? '' : 'not '}MDS by the browser computation`, () => {
          const id = p.field === 'gf256' ? 'matrix.mds' : 'external.mds';
          if (p.kind === 'matrix' && p.slot === 'internal') throw new Error('internal matrices do not carry mds facts');
          expect(outcome(s, id)).toBe(p.facts.mds ? 'holds' : 'fails');
          const m = p.field === 'gf256' ? targetMatrix(s.design) : targetMatrix(s.design, 'external');
          expect(branchWitness(p.field === 'gf256' ? GF256 : BNF, m) === null).toBe(p.facts.mds);
        });
      }
      if (p.facts.invertible !== undefined) {
        it(`internal matrix is ${p.facts.invertible ? '' : 'not '}invertible`, () => {
          expect(outcome(s, 'internal.invertible')).toBe(p.facts.invertible ? 'holds' : 'fails');
        });
      }
      if (p.facts.permutation !== undefined) {
        it(`S-box is ${p.facts.permutation ? '' : 'not '}a permutation`, () => {
          expect(outcome(s, 'sbox.bijective')).toBe(p.facts.permutation ? 'holds' : 'fails');
        });
      }
      if (p.facts.equivalent !== undefined) {
        it(`circuit ${p.facts.equivalent ? 'matches' : 'differs from'} its target`, () => {
          expect(s.program).not.toBeNull();
          if (p.kind === 'circuit' && p.computes) {
            expect(coefficientMatrix(s.program!)).toEqual(p.computes);
          }
          if (p.kind === 'design' || p.kind === 'circuit') {
            const eq = previewEquivalence(s.design, s.program!, s.target);
            expect(eq?.outcome).toBe(p.facts.equivalent ? 'holds' : 'fails');
          }
        });
      }
      if (p.kind === 'circuit' && p.computes) {
        it('computes the matrix it says', () => {
          expect(coefficientMatrix(s.program!)).toEqual(p.computes);
        });
      }
      it('has a scope note and a label', () => {
        expect(p.scope.length).toBeGreaterThan(10);
        expect(p.label.length).toBeGreaterThan(3);
      });
      it('says "not MDS" in the label when the matrix is not MDS', () => {
        if (p.kind === 'matrix' && p.facts.mds === false && !p.weak) expect(p.label).toMatch(/not MDS/);
      });
    });
  }

  it('lists only matrices the browser computation confirms as MDS under the MDS fact', () => {
    const mds = PRESETS.filter((p) => p.kind === 'matrix' && p.facts.mds);
    expect(mds.map((p) => p.id)).toEqual(
      expect.arrayContaining(['matrix.aes-mixcolumns', 'matrix.aes-inv-mixcolumns', 'matrix.circ-01-01-04-09']),
    );
    for (const p of mds) {
      const s = p.apply(aesStart);
      expect(branchWitness(p.field === 'gf256' ? GF256 : BNF, targetMatrix(s.design, 'external'))).toBeNull();
    }
  });

  it('keeps the current program when a component of the same field is applied', () => {
    const s = presetById('matrix.circ-01-01-04-09')!.apply(aesStart);
    expect(s.program).toBe(aesStart.program);
    const t = presetById('matrix.bad-internal')!.apply({ ...bnStart, target: 'internal' });
    expect(t.target).toBe('internal');
    expect(t.design.model === 'hades/bn254/v1' && t.design.internal).toEqual(BAD_INTERNAL);
  });

  it('the weak internal matrix fixes v = (0, 1, -1), which avoids the x0 S-box', () => {
    const minusOne = (BN254_P - 1n).toString();
    const v = ['0', '1', minusOne];
    expect(matVec(BNF, BAD_INTERNAL, v)).toEqual(v);
    // The pinned internal matrix does not fix it.
    expect(matVec(BNF, hadesDesign().model === 'hades/bn254/v1' ? hadesDesign().internal : [], v)).not.toEqual(v);
  });

  it('builds circulants the way MixColumns is written', () => {
    expect(circulant(['02', '03', '01', '01'])).toEqual(aesDesign().matrix);
  });

  it('labels facts with neutral words', () => {
    expect(factLabels(presetById('matrix.circ-02-01-01-01')!)).toEqual(['not MDS']);
    expect(factLabels(presetById('sbox.non-injective')!)).toEqual(['not a permutation']);
  });
});

describe('searchPresets', () => {
  it('returns everything for an empty query, designs first', () => {
    const all = searchPresets('');
    expect(all).toHaveLength(PRESETS.length);
    expect(all[0]!.kind).toBe('design');
  });
  it('matches every word, case-insensitively, across label, family, tags and facts', () => {
    expect(searchPresets('poseidon2 internal').map((p) => p.id)).toEqual(
      expect.arrayContaining(['matrix.poseidon2-internal', 'matrix.bad-internal', 'design.poseidon2-bad-internal']),
    );
    expect(searchPresets('not mds').every((p) => p.facts.mds === false)).toBe(true);
    expect(searchPresets('INVMIXCOLUMNS').map((p) => p.id)).toEqual(['matrix.aes-inv-mixcolumns']);
    expect(searchPresets('gf(2⁸) sbox').every((p) => p.kind === 'sbox' && p.field === 'gf256')).toBe(true);
    expect(searchPresets('weak').length).toBeGreaterThan(3);
    expect(searchPresets('nothing-matches-this')).toEqual([]);
  });
  it('ranks whole tokens and phrases in the label first', () => {
    expect(searchPresets('circ(02, 01')[0]!.id).toBe('matrix.circ-02-01-01-01');
    expect(searchPresets('circ')[0]!.kind).toBe('matrix');
    expect(searchPresets('x^3')[0]!.id).toBe('sbox.power-3');
    expect(searchPresets('identity').slice(0, 3).every((p) => /identity/i.test(p.label))).toBe(true);
  });
});
