import type {
  ClaimChain,
  ClaimId,
  ClaimStatus,
  ExecutionState,
  ExperimentProfile,
  JobState,
  ModelId,
  Origin,
  PrimeFieldName,
  StepState,
} from './types.js';

/** Exact evidence labels shown in the UI and written to reports. */
export const EVIDENCE_LABELS = {
  leanProof: 'Lean-checked proof',
  leanCircuitEquivalence: 'Lean-checked circuit equivalence',
  leanCounterexample: 'Lean-checked counterexample',
  rustRefinement: 'Rust-source refinement (Aeneas)',
  nativeTiming: 'Native timing measured on this machine',
  uncheckedDiagnostic: 'Unchecked diagnostic',
} as const;

/** "Generated Rust passed N correctness cases" for a concrete N. */
export function nativeCorrectnessLabel(cases: number): string {
  return `Generated Rust passed ${cases} correctness cases`;
}

/** Matches every evidence label, including the parametrised native one. */
export function isEvidenceLabel(label: string): boolean {
  if ((Object.values(EVIDENCE_LABELS) as string[]).includes(label)) return true;
  return /^Generated Rust passed \d+ correctness cases$/.test(label);
}

export const CLAIM_STATUSES: readonly ClaimStatus[] = [
  'proved',
  'refuted',
  'not_established',
  'unsupported',
];

export const EXECUTION_STATES: readonly ExecutionState[] = [
  'completed',
  'failed',
  'timeout',
  'cancelled',
  'invalid',
];

export const JOB_STATES: readonly JobState[] = ['queued', 'running', ...EXECUTION_STATES];

export const TERMINAL_JOB_STATES: readonly JobState[] = EXECUTION_STATES;

export const STEP_STATES: readonly StepState[] = [
  'pending',
  'running',
  'completed',
  'failed',
  'timeout',
  'cancelled',
  'invalid',
  'skipped',
  'not_run',
];

export const ORIGINS: readonly Origin[] = ['live', 'cached', 'recorded'];

export const MODELS: readonly ModelId[] = ['aes-like/gf256/v1', 'hades/bn254/v1', 'hades/prime/v1'];

export const PROFILES: readonly ExperimentProfile[] = ['quick', 'research'];

/** Axioms a Lean certificate may depend on. Anything else is rejected. */
export const ALLOWED_AXIOMS: readonly string[] = ['propext', 'Classical.choice', 'Quot.sound'];

/** BN254 scalar field modulus. */
export const BN254_MODULUS =
  '21888242871839275222246405745257275088548364400416034343698204186575808495617';

export interface PrimeFieldPreset {
  id: Exclude<PrimeFieldName, 'prime'>;
  label: string;
  modulus: string;
  /** How the modulus is usually written. */
  form: string;
  /** Prime factorization of p - 1, which decides the permutation exponents. */
  pMinusOne: string;
}

/** The named fields of the prime-field profile (`hades/prime/v1`). */
export const PRIME_FIELD_PRESETS: readonly PrimeFieldPreset[] = [
  { id: 'babybear', label: 'BabyBear', modulus: '2013265921', form: '15 · 2^27 + 1', pMinusOne: '2^27 · 3 · 5' },
  { id: 'koalabear', label: 'KoalaBear', modulus: '2130706433', form: '127 · 2^24 + 1', pMinusOne: '2^24 · 127' },
  { id: 'mersenne31', label: 'Mersenne31', modulus: '2147483647', form: '2^31 - 1', pMinusOne: '2 · 3^2 · 7 · 11 · 31 · 151 · 331' },
  {
    id: 'goldilocks',
    label: 'Goldilocks',
    modulus: '18446744069414584321',
    form: '2^64 - 2^32 + 1',
    pMinusOne: '2^32 · 3 · 5 · 17 · 257 · 65537',
  },
];

/** Widths of the prime-field profile. */
export const PRIME_WIDTHS: readonly number[] = [3, 4];

/** Custom moduli must be below 2^64 (and prime; the engine decides that). */
export const PRIME_MODULUS_LIMIT = 18446744073709551616n;

export const LIMITS = {
  /** Maximum JSON request body. */
  maxBodyBytes: 256 * 1024,
  maxInstructions: 256,
  minRounds: 4,
  maxRounds: 32,
  maxHadesRounds: 160,
  maxExponent: 65535,
  /** Jobs waiting behind the running one. */
  maxQueued: 2,
  maxSeedHexLength: 64,
  maxProgramNameLength: 128,
} as const;

export interface ClaimInfo {
  id: ClaimId;
  chain: ClaimChain;
  title: string;
}

/** Fixed claim ids, their chain and display title, per design model. */
export const AES_LIKE_DESIGN_CLAIMS: readonly ClaimInfo[] = [
  { id: 'matrix.mds', chain: 'design', title: 'Matrix is MDS (branch number 5)' },
  { id: 'offsets.dispersion', chain: 'design', title: 'Row offsets are pairwise distinct' },
  { id: 'sbox.bijective', chain: 'design', title: 'S-box is a permutation' },
  { id: 'activity.bound', chain: 'design', title: 'Active S-box lower bound' },
  { id: 'sbox.differential', chain: 'design', title: 'Differential uniformity of the S-box table' },
  { id: 'sbox.linearity', chain: 'design', title: 'Linearity of the S-box table' },
];

/** The claims of a HADES design over a prime field below 2^64. */
export const HADES_PRIME_DESIGN_CLAIMS: readonly ClaimInfo[] = [
  { id: 'field.prime', chain: 'design', title: 'Modulus is prime' },
  { id: 'external.mds', chain: 'design', title: 'External matrix is MDS (branch number width + 1)' },
  { id: 'internal.invertible', chain: 'design', title: 'Internal matrix is invertible' },
  { id: 'sbox.bijective', chain: 'design', title: 'Power S-box is a permutation' },
  { id: 'activity.outer', chain: 'design', title: 'Active S-box bound for the full rounds' },
  { id: 'activity.partial', chain: 'design', title: 'No difference passes the partial rounds without an active S-box' },
  { id: 'activity.total', chain: 'design', title: 'Active S-box bound over the whole permutation' },
];

export const HADES_DESIGN_CLAIMS: readonly ClaimInfo[] = [
  { id: 'external.mds', chain: 'design', title: 'External matrix is MDS (branch number 4)' },
  { id: 'internal.invertible', chain: 'design', title: 'Internal matrix is invertible' },
  { id: 'sbox.bijective', chain: 'design', title: 'Power S-box is a permutation' },
  { id: 'activity.outer', chain: 'design', title: 'Active S-box bound for the full rounds' },
  { id: 'activity.partial', chain: 'design', title: 'No difference passes the partial rounds without an active S-box' },
  { id: 'activity.total', chain: 'design', title: 'Active S-box bound over the whole permutation' },
];

export const IMPLEMENTATION_CLAIMS: readonly ClaimInfo[] = [
  { id: 'circuit.equivalence', chain: 'implementation', title: 'Circuit computes the design matrix' },
  { id: 'native.correctness', chain: 'implementation', title: 'Generated Rust matches the reference' },
  { id: 'rust.refinement', chain: 'implementation', title: 'Rust kernel refines the Lean model' },
  { id: 'native.timing', chain: 'implementation', title: 'Native speed on this machine' },
];

export function designClaimsFor(model: ModelId): readonly ClaimInfo[] {
  if (model === 'hades/prime/v1') return HADES_PRIME_DESIGN_CLAIMS;
  return model === 'hades/bn254/v1' ? HADES_DESIGN_CLAIMS : AES_LIKE_DESIGN_CLAIMS;
}

/** The title of `external.mds` for a HADES design of the given width. */
export function externalMdsTitle(width: number): string {
  return `External matrix is MDS (branch number ${width + 1})`;
}

/**
 * Active S-box lower bound for an AES-like design with an MDS matrix and
 * pairwise distinct offsets: floor(r/4)*25 + (5 if r mod 4 >= 2 else 0).
 */
export function aesLikeActivityBound(rounds: number): number {
  return Math.floor(rounds / 4) * 25 + (rounds % 4 >= 2 ? 5 : 0);
}

/**
 * Active S-box lower bound for the full rounds of a width-3 HADES design; see
 * `hadesOuterActivityBoundWidth`.
 */
export function hadesOuterActivityBound(fullRounds: number): number {
  return hadesOuterActivityBoundWidth(fullRounds, 3);
}

/**
 * Active S-box lower bound for the full rounds of a HADES design of width
 * `width` with an MDS external matrix, an invertible internal matrix and a
 * bijective power map. With h = fullRounds / 2 full rounds on
 * each side of the partial rounds, each side charges width + 1 (the branch
 * number) per pair of adjacent rounds and 1 for an odd round left over;
 * partial rounds are not counted. This is
 * `(h / 2 + h / 2) * (width + 1) + h % 2 + h % 2`, the bound of the Lean
 * theorem `hades_activity`.
 */
export function hadesOuterActivityBoundWidth(fullRounds: number, width: number): number {
  const h = Math.floor(fullRounds / 2);
  return 2 * ((width + 1) * Math.floor(h / 2) + (h % 2));
}

/**
 * Active S-box lower bound over the whole permutation of a width-3 HADES
 * design; see `hadesTotalActivityBoundWidth`.
 */
export function hadesTotalActivityBound(fullRounds: number, partialRounds: number, window: number): number {
  return hadesTotalActivityBoundWidth(fullRounds, partialRounds, window, 3);
}

/**
 * Active S-box lower bound over the whole permutation of a HADES design of
 * width `width` whose full-round bound applies and whose internal matrix charges
 * every window of `window` consecutive partial rounds: the full-round bound
 * plus one for each of the `floor(partialRounds / window)` disjoint windows.
 * The bound of the Lean theorem `hades_total_activity`.
 */
export function hadesTotalActivityBoundWidth(fullRounds: number, partialRounds: number, window: number, width: number): number {
  return hadesOuterActivityBoundWidth(fullRounds, width) + (window > 0 ? Math.floor(partialRounds / window) : 0);
}

/** Plain-language wording for a claim that is not established. */
export const NOT_ESTABLISHED_TEXT = 'not established by this method';
