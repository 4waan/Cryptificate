/**
 * Experiment pipeline: search -> shortlist -> Lean equivalence for every
 * shortlisted candidate and baseline (one at a time) -> native correctness
 * -> benchmark sessions (initial + two confirmations). A checkpoint is
 * recorded after every completed step; when the budget runs out, completed
 * checkpoints are kept and the rest are marked not run.
 */
import { createHash } from 'node:crypto';
import { canonicalJson, EVIDENCE_LABELS, IMPLEMENTATION_CLAIMS, normalizeDesign, normalizeProgram } from '@cryptificate/schema';
import type {
  CandidateDesign,
  CandidateOrigin,
  Claim,
  Comparison,
  ExperimentCandidate,
  ExperimentProfile,
  ExperimentReport,
  ExperimentRequest,
  MachineInfo,
  Measurements,
  MeasurementVerdict,
  Program,
  ProgramTarget,
  SearchHistoryEntry,
  SearchSummary,
  Workload,
} from '@cryptificate/schema';
import { parseValidate } from './analysis.js';
import { checkCertificate } from './certificate.js';
import { buildAnalysisClaims } from './claims.js';
import type { JobContext, PipelineEnv, PipelineResult } from './context.js';
import { toolchainDocument } from './bundle.js';
import { runNative, targetMatrix } from './native.js';
import type { CodegenResult } from './native.js';
import { sha256Hex } from './toolchain.js';

export const EXPERIMENT_STEPS = [
  'validate',
  'search',
  'equivalence',
  'native-correctness',
  'benchmark-1',
  'benchmark-2',
  'benchmark-3',
  'report',
] as const;

export interface ProfileBudget {
  totalSeconds: number;
  searchMs: number;
  maxCandidates: number;
  shortlist: number;
  sessions: number;
}

/** Mirrors the engine's profile budgets (crates/search); totalSeconds bounds the whole experiment. */
export const PROFILE_BUDGETS: Record<ExperimentProfile, ProfileBudget> = {
  quick: { totalSeconds: 180, searchMs: 10_000, maxCandidates: 8, shortlist: 1, sessions: 3 },
  research: { totalSeconds: 900, searchMs: 60_000, maxCandidates: 64, shortlist: 3, sessions: 3 },
};

export function experimentBudgetMs(profile: ExperimentProfile): number {
  return PROFILE_BUDGETS[profile].totalSeconds * 1000;
}

/** Speed-up threshold on the lower 95% bound required in both confirmation sessions. */
export const CONFIRMATION_THRESHOLD = 1.02;

const AES_MIXCOLUMNS = [
  ['02', '03', '01', '01'],
  ['01', '02', '03', '01'],
  ['01', '01', '02', '03'],
  ['03', '01', '01', '02'],
];
const POSEIDON2_EXTERNAL3 = [
  ['2', '1', '1'],
  ['1', '2', '1'],
  ['1', '1', '2'],
];

function sameMatrix(a: string[][], b: string[][]): boolean {
  return canonicalJson(a.map((r) => r.map((e) => e.toUpperCase()))) === canonicalJson(b);
}

/** The textbook AES MixColumns circuit: 4 xtime and 15 XOR. */
export function aesSharedSumProgram(): Program {
  const instructions: Program['instructions'] = [
    { op: 'add', a: 0, b: 1 },
    { op: 'add', a: 4, b: 2 },
    { op: 'add', a: 5, b: 3 },
  ];
  const outputs: number[] = [];
  for (let i = 0; i < 4; i++) {
    const base = 4 + instructions.length;
    instructions.push({ op: 'add', a: i, b: (i + 1) % 4 });
    instructions.push({ op: 'mul', k: '02', a: base });
    instructions.push({ op: 'add', a: base + 1, b: 6 });
    instructions.push({ op: 'add', a: base + 2, b: i });
    outputs.push(base + 3);
  }
  return { field: 'gf256', width: 4, name: 'aes-shared-sum', instructions, outputs };
}

/** Shared-sum circuit for [[2,1,1],[1,2,1],[1,1,2]]: s = x0+x1+x2, y_i = s + x_i. */
export function bnSharedSumProgram(): Program {
  return {
    field: 'bn254',
    width: 3,
    name: 'shared-sum',
    instructions: [
      { op: 'add', a: 0, b: 1 },
      { op: 'add', a: 3, b: 2 },
      { op: 'add', a: 4, b: 0 },
      { op: 'add', a: 4, b: 1 },
      { op: 'add', a: 4, b: 2 },
    ],
    outputs: [5, 6, 7],
  };
}

/** Row-by-row matrix product circuit (no sharing). */
export function directProgram(field: 'gf256' | 'bn254', matrix: string[][]): Program {
  const width = matrix.length;
  const one = field === 'gf256' ? '01' : '1';
  const isZero = (k: string): boolean => (field === 'gf256' ? k.toUpperCase() === '00' : k === '0');
  const instructions: Program['instructions'] = [];
  const outputs: number[] = [];
  const reg = (): number => width + instructions.length - 1;
  matrix.forEach((row) => {
    let acc: number | null = null;
    row.forEach((k, j) => {
      if (isZero(k)) return;
      let term = j;
      if (k.toUpperCase() !== one) {
        instructions.push({ op: 'mul', k: field === 'gf256' ? k.toUpperCase() : k, a: j });
        term = reg();
      }
      if (acc === null) acc = term;
      else {
        instructions.push({ op: 'add', a: acc, b: term });
        acc = reg();
      }
    });
    if (acc === null) {
      instructions.push({ op: 'mul', k: field === 'gf256' ? '00' : '0', a: 0 });
      acc = reg();
    }
    outputs.push(acc);
  });
  return { field, width, name: 'direct', instructions, outputs };
}

function baselines(design: CandidateDesign, target: ProgramTarget): Array<{ id: string; origin: CandidateOrigin; program: Program }> {
  const matrix = targetMatrix(design, target);
  const out: Array<{ id: string; origin: CandidateOrigin; program: Program }> = [
    { id: 'baseline-direct', origin: 'baseline-direct', program: directProgram(design.field, matrix) },
  ];
  if (design.field === 'gf256' && sameMatrix(matrix, AES_MIXCOLUMNS)) {
    out.push({ id: 'baseline-known', origin: 'baseline-known', program: aesSharedSumProgram() });
  } else if (design.field === 'bn254' && sameMatrix(matrix, POSEIDON2_EXTERNAL3)) {
    out.push({ id: 'baseline-known', origin: 'baseline-known', program: bnSharedSumProgram() });
  }
  return out;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

interface SearchCandidate {
  id: string;
  program: Program;
  cost: number;
  symbolic: 'pass' | 'reject';
}

export function parseSearch(doc: unknown): { candidates: SearchCandidate[]; history: SearchHistoryEntry[]; shortlist: string[] | null; generated: number | null; baselines: Array<{ id: string; origin: CandidateOrigin; program: Program }> } {
  const root = asRecord(doc) ?? {};
  const candidates: SearchCandidate[] = [];
  const history: SearchHistoryEntry[] = [];
  const rawCandidates = Array.isArray(root['candidates']) ? (root['candidates'] as unknown[]) : [];
  for (const c of rawCandidates) {
    const o = asRecord(c);
    const program = asRecord(o?.['program']);
    if (!o || !program || typeof o['id'] !== 'string') continue;
    const ops = asRecord(o['ops']);
    const add = typeof ops?.['add'] === 'number' ? (ops['add'] as number) : 0;
    const mul = typeof ops?.['mul'] === 'number' ? (ops['mul'] as number) : 0;
    const symbolic = o['symbolic'] === 'reject' ? 'reject' : 'pass';
    candidates.push({ id: o['id'], program: program as unknown as Program, cost: add + mul, symbolic });
  }
  const rawHistory = Array.isArray(root['history']) ? (root['history'] as unknown[]) : [];
  for (const h of rawHistory) {
    const o = asRecord(h);
    const ops = asRecord(o?.['ops']);
    if (!o || typeof o['id'] !== 'string' || !ops) continue;
    history.push({
      id: o['id'],
      ops: { add: Number(ops['add'] ?? 0), mul: Number(ops['mul'] ?? 0) },
      depth: Number(o['depth'] ?? 0),
      temps: Number(o['temps'] ?? 0),
      symbolic: o['symbolic'] === 'reject' ? 'reject' : 'pass',
    });
  }
  const shortlist = Array.isArray(root['shortlist']) ? (root['shortlist'] as unknown[]).filter((s): s is string => typeof s === 'string') : null;
  const generated = typeof root['generated'] === 'number' ? root['generated'] : null;
  const bl: Array<{ id: string; origin: CandidateOrigin; program: Program }> = [];
  if (Array.isArray(root['baselines'])) {
    for (const b of root['baselines'] as unknown[]) {
      const o = asRecord(b);
      const program = asRecord(o?.['program']);
      if (!o || !program || typeof o['id'] !== 'string') continue;
      const origin = o['origin'] === 'baseline-known' || o['id'] === 'baseline-known' ? 'baseline-known' : 'baseline-direct';
      bl.push({ id: o['id'], origin, program: program as unknown as Program });
    }
  }
  return { candidates, history, shortlist, generated, baselines: bl };
}

function sessionSeed(seed: string, session: number): string {
  return createHash('sha256').update(`${seed}:session:${session}`).digest('hex').slice(0, 16);
}

/** Collect workloads and comparisons from a native benchmark document. */
export function parseBenchmark(doc: unknown, session: number): { machine: MachineInfo | null; workloads: Workload[]; comparisons: Comparison[] } {
  const root = asRecord(doc) ?? {};
  const m = asRecord(root['machine']);
  const machine: MachineInfo | null = m
    ? {
        cpu: String(m['cpu'] ?? 'unknown'),
        os: String(m['os'] ?? 'unknown'),
        ramMiB: Number(m['ramMiB'] ?? 0),
        rustc: String(m['rustc'] ?? 'unknown'),
        flags: String(m['flags'] ?? ''),
      }
    : null;
  const workloads: Workload[] = [];
  for (const w of Array.isArray(root['workloads']) ? (root['workloads'] as unknown[]) : []) {
    const o = asRecord(w);
    if (!o || typeof o['bytes'] !== 'number') continue;
    workloads.push({ ...(o as unknown as Workload), session });
  }
  const comparisons: Comparison[] = [];
  for (const c of Array.isArray(root['comparisons']) ? (root['comparisons'] as unknown[]) : []) {
    const o = asRecord(c);
    if (!o || typeof o['candidate'] !== 'string' || typeof o['ratio'] !== 'number' || !Array.isArray(o['ci95'])) continue;
    comparisons.push({ ...(o as unknown as Comparison), session });
  }
  return { machine, workloads, comparisons };
}

/**
 * "locally confirmed" only when some proved-equivalent candidate has a 95%
 * CI lower bound above the threshold against every baseline it was compared
 * with, in BOTH confirmation sessions (2 and 3); "no improvement" when no
 * candidate was ever faster; otherwise "inconclusive".
 */
export function decideVerdict(comparisons: readonly Comparison[], eligible: ReadonlySet<string>, primaryBytes = 65536): MeasurementVerdict {
  const relevant = comparisons.filter((c) => eligible.has(c.candidate) && (c.bytes === undefined || c.bytes === primaryBytes));
  if (relevant.length === 0) return 'inconclusive';
  for (const cand of eligible) {
    const confirmed = [2, 3].every((session) => {
      const inSession = relevant.filter((c) => c.candidate === cand && c.session === session);
      return inSession.length > 0 && inSession.every((c) => c.ci95[0] > CONFIRMATION_THRESHOLD);
    });
    if (confirmed) return 'locally confirmed';
  }
  if (relevant.every((c) => c.ratio <= 1)) return 'no improvement';
  return 'inconclusive';
}

function equivalenceClaimFrom(claims: Claim[]): Claim {
  const c = claims.find((x) => x.id === 'circuit.equivalence');
  if (c) return c;
  const info = IMPLEMENTATION_CLAIMS.find((x) => x.id === 'circuit.equivalence')!;
  return { id: info.id, chain: info.chain, title: info.title, status: 'not_established', evidence: { kind: 'diagnostic', label: EVIDENCE_LABELS.uncheckedDiagnostic }, witness: null, note: 'Not checked.', reason: 'not-run' };
}

function notRunClaim(note: string, reason: Claim['reason'] = 'not-run'): Claim {
  const info = IMPLEMENTATION_CLAIMS.find((x) => x.id === 'circuit.equivalence')!;
  const c: Claim = { id: info.id, chain: info.chain, title: info.title, status: 'not_established', evidence: { kind: 'diagnostic', label: EVIDENCE_LABELS.uncheckedDiagnostic }, witness: null, note };
  if (reason) c.reason = reason;
  return c;
}

export async function runExperiment(env: PipelineEnv, ctx: JobContext, raw: ExperimentRequest): Promise<PipelineResult> {
  const tc = await env.toolchain();
  ctx.writeJson('toolchain.json', toolchainDocument(tc));
  const budget = PROFILE_BUDGETS[raw.profile];
  const fallback: ExperimentRequest = { design: normalizeDesign(raw.design), profile: raw.profile };
  if (raw.program) fallback.program = normalizeProgram(raw.program);
  if (raw.seed) fallback.seed = raw.seed.toLowerCase();

  let request = fallback;
  let inputDigest = `sha256:${sha256Hex(canonicalJson(fallback))}`;
  let search: SearchSummary | null = null;
  const candidates: ExperimentCandidate[] = [];
  let measurements: Measurements | null = null;
  const checkpoints = (): ExperimentReport['checkpoints'] =>
    ctx.steps.filter((s) => s.state !== 'pending' && s.state !== 'running').map((s) => ({ ...s }));
  const report = (state: NonNullable<ExperimentReport['execution']>['state']): ExperimentReport => ({
    kind: 'experiment',
    id: ctx.id,
    inputDigest,
    profile: request.profile,
    inputs: request,
    search,
    candidates: candidates.map((c) => ({ ...c })),
    measurements,
    execution: { state, steps: ctx.executionSteps() },
    provenance: { origin: 'live', checker: tc.checker, toolchain: tc.pins },
    checkpoints: checkpoints(),
  });
  const checkpoint = (): void => {
    const r = report('running');
    ctx.writeJson('report.json', r);
    ctx.setReport(r);
  };
  const outOfBudget = (): boolean => ctx.remainingMs() <= 0;
  const finish = (state: PipelineResult['state'], error?: PipelineResult['error']): PipelineResult => {
    if (state === 'cancelled') ctx.closeRemaining('cancelled');
    else ctx.closeRemaining('not_run', state === 'timeout' ? 'budget exhausted' : undefined);
    if (ctx.steps.find((s) => s.name === 'report')?.state !== 'completed') ctx.finish('report', 'completed');
    const r = report(state);
    ctx.writeJson('report.json', r);
    ctx.setReport(r);
    return error ? { state, report: r, error } : { state, report: r };
  };
  const stopState = (): PipelineResult['state'] | null => (ctx.cancelled ? 'cancelled' : outOfBudget() ? 'timeout' : null);

  // validate
  ctx.start('validate');
  const v = await env.engine.call<unknown>('validate', raw, { signal: ctx.signal, timeoutMs: 30_000, replacements: env.replacements, log: ctx.logger });
  if (!v.ok) {
    ctx.finish('validate', v.kind === 'invalid' ? 'invalid' : v.kind === 'cancelled' ? 'cancelled' : 'failed', v.error.message);
    if (v.kind === 'invalid') {
      ctx.closeRemaining('not_run');
      return { state: 'invalid', report: null, error: v.error };
    }
    return finish(v.kind === 'cancelled' ? 'cancelled' : 'failed', v.error);
  }
  ({ request, inputDigest } = parseValidate<ExperimentRequest>(v.value, fallback));
  const seed = request.seed ?? createHash('sha256').update(`${inputDigest}:seed`).digest('hex').slice(0, 16);
  ctx.writeJson('inputs.json', request);
  ctx.finish('validate', 'completed');
  checkpoint();

  const design = request.design;
  const target: ProgramTarget = design.model === 'hades/bn254/v1' ? 'external' : 'matrix';

  // search
  let stop = stopState();
  if (stop) return finish(stop);
  ctx.start('search', `profile ${request.profile}`);
  const searchInput: Record<string, unknown> & { synthMs: number } = {
    matrix: targetMatrix(design, target),
    field: design.field,
    width: design.width,
    profile: request.profile,
    seed,
    maxCandidates: budget.maxCandidates,
    synthMs: Math.min(budget.searchMs, Math.max(1000, Math.floor(ctx.remainingMs() / 4))),
  };
  if (request.program) searchInput['program'] = request.program;
  const s = await env.engine.call<unknown>('search', searchInput, {
    signal: ctx.signal,
    timeoutMs: Math.min(searchInput.synthMs + 60_000, Math.max(1000, ctx.remainingMs())),
    replacements: env.replacements,
    log: ctx.logger,
    maxOutputBytes: 64 * 1024 * 1024,
  });
  const parsed = s.ok ? parseSearch(s.value) : null;
  if (s.ok && parsed) {
    const rawHistory = (s.value as Record<string, unknown>)['history'];
    ctx.writeJson('search/history.json', Array.isArray(rawHistory) ? rawHistory : parsed.history);
    ctx.writeJson('search/seeds.json', { seed, sessions: [1, 2, 3].map((n) => ({ session: n, seed: sessionSeed(seed, n) })) });
    ctx.writeJson('search/search.json', s.value);
    const passing = parsed.candidates.filter((c) => c.symbolic === 'pass');
    const shortlist = (parsed.shortlist ?? [...passing].sort((a, b) => a.cost - b.cost || (a.id < b.id ? -1 : 1)).map((c) => c.id)).slice(0, budget.shortlist);
    const engineBudget = (s.value as Record<string, unknown>)['budget'];
    search = {
      seed,
      budget: engineBudget && typeof engineBudget === 'object' && !Array.isArray(engineBudget) ? (engineBudget as Record<string, unknown>) : { ...budget },
      generated: parsed.generated ?? parsed.candidates.length,
      history: parsed.history,
      shortlist,
    };
    ctx.finish('search', 'completed', `${search.generated} generated, ${shortlist.length} shortlisted`);
  } else {
    ctx.finish('search', s.ok ? 'failed' : s.kind === 'cancelled' ? 'cancelled' : s.kind === 'timeout' ? 'timeout' : 'failed', s.ok ? 'unexpected search output' : s.error.message);
    search = { seed, budget: { ...budget }, generated: 0, history: [], shortlist: [] };
  }
  checkpoint();

  // candidate list: shortlist, baselines, user circuit
  const pool: Array<{ id: string; origin: CandidateOrigin; program: Program }> = [];
  for (const id of search.shortlist) {
    const c = parsed?.candidates.find((x) => x.id === id);
    if (c) pool.push({ id: c.id, origin: 'search', program: c.program });
  }
  const bl = parsed && parsed.baselines.length > 0 ? parsed.baselines : baselines(design, target);
  for (const b of bl) if (!pool.some((p) => p.id === b.id)) pool.push(b);
  if (request.program) pool.push({ id: 'user', origin: 'user', program: request.program });
  for (const p of pool) {
    candidates.push({ id: p.id, program: p.program, origin: p.origin, equivalence: notRunClaim('Waiting for the Lean check.'), native: null });
  }
  checkpoint();

  // Lean equivalence, one candidate at a time
  stop = stopState();
  if (stop) return finish(stop);
  ctx.start('equivalence', `${candidates.length} circuit(s)`);
  for (const cand of candidates) {
    stop = stopState();
    if (stop) {
      cand.equivalence = notRunClaim(stop === 'cancelled' ? 'Stopped before this check.' : 'The time budget ran out before this check.', stop === 'cancelled' ? 'cancelled' : 'not-run');
      continue;
    }
    const subdir = `lean/${cand.id.replace(/[^A-Za-z0-9_-]/g, '_')}`;
    const cert = await checkCertificate(env, ctx, { design, program: cand.program, target }, {
      subdir,
      emitStep: `emit-lean:${cand.id}`,
      leanStep: `lean:${cand.id}`,
    });
    const claims = buildAnalysisClaims({
      request: { design, program: cand.program, target },
      expect: cert.emit?.expect.filter((e) => e.claim === 'circuit.equivalence') ?? [],
      verdicts: cert.acceptance?.verdicts.filter((x) => x.claim === 'circuit.equivalence') ?? [],
      diagnostics: null,
      ...(cert.problem ? { leanProblem: cert.problem } : {}),
      native: null,
    });
    cand.equivalence = equivalenceClaimFrom(claims);
    if (!cert.emit && cert.problem) {
      cand.equivalence = { ...cand.equivalence, reason: cert.problem.reason, note: cert.problem.detail };
    }
    // keep per-candidate sub-steps out of the top-level progress list
    for (const name of [`emit-lean:${cand.id}`, `lean:${cand.id}`]) {
      const i = ctx.steps.findIndex((x) => x.name === name);
      if (i >= 0) ctx.steps.splice(i, 1);
    }
    checkpoint();
  }
  stop = stopState();
  ctx.finish('equivalence', stop === 'cancelled' ? 'cancelled' : stop === 'timeout' ? 'timeout' : 'completed', `${candidates.filter((c) => c.equivalence.status === 'proved').length} proved`);
  checkpoint();
  if (stop) return finish(stop);

  // native correctness for all circuits in one engine run
  const correctness = await runNative(env, ctx, {
    design,
    target,
    variants: candidates.map((c) => ({ id: c.id, program: c.program })),
    mode: 'correctness',
    timeoutMs: 600_000,
    subdir: 'native',
    stepName: 'native-correctness',
  });
  let codegen: CodegenResult | null = correctness.codegen;
  if (correctness.ok) {
    for (const cand of candidates) {
      const r = correctness.correctness.find((x) => x.id === cand.id);
      if (r) cand.native = { cases: r.cases, passed: r.passed, checksum: r.checksum ?? '' };
    }
  }
  checkpoint();
  stop = stopState();
  if (stop) return finish(stop);

  // benchmark sessions: initial + two confirmations with fresh seeds
  const timed = candidates.filter((c) => c.native?.passed);
  const eligible = new Set(candidates.filter((c) => c.origin !== 'baseline-direct' && c.origin !== 'baseline-known' && c.equivalence.status === 'proved' && c.native?.passed).map((c) => c.id));
  const allWorkloads: Workload[] = [];
  const allComparisons: Comparison[] = [];
  let machine: MachineInfo | null = null;
  if (!correctness.ok || timed.length < 2) {
    for (const n of [1, 2, 3]) {
      ctx.finish(`benchmark-${n}`, 'skipped', correctness.unavailable ?? (correctness.ok ? 'fewer than two correct circuits to compare' : 'native correctness did not complete'));
    }
  } else {
    for (const n of [1, 2, 3]) {
      stop = stopState();
      if (stop) return finish(stop);
      const b = await runNative(env, ctx, {
        design,
        target,
        variants: timed.map((c) => ({ id: c.id, program: c.program })),
        mode: 'benchmark',
        session: n,
        seed: sessionSeed(seed, n),
        timeoutMs: Math.max(1000, ctx.remainingMs()),
        subdir: 'native/measurements',
        stepName: `benchmark-${n}`,
        codegen,
      });
      codegen = b.codegen ?? codegen;
      if (!b.ok) break;
      const parsedBench = parseBenchmark(b.raw, n);
      machine = parsedBench.machine ?? machine;
      allWorkloads.push(...parsedBench.workloads);
      allComparisons.push(...parsedBench.comparisons);
      measurements = {
        machine: machine ?? { cpu: 'unknown', os: 'unknown', ramMiB: 0, rustc: tc.pins.rustc, flags: '' },
        workloads: [...allWorkloads],
        comparisons: [...allComparisons],
        verdict: decideVerdict(allComparisons, eligible),
      };
      checkpoint();
    }
  }
  stop = stopState();
  if (stop) return finish(stop);
  ctx.start('report');
  ctx.finish('report', 'completed');
  return finish('completed');
}
