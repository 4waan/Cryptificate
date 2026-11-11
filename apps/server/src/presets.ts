/**
 * Starting designs for `cryptificate init`. Each is one of the example
 * designs in examples/designs (a test keeps them equal), with an optional
 * reference circuit from examples/programs.
 */
import { designClaimsFor } from '@cryptificate/schema';
import type { CandidateDesign, ModelId, Program } from '@cryptificate/schema';

export type ModelChoice = 'aes-like' | 'hades';

export const MODEL_IDS: Record<ModelChoice, ModelId> = {
  'aes-like': 'aes-like/gf256/v1',
  hades: 'hades/bn254/v1',
};

export interface Preset {
  id: string;
  model: ModelChoice;
  title: string;
  /** The example file the design is taken from. */
  example: string;
  design: CandidateDesign;
  /** A circuit that computes the design's matrix (the external one for HADES). */
  program?: Program;
  programExample?: string;
}

const AES_MATRIX = [
  ['02', '03', '01', '01'],
  ['01', '02', '03', '01'],
  ['01', '01', '02', '03'],
  ['03', '01', '01', '02'],
];

/** The shared-sum MixColumns circuit: 4 xtime and 15 XOR. */
const AES_SHARED_SUM: Program = {
  field: 'gf256',
  width: 4,
  name: 'aes-shared-sum',
  instructions: [
    { op: 'add', a: 0, b: 1 },
    { op: 'add', a: 4, b: 2 },
    { op: 'add', a: 5, b: 3 },
    { op: 'add', a: 0, b: 1 },
    { op: 'mul', k: '02', a: 7 },
    { op: 'add', a: 0, b: 8 },
    { op: 'add', a: 9, b: 6 },
    { op: 'add', a: 1, b: 2 },
    { op: 'mul', k: '02', a: 11 },
    { op: 'add', a: 1, b: 12 },
    { op: 'add', a: 13, b: 6 },
    { op: 'add', a: 2, b: 3 },
    { op: 'mul', k: '02', a: 15 },
    { op: 'add', a: 2, b: 16 },
    { op: 'add', a: 17, b: 6 },
    { op: 'add', a: 3, b: 0 },
    { op: 'mul', k: '02', a: 19 },
    { op: 'add', a: 3, b: 20 },
    { op: 'add', a: 21, b: 6 },
  ],
  outputs: [10, 14, 18, 22],
};

/** The width-3 external layer [[2,1,1],[1,2,1],[1,1,2]] as a shared sum: 5 additions. */
const BN254_EXTERNAL_SHARED_SUM: Program = {
  field: 'bn254',
  width: 3,
  name: 'bn254-shared-sum',
  instructions: [
    { op: 'add', a: 0, b: 1 },
    { op: 'add', a: 3, b: 2 },
    { op: 'add', a: 4, b: 0 },
    { op: 'add', a: 4, b: 1 },
    { op: 'add', a: 4, b: 2 },
  ],
  outputs: [5, 6, 7],
};

export const PRESETS: readonly Preset[] = [
  {
    id: 'aes',
    model: 'aes-like',
    title: 'AES MixColumns, ShiftRows offsets and S-box',
    example: 'examples/designs/aes.json',
    design: { model: 'aes-like/gf256/v1', field: 'gf256', width: 4, matrix: AES_MATRIX, offsets: [0, 1, 2, 3], rounds: 4, sbox: { kind: 'aes' } },
    program: AES_SHARED_SUM,
    programExample: 'examples/programs/aes-known-shared-sum.json',
  },
  {
    id: 'aes-row-scaled',
    model: 'aes-like',
    title: 'AES with the first matrix row scaled by 02 (another MDS matrix)',
    example: 'examples/designs/aes-row-scaled.json',
    design: {
      model: 'aes-like/gf256/v1',
      field: 'gf256',
      width: 4,
      matrix: [['04', '06', '02', '02'], ...AES_MATRIX.slice(1)],
      offsets: [0, 1, 2, 3],
      rounds: 4,
      sbox: { kind: 'aes' },
    },
  },
  {
    id: 'poseidon2-bn254',
    model: 'hades',
    title: 'Poseidon2 width-3 linear layers over BN254, S-box x^5',
    example: 'examples/designs/poseidon2-bn254.json',
    design: {
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
      sbox: { kind: 'power', exponent: 5 },
      partialMask: [true, false, false],
      constants: { kind: 'reference' },
    },
    program: BN254_EXTERNAL_SHARED_SUM,
    programExample: 'examples/programs/poseidon2-external-shared-sum.json',
  },
];

export const DEFAULT_PRESET: Record<ModelChoice, string> = { 'aes-like': 'aes', hades: 'poseidon2-bn254' };

export function findPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

/**
 * The claim scope `init` writes: the design claims of the model and, with a
 * circuit, circuit equivalence and native correctness. Rust-source refinement
 * (it covers the GF(2^8) arithmetic primitives, needs a separate Lean build
 * that CI does not run, and is unsupported for BN254) and timing (measured by
 * experiments only) are left out of the scope.
 */
export function defaultClaims(model: ModelChoice, withCircuit: boolean): string[] {
  const ids = designClaimsFor(MODEL_IDS[model]).map((c) => c.id as string);
  return withCircuit ? [...ids, 'circuit.equivalence', 'native.correctness'] : ids;
}
