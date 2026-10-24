import { describe, expect, it } from 'vitest';
import { bestCandidate, savingsSummary } from './experiment';
import { aesSharedSum } from './presets';
import type { Claim, ExperimentReport, Program } from './types';

const proved: Claim = {
  id: 'circuit.equivalence',
  chain: 'implementation',
  title: 'Circuit computes the design matrix',
  status: 'proved',
  evidence: { kind: 'lean', label: 'Lean-checked circuit equivalence' },
  witness: null,
  note: '',
};

/** The textbook circuit with the duplicate x0 ⊕ x1 shared: 13 XORs. */
function shared(): Program {
  const p = aesSharedSum();
  // r7 duplicates r4; point its readers at r4 and drop it.
  const instructions = p.instructions
    .map((ins) => (ins.op === 'mul' && ins.a === 7 ? { ...ins, a: 4 } : ins))
    .filter((_, i) => i !== 3)
    .map((ins) => {
      const f = (r: number) => (r > 7 ? r - 1 : r);
      return ins.op === 'add' ? { ...ins, a: f(ins.a), b: f(ins.b) } : { ...ins, a: f(ins.a) };
    });
  return { ...p, name: 'c3', instructions, outputs: p.outputs.map((r) => r - 1) };
}

function report(verdict: 'inconclusive' | 'locally confirmed' | 'no improvement'): ExperimentReport {
  return {
    kind: 'experiment',
    id: 'e1',
    inputDigest: 'sha256:00',
    profile: 'quick',
    search: null,
    candidates: [
      {
        id: 'baseline-known',
        origin: 'baseline-known',
        program: aesSharedSum(),
        equivalence: proved,
        native: { cases: 9214, passed: true, checksum: 'a' },
      },
      {
        id: 'c3',
        origin: 'search',
        program: shared(),
        equivalence: proved,
        native: { cases: 9214, passed: true, checksum: 'a' },
      },
      {
        id: 'c4',
        origin: 'search',
        program: shared(),
        equivalence: { ...proved, status: 'not_established' },
        native: null,
      },
    ],
    measurements: {
      machine: { cpu: 'cpu', os: 'os', ramMiB: 1, rustc: 'rustc', flags: '' },
      workloads: [],
      comparisons: [
        { candidate: 'c3', baseline: 'baseline-known', ratio: 1.01, ci95: [0.99, 1.04], session: 1, bytes: 65536 },
      ],
      verdict,
    },
    provenance: { origin: 'live', checker: 'x', toolchain: { lean: '', mathlib: '', widetrail: '', rustc: '' } },
    checkpoints: [],
  };
}

describe('experiment summary', () => {
  it('picks the cheapest verified search candidate', () => {
    expect(bestCandidate(report('inconclusive'))?.id).toBe('c3');
  });

  it('states structural savings and an inconclusive timing honestly', () => {
    const s = savingsSummary(report('inconclusive'));
    expect(s.structural).toContain('14 XORs instead of 15');
    expect(s.timing).toContain('inconclusive');
    expect(s.timing).toContain('0.990 to 1.040');
    expect(s.timing).toContain('need not mean faster');
  });

  it('only says faster when the verdict is locally confirmed', () => {
    expect(savingsSummary(report('locally confirmed')).timing).toMatch(/^Faster on this machine/);
    expect(savingsSummary(report('no improvement')).timing).toMatch(/^No improvement/);
  });
});
