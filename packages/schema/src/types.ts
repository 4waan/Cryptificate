/**
 * Public JSON types exchanged between the Cryptificate engine, the local
 * service, the web UI and the Python client.
 *
 * Field elements are always strings: GF(2^8) elements are two-digit hex
 * strings ("02", "1B"), BN254 scalars are canonical decimal strings.
 * Counts, indices and measurements are JSON numbers.
 */

// ---------------------------------------------------------------------------
// Field encodings

/** GF(2^8) element: two hex digits, canonical output uppercase without prefix. */
export type GfHex = string;
/** BN254 scalar field element: canonical decimal string in [0, p). */
export type BnDecimal = string;
/** Either encoding, depending on the field of the enclosing object. */
export type FieldElement = GfHex | BnDecimal;

export type FieldName = 'gf256' | 'bn254';
export type ModelId = 'aes-like/gf256/v1' | 'hades/bn254/v1';

// ---------------------------------------------------------------------------
// Candidate designs

export interface SboxAes {
  kind: 'aes';
}

export interface SboxTable {
  kind: 'table';
  /** 256 GF(2^8) elements, entry i is S(i). */
  table: GfHex[];
}

export interface SboxPower {
  kind: 'power';
  /** x -> x^exponent, 1..65535. */
  exponent: number;
}

export interface AesLikeDesign {
  model: 'aes-like/gf256/v1';
  field: 'gf256';
  /** 4; widths 2 and 3 are accepted only with `experimental: true`. */
  width: number;
  /** Row-major width x width matrix, y = M x. */
  matrix: GfHex[][];
  /** Row shift offsets, each 0..width-1. */
  offsets: number[];
  /** 4..32 */
  rounds: number;
  sbox: SboxAes | SboxTable;
  /** Set (by normalization) for the experimental widths 2 and 3. */
  experimental?: boolean;
}

export interface ReferenceConstants {
  kind: 'reference';
}

export interface ExplicitConstants {
  kind: 'explicit';
  /** One row of `width` elements per round; length fullRounds + partialRounds. */
  values: BnDecimal[][];
}

export interface HadesDesign {
  model: 'hades/bn254/v1';
  field: 'bn254';
  width: 3;
  external: BnDecimal[][];
  internal: BnDecimal[][];
  /** Even; half before and half after the partial rounds. */
  fullRounds: number;
  partialRounds: number;
  sbox: SboxPower;
  /** S-box positions active in partial rounds. */
  partialMask: boolean[];
  constants: ReferenceConstants | ExplicitConstants;
}

export type CandidateDesign = AesLikeDesign | HadesDesign;

// ---------------------------------------------------------------------------
// Programs (linear circuits)

/** Register `a` plus register `b` (XOR over GF(2^8)). */
export interface AddInstruction {
  op: 'add';
  a: number;
  b: number;
}

/** Public constant `k` times register `a`. */
export interface MulInstruction {
  op: 'mul';
  k: FieldElement;
  a: number;
}

export type Instruction = AddInstruction | MulInstruction;

/**
 * Registers 0..width-1 are the inputs; instruction i defines register
 * width + i. `outputs` lists one register per output coordinate.
 */
export interface Program {
  field: FieldName;
  width: number;
  name?: string;
  instructions: Instruction[];
  outputs: number[];
}

// ---------------------------------------------------------------------------
// Requests

/** Which matrix of the design the program must implement. */
export type ProgramTarget = 'matrix' | 'external' | 'internal';

export interface AnalysisRequest {
  design: CandidateDesign;
  program?: Program;
  /** Defaults to "matrix" (AES-like) or "external" (HADES). */
  target?: ProgramTarget;
}

export type ExperimentProfile = 'quick' | 'research';

export interface ExperimentRequest {
  design: CandidateDesign;
  program?: Program;
  profile: ExperimentProfile;
  /** Hex string; generated and recorded when absent. */
  seed?: string;
}

// ---------------------------------------------------------------------------
// Claims and evidence

export type DesignClaimId =
  | 'matrix.mds'
  | 'offsets.dispersion'
  | 'sbox.bijective'
  | 'activity.bound'
  | 'external.mds'
  | 'internal.invertible'
  | 'activity.outer';

export type ImplementationClaimId =
  | 'circuit.equivalence'
  | 'native.correctness'
  | 'rust.refinement'
  | 'native.timing';

export type ClaimId = DesignClaimId | ImplementationClaimId;

export type ClaimChain = 'design' | 'implementation';

/** What a claim's evidence establishes. A timeout is never a refutation. */
export type ClaimStatus = 'proved' | 'refuted' | 'not_established' | 'unsupported';

export type EvidenceKind = 'lean' | 'native' | 'measurement' | 'refinement' | 'diagnostic';

export interface Evidence {
  kind: EvidenceKind;
  /** One of the exact strings in EVIDENCE_LABELS (see constants). */
  label: string;
  /** Fully qualified Lean theorem name, for kind "lean". */
  theorem?: string;
  /** Pretty-printed theorem type as reported by the Lean audit. */
  type?: string;
  /** Axioms the theorem depends on, as reported by the Lean audit. */
  axioms?: string[];
  /** Number of native correctness cases, for kind "native". */
  cases?: number;
}

export interface BranchWitness {
  kind: 'branch';
  input: GfHex[] | BnDecimal[];
  output: GfHex[] | BnDecimal[];
  inputWeight: number;
  outputWeight: number;
  /** The branch-number bound the vector falls short of (width + 1). */
  bound: number;
}

export interface OffsetCollisionWitness {
  kind: 'offset-collision';
  rows: number[];
  offset: number;
}

export interface DistinguishingInputWitness {
  kind: 'distinguishing-input';
  input: FieldElement[];
  expected: FieldElement[];
  actual: FieldElement[];
  /** Output coordinates where expected and actual differ. */
  differing: number[];
}

export interface SboxCollisionWitness {
  kind: 'sbox-collision';
  x1: GfHex;
  x2: GfHex;
  y: GfHex;
}

export interface PowerCollisionWitness {
  kind: 'power-collision';
  exponent: number;
  x1: BnDecimal;
  x2: BnDecimal;
  note: string;
}

export type Witness =
  | BranchWitness
  | OffsetCollisionWitness
  | DistinguishingInputWitness
  | SboxCollisionWitness
  | PowerCollisionWitness;

export type WitnessKind = Witness['kind'];

/**
 * Machine-readable reason attached to a claim that is not established.
 * The plain-language explanation is in `note`.
 */
export type NotEstablishedReason =
  | 'lean-timeout'
  | 'lean-failed'
  | 'lean-unavailable'
  | 'audit-missing-theorem'
  | 'audit-type-mismatch'
  | 'audit-forbidden-axiom'
  | 'audit-input-mismatch'
  | 'precondition-failed'
  | 'engine-unavailable'
  | 'native-unavailable'
  | 'not-run'
  | 'cancelled'
  | 'out-of-scope';

export interface Claim {
  id: ClaimId;
  chain: ClaimChain;
  title: string;
  status: ClaimStatus;
  evidence: Evidence;
  witness: Witness | null;
  note: string;
  reason?: NotEstablishedReason;
}

// ---------------------------------------------------------------------------
// Execution and provenance

export type ExecutionState = 'completed' | 'failed' | 'timeout' | 'cancelled' | 'invalid';

export type JobState = 'queued' | 'running' | ExecutionState;

export type StepState =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'cancelled'
  | 'invalid'
  | 'skipped'
  | 'not_run';

export interface Step {
  name: string;
  state: StepState;
  /** Wall-clock duration of the step in milliseconds. */
  ms?: number;
  /** Short human-readable detail (no paths, no timestamps). */
  detail?: string;
}

export interface Execution {
  state: ExecutionState | 'running' | 'queued';
  steps: Step[];
}

/** Where a displayed result came from. */
export type Origin = 'live' | 'cached' | 'recorded';

export interface ToolchainPins {
  /** Lean version from lean/lean-toolchain, e.g. "v4.33.1". */
  lean: string;
  /** Mathlib input revision from lean/lake-manifest.json. */
  mathlib: string;
  /** WideTrail revision from lean/lake-manifest.json. */
  widetrail: string;
  /** `rustc -V`, or "unavailable". */
  rustc: string;
}

export interface Provenance {
  origin: Origin;
  /** "cryptificate <version>" plus the source revision when known. */
  checker: string;
  toolchain: ToolchainPins;
  leanSourceSha256?: string;
  cacheKey?: string;
  /** Id of the run that produced a cached result. */
  cachedFrom?: string;
}

// ---------------------------------------------------------------------------
// Reports

export interface AnalysisReport {
  kind: 'analysis';
  id: string;
  /** "sha256:<hex>" of the canonical JSON of the normalized inputs. */
  inputDigest: string;
  inputs: AnalysisRequest;
  claims: Claim[];
  execution: Execution;
  provenance: Provenance;
}

export interface SearchHistoryEntry {
  id: string;
  ops: { add: number; mul: number };
  depth: number;
  temps: number;
  symbolic: 'pass' | 'reject';
}

export interface SearchSummary {
  seed: string;
  /** Budget the search ran under, as reported by the engine. */
  budget: Record<string, unknown>;
  generated: number;
  history: SearchHistoryEntry[];
  shortlist: string[];
}

export type CandidateOrigin = 'search' | 'baseline-direct' | 'baseline-known' | 'user';

export interface NativeCorrectness {
  cases: number;
  passed: boolean;
  checksum: string;
}

export interface ExperimentCandidate {
  id: string;
  program: Program;
  origin: CandidateOrigin;
  equivalence: Claim;
  native: NativeCorrectness | null;
}

export interface MachineInfo {
  cpu: string;
  os: string;
  ramMiB: number;
  rustc: string;
  flags: string;
}

export interface Workload {
  candidate?: string;
  bytes: number;
  columns: number;
  /** Raw per-sample nanoseconds. */
  samples: number[];
  medianNsPerColumn: number;
  iqr: number;
  mibPerSec: number;
  session?: number;
}

export interface Comparison {
  candidate: string;
  baseline: string;
  ratio: number;
  ci95: [number, number];
  session: number;
  bytes?: number;
  /** Set on comparisons at the primary workload (64 KiB). */
  primary?: boolean;
}

export type MeasurementVerdict = 'locally confirmed' | 'inconclusive' | 'no improvement';

export interface Measurements {
  machine: MachineInfo;
  workloads: Workload[];
  comparisons: Comparison[];
  verdict: MeasurementVerdict;
}

export interface Checkpoint {
  name: string;
  state: StepState;
  ms?: number;
  detail?: string;
}

export interface ExperimentReport {
  kind: 'experiment';
  id: string;
  inputDigest: string;
  profile: ExperimentProfile;
  inputs?: ExperimentRequest;
  search: SearchSummary | null;
  candidates: ExperimentCandidate[];
  measurements: Measurements | null;
  execution?: Execution;
  provenance: Provenance;
  checkpoints: Checkpoint[];
}

export type Report = AnalysisReport | ExperimentReport;

// ---------------------------------------------------------------------------
// Jobs

export type JobKind = 'analysis' | 'experiment';

export interface JobSummary {
  id: string;
  kind: JobKind;
  state: JobState;
  origin: Origin;
}

export interface JobError {
  code: string;
  message: string;
  path?: string;
}

export interface Job extends JobSummary {
  /** Progress steps, in pipeline order. */
  steps: Step[];
  /** Partial while running, final once the job reaches a terminal state. */
  report: Report | null;
  /** Position in the queue (1 = next), only while queued. */
  queuePosition?: number;
  error?: JobError;
  /** Whether GET /api/jobs/:id/bundle is available. */
  bundle: boolean;
}

export interface CreateJobResponse {
  job: JobSummary;
}

export interface ErrorResponse {
  error: JobError;
}

// ---------------------------------------------------------------------------
// Capabilities

export interface ProfileInfo {
  id: ExperimentProfile;
  label: string;
  budget: {
    totalSeconds: number;
    searchMs: number;
    maxCandidates: number;
    shortlist: number;
    sessions: number;
  };
}

export interface ToolAvailability {
  available: boolean;
  version?: string;
  detail?: string;
}

export interface Capabilities {
  name: 'cryptificate';
  version: string;
  checker: string;
  models: ModelId[];
  profiles: ProfileInfo[];
  limits: {
    maxBodyBytes: number;
    maxInstructions: number;
    maxQueued: number;
    leanTimeoutSeconds: number;
    analysisBudgetSeconds: number;
  };
  toolchain: {
    lean: ToolAvailability;
    rust: ToolAvailability;
    engine: ToolAvailability & { subcommands: string[] };
    pins: ToolchainPins;
  };
}
