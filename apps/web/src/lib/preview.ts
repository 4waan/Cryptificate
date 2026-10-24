import { BN254_P, gcd, invMod, powMod } from './bn254';
import { coefficientMatrix, validateProgram } from './circuit';
import { activityBound, activityFormula, isAesLike, targetMatrix, validateDesign } from './design';
import { fieldOps } from './field';
import { aesSbox, formatGfHex, parseGfHex } from './gf256';
import { branchWitness, rankAndKernel, weight } from './linalg';
import type { CandidateDesign, ClaimChain, ClaimId, Program, ProgramTarget, Witness } from './types';

/**
 * Unchecked diagnostics computed in the browser. These are previews only:
 * no Lean proof, no native run. The UI labels them "Unchecked diagnostic"
 * and never shows them with a proof status.
 */

export type PreviewOutcome = 'holds' | 'fails' | 'unknown';

export interface PreviewItem {
  id: ClaimId;
  chain: ClaimChain;
  title: string;
  outcome: PreviewOutcome;
  witness: Witness | null;
  note: string;
}

export function previewDesign(d: CandidateDesign): PreviewItem[] {
  if (validateDesign(d).length) return [];
  if (isAesLike(d)) {
    const f = fieldOps('gf256');
    const bw = branchWitness(f, d.matrix);
    const mds: PreviewItem = bw
      ? {
          id: 'matrix.mds',
          chain: 'design',
          title: 'Matrix is MDS (branch number 5)',
          outcome: 'fails',
          witness: {
            kind: 'branch',
            input: bw.input,
            output: bw.output,
            inputWeight: weight(f, bw.input),
            outputWeight: weight(f, bw.output),
            bound: 5,
          },
          note: 'A square submatrix is singular, which gives a low-weight input.',
        }
      : {
          id: 'matrix.mds',
          chain: 'design',
          title: 'Matrix is MDS (branch number 5)',
          outcome: 'holds',
          witness: null,
          note: 'All 69 square submatrices are nonsingular.',
        };
    const seen = new Map<number, number>();
    let collision: Witness | null = null;
    d.offsets.forEach((o, r) => {
      const prev = seen.get(o);
      if (prev !== undefined && !collision) collision = { kind: 'offset-collision', rows: [prev, r], offset: o };
      seen.set(o, r);
    });
    const offsets: PreviewItem = {
      id: 'offsets.dispersion',
      chain: 'design',
      title: 'Row offsets are pairwise distinct',
      outcome: collision ? 'fails' : 'holds',
      witness: collision,
      note: collision
        ? 'Two rows move by the same amount, so one column does not spread over all four.'
        : 'Each row moves by a different amount, so every column spreads over all four.',
    };
    const table = d.sbox.kind === 'aes' ? aesSbox() : d.sbox.table.map(parseGfHex);
    const firstSeen = new Map<number, number>();
    let sboxWitness: Witness | null = null;
    table.forEach((y, x) => {
      const prev = firstSeen.get(y);
      if (prev !== undefined && !sboxWitness) {
        sboxWitness = { kind: 'sbox-collision', x1: formatGfHex(prev), x2: formatGfHex(x), y: formatGfHex(y) };
      }
      firstSeen.set(y, x);
    });
    const sbox: PreviewItem = {
      id: 'sbox.bijective',
      chain: 'design',
      title: 'S-box is a permutation',
      outcome: sboxWitness ? 'fails' : 'holds',
      witness: sboxWitness,
      note: sboxWitness ? 'Two inputs share an output.' : 'All 256 outputs are distinct.',
    };
    const holds = mds.outcome === 'holds' && offsets.outcome === 'holds';
    const activity: PreviewItem = {
      id: 'activity.bound',
      chain: 'design',
      title: `At least ${activityBound(d.rounds)} active S-boxes over ${d.rounds} rounds`,
      outcome: holds ? 'holds' : 'unknown',
      witness: null,
      note: holds
        ? `Wide trail bound: ${activityFormula(d.rounds)}.`
        : 'Not established by this method: the bound needs an MDS matrix and distinct offsets.',
    };
    return [mds, offsets, sbox, activity];
  }

  const f = fieldOps('bn254');
  const bw = branchWitness(f, d.external);
  const external: PreviewItem = {
    id: 'external.mds',
    chain: 'design',
    title: 'External matrix is MDS (branch number 4)',
    outcome: bw ? 'fails' : 'holds',
    witness: bw
      ? {
          kind: 'branch',
          input: bw.input,
          output: bw.output,
          inputWeight: weight(f, bw.input),
          outputWeight: weight(f, bw.output),
          bound: 4,
        }
      : null,
    note: bw ? 'A square submatrix is singular.' : 'All 19 square submatrices are nonsingular.',
  };
  const internalRank = rankAndKernel(f, d.internal).rank;
  const internal: PreviewItem = {
    id: 'internal.invertible',
    chain: 'design',
    title: 'Internal matrix is invertible',
    outcome: internalRank === 3 ? 'holds' : 'fails',
    witness: null,
    note: internalRank === 3 ? 'The determinant is nonzero.' : 'The determinant is zero.',
  };
  return [external, internal, powerPreview(d.sbox.exponent)];
}

export function powerPreview(exponent: number): PreviewItem {
  const e = BigInt(exponent);
  const pm1 = BN254_P - 1n;
  const g = gcd(e, pm1);
  if (g === 1n) {
    const d = invMod(e, pm1)!;
    return {
      id: 'sbox.bijective',
      chain: 'design',
      title: `x ↦ x^${exponent} is a permutation`,
      outcome: 'holds',
      witness: null,
      note: `gcd(${exponent}, p − 1) = 1; the inverse exponent is d = ${d} (e·d ≡ 1 mod p − 1).`,
    };
  }
  let omega = 1n;
  for (const h of [5n, 7n, 2n, 3n, 11n, 13n]) {
    omega = powMod(h, pm1 / g);
    if (omega !== 1n) break;
  }
  return {
    id: 'sbox.bijective',
    chain: 'design',
    title: `x ↦ x^${exponent} is a permutation`,
    outcome: 'fails',
    witness: {
      kind: 'power-collision',
      exponent,
      x1: '1',
      x2: omega.toString(),
      note: `omega^${g} = 1`,
    },
    note: `gcd(${exponent}, p − 1) = ${g}, so a nontrivial root of unity ω collides with 1.`,
  };
}

export function previewEquivalence(d: CandidateDesign, p: Program, target?: ProgramTarget): PreviewItem | null {
  if (validateDesign(d).length || validateProgram(p, d.width).length || p.field !== d.field) return null;
  const f = fieldOps(p.field);
  const want = targetMatrix(d, target).map((r) => r.map((x) => f.canonical(x)));
  const got = coefficientMatrix(p);
  for (let j = 0; j < p.width; j++) {
    const differing = want.map((r, i) => i).filter((i) => want[i]![j] !== got[i]![j]);
    if (differing.length) {
      const input = Array.from({ length: p.width }, (_, i) => (i === j ? f.one : f.zero));
      return {
        id: 'circuit.equivalence',
        chain: 'implementation',
        title: 'Circuit computes the design matrix',
        outcome: 'fails',
        witness: {
          kind: 'distinguishing-input',
          input,
          expected: want.map((r) => r[j]!),
          actual: got.map((r) => r[j]!),
          differing,
        },
        note: `Column ${j} of the circuit's coefficient matrix differs from the design.`,
      };
    }
  }
  return {
    id: 'circuit.equivalence',
    chain: 'implementation',
    title: 'Circuit computes the design matrix',
    outcome: 'holds',
    witness: null,
    note: "The circuit's coefficient matrix equals the design matrix.",
  };
}
