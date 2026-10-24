import { fieldOps } from './field';
import { sha256Hex } from './sha256';
import type { AnalysisRequest, CandidateDesign, ExperimentRequest, Instruction, Program, ProgramTarget } from './types';

/**
 * Canonical JSON: object keys sorted by code unit, no whitespace, arrays in
 * order, `undefined` members dropped. Two values with the same meaning
 * produce the same text.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('non-finite number');
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v ?? null)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export function digestOf(value: unknown): string {
  return `sha256:${sha256Hex(canonicalJson(value))}`;
}

/** Normalizes a design to canonical element encodings. Throws on invalid elements. */
export function normalizeDesign(design: CandidateDesign): CandidateDesign {
  if (design.model === 'aes-like/gf256/v1') {
    const f = fieldOps('gf256');
    return {
      model: design.model,
      field: 'gf256',
      width: 4,
      matrix: design.matrix.map((row) => row.map((x) => f.canonical(x))),
      offsets: [...design.offsets],
      rounds: design.rounds,
      sbox:
        design.sbox.kind === 'aes'
          ? { kind: 'aes' }
          : { kind: 'table', table: design.sbox.table.map((x) => f.canonical(x)) },
    };
  }
  const f = fieldOps('bn254');
  return {
    model: design.model,
    field: 'bn254',
    width: 3,
    external: design.external.map((row) => row.map((x) => f.canonical(x))),
    internal: design.internal.map((row) => row.map((x) => f.canonical(x))),
    fullRounds: design.fullRounds,
    partialRounds: design.partialRounds,
    sbox: { kind: 'power', exponent: design.sbox.exponent },
    partialMask: [...design.partialMask],
    constants:
      design.constants.kind === 'reference'
        ? { kind: 'reference' }
        : { kind: 'explicit', values: design.constants.values.map((r) => r.map((x) => f.canonical(x))) },
  };
}

function normalizeInstruction(field: Program['field'], ins: Instruction): Instruction {
  return ins.op === 'add'
    ? { op: 'add', a: ins.a, b: ins.b }
    : { op: 'mul', k: fieldOps(field).canonical(ins.k), a: ins.a };
}

/** Normalizes a program. The display name is kept unless `semantic` is set. */
export function normalizeProgram(program: Program, semantic = false): Program {
  const out: Program = {
    field: program.field,
    width: program.width,
    instructions: program.instructions.map((ins) => normalizeInstruction(program.field, ins)),
    outputs: [...program.outputs],
  };
  if (!semantic && program.name) out.name = program.name;
  return out;
}

export function defaultTarget(design: CandidateDesign): ProgramTarget {
  return design.field === 'gf256' ? 'matrix' : 'external';
}

export function normalizeAnalysisRequest(req: AnalysisRequest, semantic = false): AnalysisRequest {
  const design = normalizeDesign(req.design);
  if (!req.program) return { design };
  return {
    design,
    program: normalizeProgram(req.program, semantic),
    target: req.target ?? defaultTarget(req.design),
  };
}

export function normalizeExperimentRequest(req: ExperimentRequest): ExperimentRequest {
  const out: ExperimentRequest = { design: normalizeDesign(req.design), profile: req.profile };
  if (req.program) out.program = normalizeProgram(req.program);
  if (req.seed) out.seed = req.seed;
  return out;
}

/** The parts of the workspace that results depend on. */
export interface WorkspaceInputs {
  design: CandidateDesign;
  program?: Program | null;
  target?: ProgramTarget;
}

/**
 * Digest of the inputs a result depends on: normalized design, program
 * (without its display name) and target. Returns null when the inputs do not
 * parse, which callers treat as "differs from every report".
 */
export function inputsDigest(inputs: WorkspaceInputs): string | null {
  try {
    const req = normalizeAnalysisRequest(
      { design: inputs.design, program: inputs.program ?? undefined, target: inputs.target },
      true,
    );
    return digestOf(req);
  } catch {
    return null;
  }
}

/** Whether a result computed for `resultInputs` still describes `current`. */
export function isStale(current: WorkspaceInputs, resultInputs: WorkspaceInputs | null | undefined): boolean {
  if (!resultInputs) return true;
  const a = inputsDigest(current);
  const b = inputsDigest(resultInputs);
  return a === null || b === null || a !== b;
}
