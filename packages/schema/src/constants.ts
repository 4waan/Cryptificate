import type {
  ClaimChain,
  ClaimId,
  ClaimStatus,
  ExecutionState,
  ExperimentProfile,
  JobState,
  ModelId,
  Origin,
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

export const MODELS: readonly ModelId[] = ['aes-like/gf256/v1', 'hades/bn254/v1'];

export const PROFILES: readonly ExperimentProfile[] = ['quick', 'research'];

/** Axioms a Lean certificate may depend on. Anything else is rejected. */
export const ALLOWED_AXIOMS: readonly string[] = ['propext', 'Classical.choice', 'Quot.sound'];

/** BN254 scalar field modulus. */
export const BN254_MODULUS =
  '21888242871839275222246405745257275088548364400416034343698204186575808495617';

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
];

export const HADES_DESIGN_CLAIMS: readonly ClaimInfo[] = [
  { id: 'external.mds', chain: 'design', title: 'External matrix is MDS (branch number 4)' },
  { id: 'internal.invertible', chain: 'design', title: 'Internal matrix is invertible' },
  { id: 'sbox.bijective', chain: 'design', title: 'Power S-box is a permutation' },
  { id: 'activity.outer', chain: 'design', title: 'Active S-box bound for the full rounds' },
];

export const IMPLEMENTATION_CLAIMS: readonly ClaimInfo[] = [
  { id: 'circuit.equivalence', chain: 'implementation', title: 'Circuit computes the design matrix' },
  { id: 'native.correctness', chain: 'implementation', title: 'Generated Rust matches the reference' },
  { id: 'rust.refinement', chain: 'implementation', title: 'Rust kernel refines the Lean model' },
  { id: 'native.timing', chain: 'implementation', title: 'Native speed on this machine' },
];

export function designClaimsFor(model: ModelId): readonly ClaimInfo[] {
  return model === 'hades/bn254/v1' ? HADES_DESIGN_CLAIMS : AES_LIKE_DESIGN_CLAIMS;
}

/**
 * Active S-box lower bound for an AES-like design with an MDS matrix and
 * pairwise distinct offsets: floor(r/4)*25 + (5 if r mod 4 >= 2 else 0).
 */
export function aesLikeActivityBound(rounds: number): number {
  return Math.floor(rounds / 4) * 25 + (rounds % 4 >= 2 ? 5 : 0);
}

/**
 * Active S-box lower bound for the full rounds of a width-3 HADES design with
 * an MDS external matrix, an invertible internal matrix and a bijective power
 * map. With h = fullRounds / 2 full rounds on each side of the partial rounds,
 * each side charges 4 (the branch number) per pair of adjacent rounds and 1
 * for an odd round left over; partial rounds are not counted. This is
 * `(h / 2 + h / 2) * 4 + h % 2 + h % 2`, the bound of the Lean theorem
 * `hades_activity`.
 */
export function hadesOuterActivityBound(fullRounds: number): number {
  const h = Math.floor(fullRounds / 2);
  return 2 * (4 * Math.floor(h / 2) + (h % 2));
}

/** Plain-language wording for a claim that is not established. */
export const NOT_ESTABLISHED_TEXT = 'not established by this method';
