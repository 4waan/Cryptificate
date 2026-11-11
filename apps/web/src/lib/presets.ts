import { identityMatrix } from './design';
import type { AesLikeDesign, HadesDesign, HadesPrimeDesign, Instruction, Program } from './types';

export const AES_MIXCOLUMNS: string[][] = [
  ['02', '03', '01', '01'],
  ['01', '02', '03', '01'],
  ['01', '01', '02', '03'],
  ['03', '01', '01', '02'],
];

export function aesDesign(rounds = 4): AesLikeDesign {
  return {
    model: 'aes-like/gf256/v1',
    field: 'gf256',
    width: 4,
    matrix: AES_MIXCOLUMNS.map((r) => [...r]),
    offsets: [0, 1, 2, 3],
    rounds,
    sbox: { kind: 'aes' },
  };
}

const add = (a: number, b: number): Instruction => ({ op: 'add', a, b });
const xt = (a: number): Instruction => ({ op: 'mul', k: '02', a });

/**
 * The textbook MixColumns column: t = x0 ⊕ x1 ⊕ x2 ⊕ x3 and
 * y_i = x_i ⊕ t ⊕ xtime(x_i ⊕ x_{i+1}). 15 XORs and 4 xtimes.
 */
export function aesSharedSum(): Program {
  return {
    field: 'gf256',
    width: 4,
    name: 'aes-shared-sum',
    instructions: [
      add(0, 1), // r4 = x0 ⊕ x1
      add(4, 2), // r5
      add(5, 3), // r6 = t
      add(0, 1), // r7 = x0 ⊕ x1
      xt(7), // r8 = xtime(x0 ⊕ x1)
      add(0, 8), // r9
      add(9, 6), // r10 = y0
      add(1, 2), // r11
      xt(11), // r12
      add(1, 12), // r13
      add(13, 6), // r14 = y1
      add(2, 3), // r15
      xt(15), // r16
      add(2, 16), // r17
      add(17, 6), // r18 = y2
      add(3, 0), // r19
      xt(19), // r20
      add(3, 20), // r21
      add(21, 6), // r22 = y3
    ],
    outputs: [10, 14, 18, 22],
  };
}

/** Instruction index of the first output's pair sum, the input of xtime(x0 ⊕ x1). */
export const WIRE_STEP_INSTRUCTION = 3;
/** The xtime instruction that reads it. */
export const WIRE_STEP_XTIME = 4;

/** Story step 2: the first output's xtime(x0 ⊕ x1) becomes xtime(x0 ⊕ x2). */
export function miswiredSharedSum(p: Program = aesSharedSum()): Program {
  return {
    ...p,
    instructions: p.instructions.map((ins, i) => (i === WIRE_STEP_INSTRUCTION ? add(0, 2) : ins)),
  };
}

export function identityDesign(rounds = 4): AesLikeDesign {
  return { ...aesDesign(rounds), matrix: identityMatrix(4, 'gf256') };
}

export function identityProgram(width = 4, field: 'gf256' | 'bn254' = 'gf256'): Program {
  return { field, width, name: 'identity', instructions: [], outputs: Array.from({ length: width }, (_, i) => i) };
}

export function hadesDesign(exponent = 5): HadesDesign {
  return {
    model: 'hades/bn254/v1',
    field: 'bn254',
    width: 3,
    external: [
      ['2', '1', '1'],
      ['1', '2', '1'],
      ['1', '1', '2'],
    ],
    internal: [
      ['2', '1', '1'],
      ['1', '2', '1'],
      ['1', '1', '3'],
    ],
    fullRounds: 8,
    partialRounds: 56,
    sbox: { kind: 'power', exponent },
    partialMask: [true, false, false],
    constants: { kind: 'reference' },
  };
}

/** s = x0 + x1 + x2; y_i = s + x_i. Implements [[2,1,1],[1,2,1],[1,1,2]]. */
export function hadesSharedSum(): Program {
  return {
    field: 'bn254',
    width: 3,
    name: 'bn254-shared-sum',
    instructions: [add(0, 1), add(3, 2), add(4, 0), add(4, 1), add(4, 2)],
    outputs: [5, 6, 7],
  };
}

/** The fresh-input gate: AES with its first row doubled, [04, 06, 02, 02]. */
export function rowScaledAesDesign(): AesLikeDesign {
  const d = aesDesign();
  d.matrix[0] = ['04', '06', '02', '02'];
  return d;
}

/** Poseidon2's 4 × 4 matrix M4, the external matrix of a width-4 design. */
export const POSEIDON2_M4 = [
  ['5', '7', '1', '3'],
  ['4', '6', '1', '1'],
  ['1', '3', '5', '7'],
  ['1', '1', '4', '6'],
];

/** An internal matrix of the Poseidon2 form 1·1ᵀ + diag(1, 2, 4, 8), for width 4. */
export const INTERNAL_4 = [
  ['2', '1', '1', '1'],
  ['1', '3', '1', '1'],
  ['1', '1', '5', '1'],
  ['1', '1', '1', '9'],
];

/**
 * The prime-field examples of the repository: width 4 over KoalaBear with
 * x^3 and 20 partial rounds (examples/designs/koalabear-t4.json), or over
 * BabyBear with x^7 and 13 partial rounds (babybear-t4.json); other fields
 * get the KoalaBear parameters with x^5. Chosen for illustration, not
 * deployed instances.
 */
export function primeDesign(field: HadesPrimeDesign['field'] = 'koalabear', modulus?: string): HadesPrimeDesign {
  const exponent = field === 'koalabear' ? 3 : field === 'babybear' ? 7 : 5;
  return {
    model: 'hades/prime/v1',
    field,
    ...(modulus !== undefined ? { modulus } : {}),
    width: 4,
    external: POSEIDON2_M4.map((r) => [...r]),
    internal: INTERNAL_4.map((r) => [...r]),
    fullRounds: 8,
    partialRounds: field === 'babybear' ? 13 : 20,
    sbox: { kind: 'power', exponent },
    partialMask: [true, false, false, false],
  };
}

/** The same design at width 3: Poseidon2's width-3 matrices. */
export function primeDesign3(field: HadesPrimeDesign['field'], modulus?: string): HadesPrimeDesign {
  const h = hadesDesign();
  return {
    ...primeDesign(field, modulus),
    width: 3,
    external: h.external,
    internal: h.internal,
    partialMask: [true, false, false],
  };
}

/**
 * The Poseidon2 external matrix of width `t`: `[[2, 1], [1, 2]]` for
 * t = 2, `circ(2 M4, M4, …, M4)` with M4 = `POSEIDON2_M4_PLONKY3` for a
 * multiple of 4 (2 M4 for t = 4), as Plonky3's `mds_light_permutation`.
 */
export function poseidon2External(t: number): string[][] {
  if (t === 2) {
    return [
      ['2', '1'],
      ['1', '2'],
    ];
  }
  return Array.from({ length: t }, (_, i) =>
    Array.from({ length: t }, (_, j) => {
      const m = Number(POSEIDON2_M4_PLONKY3[i % 4]![j % 4]);
      return String(Math.floor(i / 4) === Math.floor(j / 4) ? 2 * m : m);
    }),
  );
}

/** Plonky3's 4 × 4 block `MDSMat4` (poseidon2/src/external.rs). */
export const POSEIDON2_M4_PLONKY3 = [
  ['2', '3', '1', '1'],
  ['1', '2', '3', '1'],
  ['1', '1', '2', '3'],
  ['3', '1', '1', '2'],
];

/** The Plonky3 commit the presets below were read from. */
export const PLONKY3_COMMIT = '0d803737b681774186cd283b1fd2d8e493655c82';

/** A deployed Poseidon2 instance whose linear layers and rounds are public. */
export interface Poseidon2Preset {
  field: 'babybear' | 'koalabear' | 'goldilocks' | 'mersenne31';
  width: 8 | 12 | 16 | 24;
  fullRounds: number;
  partialRounds: number;
  exponent: number;
  /** `V` of the internal matrix `1·1ᵀ + diag(V)`, as the source writes it. */
  diagonal: readonly string[];
  /** The file of the Plonky3 repository at `PLONKY3_COMMIT`. */
  source: string;
}

const M31_16 = ['-2', ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 13, 14, 15, 16].map((k) => `2^${k}`)];
const M31_24 = ['-2', ...Array.from({ length: 23 }, (_, k) => `2^${k}`)];

/**
 * Plonky3's Poseidon2 instances: internal diagonals, round numbers and
 * S-box exponents of `baby-bear`, `koala-bear`, `goldilocks` and
 * `mersenne-31` at `PLONKY3_COMMIT`; the external matrix is
 * `poseidon2External`. Round constants are not part of a design.
 */
export const PLONKY3_PRESETS: readonly Poseidon2Preset[] = [
  {
    field: 'babybear',
    width: 16,
    fullRounds: 8,
    partialRounds: 13,
    exponent: 7,
    diagonal: [
      '-2',
      '1',
      '2',
      '1/2',
      '3',
      '4',
      '-1/2',
      '-3',
      '-4',
      '1/2^8',
      '1/4',
      '1/8',
      '1/2^27',
      '-1/2^8',
      '-1/16',
      '-1/2^27',
    ],
    source: 'baby-bear/src/poseidon2.rs',
  },
  {
    field: 'babybear',
    width: 24,
    fullRounds: 8,
    partialRounds: 21,
    exponent: 7,
    diagonal: [
      '-2',
      '1',
      '2',
      '1/2',
      '3',
      '4',
      '-1/2',
      '-3',
      '-4',
      '1/2^8',
      '1/4',
      '1/8',
      '1/16',
      '1/2^7',
      '1/2^9',
      '1/2^27',
      '-1/2^8',
      '-1/4',
      '-1/8',
      '-1/16',
      '-1/32',
      '-1/64',
      '-1/2^7',
      '-1/2^27',
    ],
    source: 'baby-bear/src/poseidon2.rs',
  },
  {
    field: 'koalabear',
    width: 16,
    fullRounds: 8,
    partialRounds: 20,
    exponent: 3,
    diagonal: [
      '-2',
      '1',
      '2',
      '1/2',
      '3',
      '4',
      '-1/2',
      '-3',
      '-4',
      '1/2^8',
      '1/8',
      '1/2^24',
      '-1/2^8',
      '-1/8',
      '-1/16',
      '-1/2^24',
    ],
    source: 'koala-bear/src/poseidon2.rs',
  },
  {
    field: 'koalabear',
    width: 24,
    fullRounds: 8,
    partialRounds: 23,
    exponent: 3,
    diagonal: [
      '-2',
      '1',
      '2',
      '1/2',
      '3',
      '4',
      '-1/2',
      '-3',
      '-4',
      '1/2^8',
      '1/4',
      '1/8',
      '1/16',
      '1/32',
      '1/64',
      '1/2^24',
      '-1/2^8',
      '-1/8',
      '-1/16',
      '-1/32',
      '-1/64',
      '-1/2^7',
      '-1/2^9',
      '-1/2^24',
    ],
    source: 'koala-bear/src/poseidon2.rs',
  },
  {
    field: 'goldilocks',
    width: 8,
    fullRounds: 8,
    partialRounds: 22,
    exponent: 7,
    diagonal: ['-2', '1', '2', '1/2', '3', '-1/2', '-3', '-4'],
    source: 'goldilocks/src/poseidon2.rs',
  },
  {
    field: 'goldilocks',
    width: 12,
    fullRounds: 8,
    partialRounds: 22,
    exponent: 7,
    diagonal: ['-2', '1', '2', '1/2', '3', '4', '-1/2', '-3', '-4', '1/4', '-1/4', '1/8'],
    source: 'goldilocks/src/poseidon2.rs',
  },
  {
    field: 'mersenne31',
    width: 16,
    fullRounds: 8,
    partialRounds: 14,
    exponent: 5,
    diagonal: M31_16,
    source: 'mersenne-31/src/poseidon2.rs',
  },
  {
    field: 'mersenne31',
    width: 24,
    fullRounds: 8,
    partialRounds: 22,
    exponent: 5,
    diagonal: M31_24,
    source: 'mersenne-31/src/poseidon2.rs',
  },
];

function modPow(b: bigint, e: bigint, p: bigint): bigint {
  let r = 1n;
  b %= p;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % p;
    b = (b * b) % p;
    e >>= 1n;
  }
  return r;
}

/** `-2`, `3`, `1/2^8`, `-1/16`, `2^7`, … as a residue modulo the prime `p`. */
export function diagonalEntry(text: string, p: bigint): string {
  const neg = text.startsWith('-');
  const body = neg ? text.slice(1) : text;
  const value = (s: string): bigint => {
    const m = /^(\d+)\^(\d+)$/.exec(s);
    return m ? modPow(BigInt(m[1]!), BigInt(m[2]!), p) : BigInt(s) % p;
  };
  const [num, den] = body.split('/');
  let v = value(num!);
  if (den !== undefined) v = (v * modPow(value(den), p - 2n, p)) % p;
  return (neg ? (p - v) % p : v).toString();
}

/** The internal matrix `1·1ᵀ + diag(V)` modulo `p`, with `V` as the source writes it. */
export function onePlusDiagonal(diagonal: readonly string[], p: bigint): string[][] {
  const v = diagonal.map((d) => diagonalEntry(d, p));
  return v.map((vi, i) => v.map((_, j) => (i === j ? ((BigInt(vi) + 1n) % p).toString() : '1')));
}

/** The Plonky3 preset of a named field and width, if there is one. */
export function plonky3Preset(field: HadesPrimeDesign['field'], width: number): Poseidon2Preset | undefined {
  return PLONKY3_PRESETS.find((x) => x.field === field && x.width === width);
}

/** A Plonky3 instance as a design. */
export function plonky3Design(preset: Poseidon2Preset, modulus: bigint): HadesPrimeDesign {
  return {
    model: 'hades/prime/v1',
    field: preset.field,
    width: preset.width,
    external: poseidon2External(preset.width),
    internal: onePlusDiagonal(preset.diagonal, modulus),
    fullRounds: preset.fullRounds,
    partialRounds: preset.partialRounds,
    sbox: { kind: 'power', exponent: preset.exponent },
    partialMask: Array.from({ length: preset.width }, (_, i) => i === 0),
  };
}

/**
 * A prime-field design of width 2, 8, 12, 16 or 24 with the Poseidon2
 * external matrix and, for illustration, the internal matrix
 * `1·1ᵀ + diag(1, 2, …, t)`; the Plonky3 presets give the deployed ones.
 */
export function primeDesignWide(
  field: HadesPrimeDesign['field'],
  width: 2 | 8 | 12 | 16 | 24,
  modulus?: string,
): HadesPrimeDesign {
  return {
    ...primeDesign(field, modulus),
    width,
    external: poseidon2External(width),
    internal: Array.from({ length: width }, (_, i) =>
      Array.from({ length: width }, (_, j) => (i === j ? String(i + 2) : '1')),
    ),
    partialMask: Array.from({ length: width }, (_, i) => i === 0),
  };
}
