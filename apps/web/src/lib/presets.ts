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
