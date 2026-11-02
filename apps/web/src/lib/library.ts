import { naiveCircuit } from './circuit';
import { identityMatrix } from './design';
import { aesSbox, formatGfHex } from './gf256';
import {
  AES_MIXCOLUMNS,
  aesDesign,
  aesSharedSum,
  hadesDesign,
  hadesSharedSum,
  identityDesign,
  identityProgram,
  miswiredSharedSum,
} from './presets';
import { fieldTarget, type Snapshot } from './snapshot';
import type { AesLikeDesign, FieldName, HadesDesign, Program, ProgramTarget } from './types';

/**
 * The presets library: whole designs, single matrices, S-boxes and circuits
 * with scope notes. `facts` are properties the browser preview computes;
 * library.test.ts recomputes every one of them with lib/preview.ts, so a
 * preset cannot be listed as MDS (or as a permutation, or as matching its
 * matrix) unless the computation agrees. They are not Lean certificates.
 *
 * GF(2^8) here is always GF(2)[x]/(x^8 + x^4 + x^3 + x + 1), polynomial
 * 0x11B. Matrices from ciphers over other fields or polynomials (LED,
 * Midori, PRINCE, SKINNY over GF(2^4); Twofish, Whirlpool over other
 * polynomials) are not representable byte for byte and are not listed.
 */

export type PresetKind = 'design' | 'matrix' | 'sbox' | 'circuit';

export interface PresetFacts {
  /** Matrix is MDS (AES-like matrix, or the external matrix in BN254). */
  mds?: boolean;
  /** BN254 internal matrix is invertible. */
  invertible?: boolean;
  /** S-box or power map is a permutation. */
  permutation?: boolean;
  /** The circuit computes the matrix it targets. */
  equivalent?: boolean;
}

export interface Preset {
  id: string;
  kind: PresetKind;
  field: FieldName;
  label: string;
  family: string;
  summary: string;
  /** What the preset is and is not: the honest scope note. */
  scope: string;
  /** Included as a negative control or a deliberately weak choice. */
  weak?: boolean;
  /** For matrix presets in BN254: which matrix of the design it replaces. */
  slot?: 'matrix' | 'external' | 'internal';
  /** For circuit presets: the matrix the circuit computes. */
  computes?: string[][];
  tags: string[];
  facts: PresetFacts;
  apply(current: Snapshot): Snapshot;
}

export const KIND_LABELS: Record<PresetKind, string> = {
  design: 'Designs',
  matrix: 'Matrices',
  sbox: 'S-boxes',
  circuit: 'Circuits',
};

export const FIELD_LABELS: Record<FieldName, string> = { gf256: 'GF(2⁸)', bn254: 'BN254' };

/** circ(a, b, c, d): row i is the first row rotated right by i, as in AES MixColumns. */
export function circulant(first: string[]): string[][] {
  const n = first.length;
  return first.map((_, i) => first.map((_, j) => first[(j - i + n) % n]!));
}

const copy = (m: string[][]) => m.map((r) => [...r]);

const ROW_SCALED_AES = (() => {
  const m = copy(AES_MIXCOLUMNS);
  m[0] = ['04', '06', '02', '02'];
  return m;
})();

const P2_EXTERNAL = [
  ['2', '1', '1'],
  ['1', '2', '1'],
  ['1', '1', '2'],
];
const P2_INTERNAL = [
  ['2', '1', '1'],
  ['1', '2', '1'],
  ['1', '1', '3'],
];
/** The external matrix reused as the internal one: the deliberately weak construction. */
export const BAD_INTERNAL = copy(P2_EXTERNAL);

/** AES table with S(01) overwritten by S(00): a collision 00, 01 → 63. */
export function nonInjectiveSbox(): string[] {
  const t = aesSbox().map(formatGfHex);
  t[1] = t[0]!;
  return t;
}

export function identitySbox(): string[] {
  return Array.from({ length: 256 }, (_, i) => formatGfHex(i));
}

/** s = x0 + x1 + x2; y0 = s + x0; y1 = s + x1; y2 = s + (x2 + x2). Computes [[2,1,1],[1,2,1],[1,1,3]]. */
export function internalSharedSum(): Program {
  return {
    field: 'bn254',
    width: 3,
    name: 'bn254-internal-shared-sum',
    instructions: [
      { op: 'add', a: 0, b: 1 }, // r3
      { op: 'add', a: 3, b: 2 }, // r4 = s
      { op: 'add', a: 4, b: 0 }, // r5 = y0
      { op: 'add', a: 4, b: 1 }, // r6 = y1
      { op: 'add', a: 2, b: 2 }, // r7 = 2·x2
      { op: 'add', a: 4, b: 7 }, // r8 = y2
    ],
    outputs: [5, 6, 8],
  };
}

/** The current design if it has `field`, otherwise that field's reference design. */
function baseAes(s: Snapshot): AesLikeDesign {
  return s.design.model === 'aes-like/gf256/v1' ? s.design : aesDesign();
}
function baseHades(s: Snapshot): HadesDesign {
  return s.design.model === 'hades/bn254/v1' ? s.design : hadesDesign();
}
function keepProgram(s: Snapshot, field: FieldName, fallback: () => Program): Program | null {
  if (s.design.field === field) return s.program;
  return fallback();
}

function matrixPreset(
  p: Omit<Preset, 'kind' | 'apply' | 'field' | 'slot'> & { matrix: string[][] },
): Preset {
  const { matrix, ...rest } = p;
  return {
    ...rest,
    kind: 'matrix',
    field: 'gf256',
    slot: 'matrix',
    apply: (s) => ({
      design: { ...baseAes(s), matrix: copy(matrix) },
      program: keepProgram(s, 'gf256', aesSharedSum),
      target: 'matrix',
    }),
  };
}

function bnMatrixPreset(
  p: Omit<Preset, 'kind' | 'apply' | 'field'> & { matrix: string[][]; slot: 'external' | 'internal' },
): Preset {
  const { matrix, ...rest } = p;
  return {
    ...rest,
    kind: 'matrix',
    field: 'bn254',
    apply: (s) => {
      const d = baseHades(s);
      return {
        design: { ...d, [p.slot]: copy(matrix) },
        program: keepProgram(s, 'bn254', hadesSharedSum),
        target: s.design.field === 'bn254' ? s.target : 'external',
      };
    },
  };
}

function circuitPreset(
  p: Omit<Preset, 'kind' | 'apply'> & { program: () => Program; target: ProgramTarget },
): Preset {
  const { program, target, ...rest } = p;
  return {
    ...rest,
    kind: 'circuit',
    apply: (s) => {
      const design = s.design.field === p.field ? s.design : p.field === 'gf256' ? aesDesign() : hadesDesign();
      return { design, program: program(), target: fieldTarget(design, target) };
    },
  };
}

const SUPERSCRIPT: Record<number, string> = { 3: '³', 5: '⁵', 7: '⁷' };

const GF_NOTE = 'GF(2⁸) with x⁸ + x⁴ + x³ + x + 1 (0x11B).';

export const PRESETS: Preset[] = [
  /* ---------------- designs ---------------- */
  {
    id: 'design.aes',
    kind: 'design',
    field: 'gf256',
    label: 'AES-like: MixColumns, AES S-box, shared-sum circuit',
    family: 'AES',
    summary: '4 rounds of the AES-like template with the textbook circuit (15 XOR, 4 xtime).',
    scope: `MixColumns over ${GF_NOTE} ShiftRows offsets 0, 1, 2, 3 and the AES S-box. This is the AES-like round template, not AES: no key schedule, round constants or special last round.`,
    tags: ['mixcolumns', 'rijndael', 'reference', 'textbook'],
    facts: { mds: true, permutation: true, equivalent: true },
    apply: () => ({ design: aesDesign(), program: aesSharedSum(), target: 'matrix' }),
  },
  {
    id: 'design.aes-row-scaled',
    kind: 'design',
    field: 'gf256',
    label: 'Row-scaled AES with a generated circuit',
    family: 'AES',
    summary: 'First row doubled to [04, 06, 02, 02]; circuit generated term by term.',
    scope:
      'Scaling a row by a nonzero constant keeps every minor nonzero, so the matrix stays MDS. It is still a different matrix: AES certificates do not carry over and it needs its own check.',
    tags: ['fresh', 'variant', 'scaled'],
    facts: { mds: true, permutation: true, equivalent: true },
    apply: () => {
      const d = aesDesign();
      d.matrix = copy(ROW_SCALED_AES);
      return { design: d, program: naiveCircuit(d.matrix, 'gf256'), target: 'matrix' };
    },
  },
  {
    id: 'design.identity',
    kind: 'design',
    field: 'gf256',
    label: 'Identity matrix with the identity circuit',
    family: 'Teaching',
    summary: 'Correct implementation of a weak design.',
    scope:
      'Negative control. The identity matrix has branch number 2, so MDS fails and the activity bound is not established. The circuit matches the matrix exactly: equivalence holds, diffusion does not.',
    weak: true,
    tags: ['negative', 'control', 'no diffusion'],
    facts: { mds: false, permutation: true, equivalent: true },
    apply: () => ({ design: identityDesign(), program: identityProgram(), target: 'matrix' }),
  },
  {
    id: 'design.poseidon2-bn254-t3',
    kind: 'design',
    field: 'bn254',
    label: 'Poseidon2 t = 3 over BN254',
    family: 'Poseidon2',
    summary: 'External circ(2,1,1), internal [[2,1,1],[1,2,1],[1,1,3]], x⁵, 8 + 56 rounds.',
    scope:
      'The width-3 Poseidon2 matrices over the BN254 scalar field with reference round constants. The checks cover external MDS, internal invertibility, the power map and an active S-box bound for the full rounds; partial-round behaviour is not certified.',
    tags: ['hades', 'zk', 'snark', 'prime field', 'external', 'internal'],
    facts: { mds: true, invertible: true, permutation: true, equivalent: true },
    apply: () => ({ design: hadesDesign(5), program: hadesSharedSum(), target: 'external' }),
  },
  {
    id: 'design.poseidon2-bad-internal',
    kind: 'design',
    field: 'bn254',
    label: 'Poseidon2 t = 3 with the external matrix as internal',
    family: 'Poseidon2',
    summary: 'Internal [[2,1,1],[1,2,1],[1,1,2]]: passes every check here, weak on purpose.',
    scope:
      'Deliberately weak. With M = [[2,1,1],[1,2,1],[1,1,2]] as the internal matrix, v = (0, 1, −1) has Mv = v and v₀ = 0, so with the single partial-round S-box on x0 this difference never reaches an active S-box. The matrix is invertible (and MDS), so the internal-matrix claim holds: this weakness is outside what Cryptificate checks today (docs/research-directions.md, section 2).',
    weak: true,
    tags: ['hades', 'subspace', 'invariant', 'negative', 'internal'],
    facts: { mds: true, invertible: true, permutation: true, equivalent: true },
    apply: () => ({
      design: { ...hadesDesign(5), internal: copy(BAD_INTERNAL) },
      program: hadesSharedSum(),
      target: 'internal',
    }),
  },

  /* ---------------- matrices: GF(2^8) ---------------- */
  matrixPreset({
    id: 'matrix.aes-mixcolumns',
    label: 'AES MixColumns circ(02, 03, 01, 01)',
    family: 'AES',
    summary: 'The AES MixColumns matrix.',
    scope: `Over ${GF_NOTE}`,
    tags: ['mixcolumns', 'circulant', 'rijndael'],
    facts: { mds: true },
    matrix: AES_MIXCOLUMNS,
  }),
  matrixPreset({
    id: 'matrix.aes-inv-mixcolumns',
    label: 'AES InvMixColumns circ(0E, 0B, 0D, 09)',
    family: 'AES',
    summary: 'The inverse of MixColumns.',
    scope: `Over ${GF_NOTE} Heavier coefficients: a term-by-term circuit needs a multiplication for every entry.`,
    tags: ['inverse', 'decryption', 'circulant'],
    facts: { mds: true },
    matrix: circulant(['0E', '0B', '0D', '09']),
  }),
  matrixPreset({
    id: 'matrix.aes-row-scaled',
    label: 'Row-scaled AES, first row [04, 06, 02, 02]',
    family: 'AES',
    summary: 'MixColumns with its first row doubled.',
    scope: 'Still MDS, but a different matrix: it needs its own check.',
    tags: ['fresh', 'variant', 'scaled'],
    facts: { mds: true },
    matrix: ROW_SCALED_AES,
  }),
  matrixPreset({
    id: 'matrix.circ-01-01-04-09',
    label: 'Circulant circ(01, 01, 04, 09)',
    family: 'Circulant',
    summary: 'MDS circulant with two 01 coefficients.',
    scope: `MDS over ${GF_NOTE} The MDS property depends on the polynomial; under another modulus it must be re-checked.`,
    tags: ['circulant', 'variant', 'lightweight'],
    facts: { mds: true },
    matrix: circulant(['01', '01', '04', '09']),
  }),
  matrixPreset({
    id: 'matrix.circ-01-02-03-04',
    label: 'Circulant circ(01, 02, 03, 04)',
    family: 'Circulant',
    summary: 'MDS circulant with small distinct coefficients.',
    scope: `MDS over ${GF_NOTE} The MDS property depends on the polynomial; under another modulus it must be re-checked.`,
    tags: ['circulant', 'variant'],
    facts: { mds: true },
    matrix: circulant(['01', '02', '03', '04']),
  }),
  matrixPreset({
    id: 'matrix.circ-02-01-01-01',
    label: 'Circulant circ(02, 01, 01, 01): not MDS',
    family: 'Circulant',
    summary: 'Looks like MixColumns; a 2×2 minor vanishes.',
    scope: 'Not MDS: the browser preview finds a singular square submatrix and a low-weight input.',
    tags: ['circulant', 'negative', 'near miss'],
    facts: { mds: false },
    matrix: circulant(['02', '01', '01', '01']),
  }),
  matrixPreset({
    id: 'matrix.circ-01-02-04-06',
    label: 'Circulant circ(01, 02, 04, 06): not MDS',
    family: 'Circulant',
    summary: 'Small coefficients, but not MDS.',
    scope: 'Not MDS: the browser preview finds a singular square submatrix and a low-weight input.',
    tags: ['circulant', 'negative', 'near miss'],
    facts: { mds: false },
    matrix: circulant(['01', '02', '04', '06']),
  }),
  matrixPreset({
    id: 'matrix.circ-00-01-01-01',
    label: 'Binary circ(00, 01, 01, 01): not MDS',
    family: 'Teaching',
    summary: 'A Midori-style binary matrix embedded in GF(2⁸).',
    scope:
      'Not MDS (it has zero entries). Midori itself works over GF(2⁴) and is not representable here; this is only its 0/1 pattern, for teaching.',
    tags: ['binary', 'almost mds', 'midori', 'negative'],
    facts: { mds: false },
    matrix: circulant(['00', '01', '01', '01']),
  }),
  matrixPreset({
    id: 'matrix.identity',
    label: 'Identity: no diffusion',
    family: 'Teaching',
    summary: 'Branch number 2.',
    scope: 'Negative control: every output depends on a single input.',
    weak: true,
    tags: ['negative', 'control'],
    facts: { mds: false },
    matrix: identityMatrix(4, 'gf256'),
  }),

  /* ---------------- matrices: BN254 ---------------- */
  bnMatrixPreset({
    id: 'matrix.poseidon2-external',
    label: 'Poseidon2 external circ(2, 1, 1)',
    family: 'Poseidon2',
    summary: 'Replaces the external (full-round) matrix.',
    scope: 'The t = 3 external matrix [[2,1,1],[1,2,1],[1,1,2]] over the BN254 scalar field.',
    slot: 'external',
    tags: ['hades', 'external', 'full rounds'],
    facts: { mds: true },
    matrix: P2_EXTERNAL,
  }),
  bnMatrixPreset({
    id: 'matrix.poseidon2-internal',
    label: 'Poseidon2 internal [[2,1,1],[1,2,1],[1,1,3]]',
    family: 'Poseidon2',
    summary: 'Replaces the internal (partial-round) matrix.',
    scope: 'The t = 3 internal matrix over the BN254 scalar field. Only invertibility is checked for internal matrices.',
    slot: 'internal',
    tags: ['hades', 'internal', 'partial rounds'],
    facts: { invertible: true },
    matrix: P2_INTERNAL,
  }),
  bnMatrixPreset({
    id: 'matrix.bad-internal',
    label: 'Weak internal [[2,1,1],[1,2,1],[1,1,2]]',
    family: 'Poseidon2',
    summary: 'Invertible, yet a difference can skip the partial-round S-box forever.',
    scope:
      'Deliberately weak as an internal matrix: v = (0, 1, −1) is fixed by M and never touches x0. Invertibility, the only internal-matrix claim checked here, does not detect it.',
    slot: 'internal',
    weak: true,
    tags: ['hades', 'internal', 'subspace', 'invariant', 'negative'],
    facts: { invertible: true },
    matrix: BAD_INTERNAL,
  }),

  /* ---------------- S-boxes ---------------- */
  {
    id: 'sbox.aes',
    kind: 'sbox',
    field: 'gf256',
    label: 'AES S-box',
    family: 'AES',
    summary: 'Inversion in GF(2⁸) followed by the AES affine map.',
    scope: 'Cryptificate checks that an S-box is a permutation; differential and linear quality are not assessed here.',
    tags: ['rijndael', 'inversion'],
    facts: { permutation: true },
    apply: (s) => ({ ...s, design: { ...baseAes(s), sbox: { kind: 'aes' } }, program: keepProgram(s, 'gf256', aesSharedSum), target: 'matrix' }),
  },
  {
    id: 'sbox.identity',
    kind: 'sbox',
    field: 'gf256',
    label: 'Identity table: weak',
    family: 'Teaching',
    summary: 'S(x) = x. A permutation with no nonlinearity.',
    scope:
      'Passes the permutation check, which is the only S-box property checked here, yet the whole cipher becomes linear. Use it to see what bijectivity alone does not say.',
    weak: true,
    tags: ['linear', 'negative', 'table'],
    facts: { permutation: true },
    apply: (s) => ({
      design: { ...baseAes(s), sbox: { kind: 'table', table: identitySbox() } },
      program: keepProgram(s, 'gf256', aesSharedSum),
      target: 'matrix',
    }),
  },
  {
    id: 'sbox.non-injective',
    kind: 'sbox',
    field: 'gf256',
    label: 'Non-injective table',
    family: 'Teaching',
    summary: 'AES table with S(01) overwritten by S(00) = 63.',
    scope: 'Not a permutation: inputs 00 and 01 both map to 63, and 7C is never reached.',
    weak: true,
    tags: ['collision', 'negative', 'table', 'broken'],
    facts: { permutation: false },
    apply: (s) => ({
      design: { ...baseAes(s), sbox: { kind: 'table', table: nonInjectiveSbox() } },
      program: keepProgram(s, 'gf256', aesSharedSum),
      target: 'matrix',
    }),
  },
  ...[
    { e: 5, ok: true, note: 'Poseidon2’s choice for BN254: gcd(5, p − 1) = 1.' },
    { e: 7, ok: true, note: 'gcd(7, p − 1) = 1, so x⁷ is a permutation too.' },
    { e: 3, ok: false, note: 'Not a permutation over BN254: 3 divides p − 1, so cube roots of unity collide with 1.' },
  ].map(
    ({ e, ok, note }): Preset => ({
      id: `sbox.power-${e}`,
      kind: 'sbox',
      field: 'bn254',
      label: `Power map x${SUPERSCRIPT[e]}${ok ? '' : ': not a permutation'}`,
      family: 'Poseidon2',
      summary: note,
      scope: 'Power maps x ↦ xᵉ over the BN254 scalar field; a permutation exactly when gcd(e, p − 1) = 1.',
      weak: !ok,
      tags: ['power map', 'exponent', `x^${e}`, ...(ok ? [] : ['negative'])],
      facts: { permutation: ok },
      apply: (s) => ({
        design: { ...baseHades(s), sbox: { kind: 'power', exponent: e } },
        program: keepProgram(s, 'bn254', hadesSharedSum),
        target: s.design.field === 'bn254' ? s.target : 'external',
      }),
    }),
  ),

  /* ---------------- circuits ---------------- */
  circuitPreset({
    id: 'circuit.aes-shared-sum',
    field: 'gf256',
    label: 'AES shared-sum (textbook): 15 XOR, 4 xtime',
    family: 'AES',
    summary: 't = x0 ⊕ x1 ⊕ x2 ⊕ x3, then y_i = x_i ⊕ t ⊕ xtime(x_i ⊕ x_{i+1}).',
    scope: 'Computes AES MixColumns. It matches other matrices only if they equal MixColumns.',
    tags: ['mixcolumns', 'textbook', 'reference'],
    facts: { equivalent: true },
    computes: AES_MIXCOLUMNS,
    program: aesSharedSum,
    target: 'matrix',
  }),
  circuitPreset({
    id: 'circuit.aes-term-by-term',
    field: 'gf256',
    label: 'AES term by term: 12 XOR, 4 xtime, 4 × 03',
    family: 'AES',
    summary: 'y_i = Σ M_ij · x_j, each product computed once.',
    scope: 'A direct baseline for MixColumns, as generated from the matrix. Not optimized.',
    tags: ['mixcolumns', 'direct', 'naive', 'baseline'],
    facts: { equivalent: true },
    computes: AES_MIXCOLUMNS,
    program: () => naiveCircuit(AES_MIXCOLUMNS, 'gf256', 'aes-term-by-term'),
    target: 'matrix',
  }),
  circuitPreset({
    id: 'circuit.aes-miswired',
    field: 'gf256',
    label: 'AES shared-sum with one wrong wire',
    family: 'Teaching',
    summary: 'xtime(x0 ⊕ x1) becomes xtime(x0 ⊕ x2), as in story step 2.',
    scope: 'Deliberately wrong: it does not compute MixColumns, and the equivalence check returns a distinguishing input.',
    weak: true,
    tags: ['bug', 'negative', 'wire'],
    facts: { equivalent: false },
    program: () => miswiredSharedSum(),
    target: 'matrix',
  }),
  circuitPreset({
    id: 'circuit.gf-identity',
    field: 'gf256',
    label: 'Identity circuit (GF(2⁸))',
    family: 'Teaching',
    summary: 'No instructions; y_i = x_i.',
    scope: 'Computes the identity matrix only.',
    tags: ['identity', 'empty'],
    computes: identityMatrix(4, 'gf256'),
    facts: {},
    program: () => identityProgram(4, 'gf256'),
    target: 'matrix',
  }),
  circuitPreset({
    id: 'circuit.bn254-shared-sum',
    field: 'bn254',
    label: 'BN254 shared sum for circ(2, 1, 1): 5 additions',
    family: 'Poseidon2',
    summary: 's = x0 + x1 + x2, then y_i = s + x_i.',
    scope: 'Computes the Poseidon2 t = 3 external matrix; targets the external matrix.',
    tags: ['hades', 'external', 'shared sum'],
    facts: { equivalent: true },
    computes: P2_EXTERNAL,
    program: hadesSharedSum,
    target: 'external',
  }),
  circuitPreset({
    id: 'circuit.bn254-internal-shared-sum',
    field: 'bn254',
    label: 'BN254 internal shared sum: 6 additions, no multiplications',
    family: 'Poseidon2',
    summary: 's = x0 + x1 + x2; y0 = s + x0, y1 = s + x1, y2 = s + (x2 + x2).',
    scope: 'Computes the Poseidon2 t = 3 internal matrix [[2,1,1],[1,2,1],[1,1,3]]; targets the internal matrix.',
    tags: ['hades', 'internal', 'shared sum', 'partial rounds'],
    facts: { equivalent: true },
    computes: P2_INTERNAL,
    program: internalSharedSum,
    target: 'internal',
  }),
];

/** Short, neutral labels for the facts, for chips in the picker. */
export function factLabels(p: Preset): string[] {
  const out: string[] = [];
  const f = p.facts;
  if (f.mds !== undefined) out.push(f.mds ? 'MDS' : 'not MDS');
  if (f.invertible !== undefined) out.push(f.invertible ? 'invertible' : 'singular');
  if (f.permutation !== undefined) out.push(f.permutation ? 'permutation' : 'not a permutation');
  if (f.equivalent !== undefined) out.push(f.equivalent ? 'circuit matches' : 'circuit differs');
  return out;
}

function haystack(p: Preset): string {
  return [
    p.label,
    p.family,
    p.summary,
    p.kind,
    KIND_LABELS[p.kind],
    FIELD_LABELS[p.field],
    p.field,
    p.slot ?? '',
    p.weak ? 'weak' : '',
    ...p.tags,
    ...factLabels(p),
  ]
    .join(' ')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
}

const fold = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');

/**
 * Relevance of a preset for the query words: a word that is a whole token
 * of the label scores 4, a token prefix 2, anywhere else in the preset's
 * text 1, and the words in sequence in the label add 10. Zero when some
 * word does not occur at all.
 */
export function presetScore(p: Preset, words: string[]): number {
  const h = haystack(p);
  const tokens = fold(p.label).split(/[^a-z0-9⁰-⁹]+/).filter(Boolean);
  // The query as a phrase of label tokens ("circ 02 01" in "circ(02, 01, 01, 01)") ranks first.
  const phrase = words.map((w) => w.replace(/[^a-z0-9⁰-⁹]+/g, '')).filter(Boolean).join(' ');
  let score = words.length > 1 && phrase && ` ${tokens.join(' ')} `.includes(` ${phrase}`) ? 10 : 0;
  for (const w of words) {
    if (!h.includes(w)) return 0;
    const bare = w.replace(/[^a-z0-9⁰-⁹]+/g, '');
    if (bare && tokens.includes(bare)) score += 4;
    else if (bare && tokens.some((t) => t.startsWith(bare))) score += 2;
    else score += 1;
  }
  return score;
}

/**
 * Presets whose text contains every word of the query (case-insensitive),
 * best match first; ties keep library order with designs, then matrices,
 * S-boxes and circuits. Commas and brackets in the query are ignored, so
 * "circ(02, 01" finds circ(02, 01, 01, 01).
 */
export function searchPresets(query: string, presets: Preset[] = PRESETS): Preset[] {
  const words = fold(query)
    .split(/[\s,()[\]]+/)
    .filter(Boolean);
  const order: PresetKind[] = ['design', 'matrix', 'sbox', 'circuit'];
  return presets
    .map((p, i) => ({ p, i, score: words.length ? presetScore(p, words) : 1 }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || order.indexOf(a.p.kind) - order.indexOf(b.p.kind) || a.i - b.i)
    .map((x) => x.p);
}

export function presetById(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}
