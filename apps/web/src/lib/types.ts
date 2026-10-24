/**
 * Public JSON types used by the web UI. These follow the shared contract
 * (field elements are strings, counts are numbers) and mirror the
 * definitions of the schema package.
 */

export type GfHex = string;
export type BnDecimal = string;
export type FieldElement = string;
export type FieldName = 'gf256' | 'bn254';
export type ModelId = 'aes-like/gf256/v1' | 'hades/bn254/v1';

export interface SboxAes {
  kind: 'aes';
}
export interface SboxTable {
  kind: 'table';
  table: GfHex[];
}
export interface SboxPower {
  kind: 'power';
  exponent: number;
}

export interface AesLikeDesign {
  model: 'aes-like/gf256/v1';
  field: 'gf256';
  width: 4;
  matrix: GfHex[][];
  offsets: number[];
  rounds: number;
  sbox: SboxAes | SboxTable;
}

export interface ReferenceConstants {
  kind: 'reference';
}
export interface ExplicitConstants {
  kind: 'explicit';
  values: BnDecimal[][];
}

export interface HadesDesign {
  model: 'hades/bn254/v1';
  field: 'bn254';
  width: 3;
  external: BnDecimal[][];
  internal: BnDecimal[][];
  fullRounds: number;
  partialRounds: number;
  sbox: SboxPower;
  partialMask: boolean[];
  constants: ReferenceConstants | ExplicitConstants;
}

export type CandidateDesign = AesLikeDesign | HadesDesign;

export interface AddInstruction {
  op: 'add';
  a: number;
  b: number;
}
export interface MulInstruction {
  op: 'mul';
  k: FieldElement;
  a: number;
}
export type Instruction = AddInstruction | MulInstruction;

export interface Program {
  field: FieldName;
  width: number;
  name?: string;
  instructions: Instruction[];
  outputs: number[];
}

export type ProgramTarget = 'matrix' | 'external' | 'internal';

export interface AnalysisRequest {
  design: CandidateDesign;
  program?: Program;
  target?: ProgramTarget;
}

export type ExperimentProfile = 'quick' | 'research';

export interface ExperimentRequest {
  design: CandidateDesign;
  program?: Program;
  profile: ExperimentProfile;
  seed?: string;
}

export type ClaimId =
  | 'matrix.mds'
  | 'offsets.dispersion'
  | 'sbox.bijective'
  | 'activity.bound'
  | 'external.mds'
  | 'internal.invertible'
  | 'activity.outer'
  | 'circuit.equivalence'
  | 'native.correctness'
  | 'rust.refinement'
  | 'native.timing';

export type ClaimChain = 'design' | 'implementation';
export type ClaimStatus = 'proved' | 'refuted' | 'not_established' | 'unsupported';
export type EvidenceKind = 'lean' | 'native' | 'measurement' | 'refinement' | 'diagnostic';

export interface Evidence {
  kind: EvidenceKind;
  label: string;
  theorem?: string;
  type?: string;
  axioms?: string[];
  cases?: number;
}

export interface BranchWitness {
  kind: 'branch';
  input: FieldElement[];
  output: FieldElement[];
  inputWeight: number;
  outputWeight: number;
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

export interface Claim {
  id: ClaimId;
  chain: ClaimChain;
  title: string;
  status: ClaimStatus;
  evidence: Evidence;
  witness: Witness | null;
  note: string;
  reason?: string;
}

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
  ms?: number;
  detail?: string;
}

export interface Execution {
  state: ExecutionState | 'running' | 'queued';
  steps: Step[];
}

export type Origin = 'live' | 'cached' | 'recorded';

export interface ToolchainPins {
  lean: string;
  mathlib: string;
  widetrail: string;
  rustc: string;
}

export interface Provenance {
  origin: Origin;
  checker: string;
  toolchain: ToolchainPins;
  leanSourceSha256?: string;
  cacheKey?: string;
  cachedFrom?: string;
}

export interface AnalysisReport {
  kind: 'analysis';
  id: string;
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
  budget: Record<string, number | string>;
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
  steps: Step[];
  report: Report | null;
  queuePosition?: number;
  error?: JobError;
  bundle: boolean;
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
  profiles: { id: ExperimentProfile; label: string }[];
  limits: Record<string, number>;
  toolchain: {
    lean: ToolAvailability;
    rust: ToolAvailability;
    engine: ToolAvailability & { subcommands?: string[] };
    pins?: ToolchainPins;
  };
}

export const EVIDENCE_LABELS = {
  leanProof: 'Lean-checked proof',
  leanCircuit: 'Lean-checked circuit equivalence',
  leanCounterexample: 'Lean-checked counterexample',
  refinement: 'Rust-source refinement (Aeneas)',
  nativeCases: (n: number) => `Generated Rust passed ${n} correctness cases`,
  timing: 'Native timing measured on this machine',
  diagnostic: 'Unchecked diagnostic',
} as const;
