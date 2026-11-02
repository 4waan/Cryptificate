/**
 * `cryptificate verify <bundle>`: re-derive the claims of a bundle with the
 * installed engine, templates and Lean checker. Only inputs.json and
 * report.json are read from the bundle; everything else (report.html,
 * VERIFY.md, toolchain.json, bundled Lean, Rust and shell files) is neither
 * read as input nor executed.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { validateAnalysisRequest, validateExperimentRequest } from '@cryptificate/schema';
import type { AnalysisReport, AnalysisRequest, Claim, ExecutionState, ExperimentReport, Report } from '@cryptificate/schema';
import { runAnalysis, ANALYSIS_STEPS } from './analysis.js';
import { checkCertificate } from './certificate.js';
import type { CertificateCheck } from './certificate.js';
import { buildAnalysisClaims } from './claims.js';
import { JobContext } from './context.js';
import type { PipelineEnv } from './context.js';
import { readTarGz } from './tar.js';

export type MatchKind = 'match' | 'mismatch' | 'historical' | 'not re-checked';

export interface VerifyRow {
  subject: string;
  claim: string;
  recorded: string;
  recomputed: string;
  result: MatchKind;
  /** Why the recorded claim was not established, when the bundle says (e.g. "not-run"). */
  reason?: string;
  /** Why the recomputed claim was not established (e.g. "lean-unavailable"). */
  recomputedReason?: string;
}

export interface VerifyResult {
  kind: Report['kind'];
  id: string;
  inputDigest: { recorded: string; recomputed: string | null };
  /**
   * Execution state of the re-run: of the analysis, or for an experiment the
   * first candidate re-check that did not complete. Anything but "completed"
   * means the bundle could not be re-checked in full.
   */
  state: ExecutionState;
  rows: VerifyRow[];
  ok: boolean;
  notes: string[];
}

export interface VerifyOptions {
  /** Re-run native correctness (regenerated Rust, never bundled Rust). */
  native?: boolean;
  keep?: boolean;
  log?: (line: string) => void;
}

/** Extract regular files into a fresh temporary directory. */
export function extractBundle(bundlePath: string): { dir: string; files: string[] } {
  const files = readTarGz(readFileSync(bundlePath));
  const dir = mkdtempSync(join(tmpdir(), 'cryptificate-verify-'));
  for (const [path, data] of files) {
    const target = join(dir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data, { mode: 0o600 });
  }
  return { dir, files: [...files.keys()].sort() };
}

const RECHECKED = new Set(['matrix.mds', 'offsets.dispersion', 'sbox.bijective', 'activity.bound', 'external.mds', 'internal.invertible', 'activity.outer', 'circuit.equivalence']);

function compareClaims(subject: string, recorded: readonly Claim[], recomputed: readonly Claim[], native: boolean): VerifyRow[] {
  const rows: VerifyRow[] = [];
  for (const rc of recorded) {
    const now = recomputed.find((c) => c.id === rc.id);
    if (rc.id === 'native.timing') {
      rows.push({ subject, claim: rc.id, recorded: rc.status, recomputed: '-', result: 'historical' });
      continue;
    }
    if ((rc.id === 'native.correctness' && !native) || (!RECHECKED.has(rc.id) && rc.id !== 'native.correctness')) {
      rows.push({ subject, claim: rc.id, recorded: rc.status, recomputed: '-', result: 'not re-checked' });
      continue;
    }
    if (!now) {
      rows.push({ subject, claim: rc.id, recorded: rc.status, recomputed: 'missing', result: 'mismatch' });
      continue;
    }
    rows.push({
      subject,
      claim: rc.id,
      recorded: rc.status,
      recomputed: now.status,
      result: now.status === rc.status ? 'match' : 'mismatch',
      ...(rc.reason ? { reason: rc.reason } : {}),
      ...(now.reason ? { recomputedReason: now.reason } : {}),
    });
  }
  for (const c of recomputed) {
    if (!recorded.some((r) => r.id === c.id) && RECHECKED.has(c.id)) {
      rows.push({ subject, claim: c.id, recorded: 'missing', recomputed: c.status, result: 'mismatch', ...(c.reason ? { recomputedReason: c.reason } : {}) });
    }
  }
  return rows;
}

export async function verifyBundle(env: PipelineEnv, bundlePath: string, opts: VerifyOptions = {}): Promise<VerifyResult> {
  const log = opts.log ?? (() => {});
  const { dir } = extractBundle(bundlePath);
  try {
    const inputs = JSON.parse(readFileSync(join(dir, 'inputs.json'), 'utf8')) as unknown;
    const report = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')) as Report;
    mkdirSync(env.paths.home, { recursive: true });
    const work = mkdtempSync(join(env.paths.home, 'verify-'));
    const controller = new AbortController();
    const verifyEnv: PipelineEnv = { ...env, noCache: true, skipNative: !(opts.native ?? false) };
    const notes: string[] = [];
    try {
      if (report.kind === 'analysis') {
        const v = validateAnalysisRequest(inputs);
        if (!v.ok) throw new Error(`inputs.json is not a valid analysis request: ${v.errors[0]?.path} ${v.errors[0]?.message}`);
        log('re-running the analysis with the installed engine and Lean checker');
        const ctx = new JobContext(report.id, work, controller.signal, env.analysisBudgetMs ?? 300_000, ANALYSIS_STEPS, () => {});
        const result = await runAnalysis(verifyEnv, ctx, v.value);
        const now = result.report as AnalysisReport | null;
        const recomputedDigest = now?.inputDigest ?? null;
        let rows = compareClaims('design', (report as AnalysisReport).claims, now?.claims ?? [], opts.native ?? false);
        rows = rows.map((r) => ({ ...r, subject: r.claim.startsWith('circuit') || r.claim.startsWith('native') || r.claim.startsWith('rust') ? 'implementation' : 'design' }));
        if (recomputedDigest && recomputedDigest !== report.inputDigest) notes.push('The recomputed input digest differs from the recorded one.');
        if (result.state !== 'completed') notes.push(`The re-run ended with state ${result.state}.`);
        notes.push('Timings in the bundle are historical and were not re-measured.');
        return finalize(report, result.state, recomputedDigest, rows, notes);
      }
      // experiment: re-check the equivalence claim of every recorded candidate
      const exp = report as ExperimentReport;
      const v = validateExperimentRequest(inputs);
      if (!v.ok) throw new Error(`inputs.json is not a valid experiment request: ${v.errors[0]?.path} ${v.errors[0]?.message}`);
      const design = v.value.design;
      const target = design.model === 'hades/bn254/v1' ? 'external' : 'matrix';
      const rows: VerifyRow[] = [];
      let state: ExecutionState = 'completed';
      const ctx = new JobContext(report.id, work, controller.signal, Math.max(300_000, exp.candidates.length * 200_000), [], () => {});
      for (const cand of exp.candidates) {
        log(`re-checking circuit equivalence of ${cand.id}`);
        const req: AnalysisRequest = { design, program: cand.program, target };
        const shape = validateAnalysisRequest(req);
        if (!shape.ok) {
          rows.push({ subject: cand.id, claim: 'circuit.equivalence', recorded: cand.equivalence.status, recomputed: 'invalid program', result: 'mismatch' });
          continue;
        }
        const cert = await checkCertificate(verifyEnv, ctx, req, { subdir: `lean/${cand.id.replace(/[^A-Za-z0-9_-]/g, '_')}`, emitStep: `emit:${cand.id}`, leanStep: `lean:${cand.id}` });
        if (state === 'completed') state = certificateState(cert);
        const claims = buildAnalysisClaims({
          request: req,
          expect: cert.emit?.expect.filter((e) => e.claim === 'circuit.equivalence') ?? [],
          verdicts: cert.acceptance?.verdicts.filter((x) => x.claim === 'circuit.equivalence') ?? [],
          diagnostics: null,
          ...(cert.problem ? { leanProblem: cert.problem } : {}),
          native: null,
        });
        const now = claims.find((c) => c.id === 'circuit.equivalence');
        const status = now?.status ?? 'missing';
        rows.push({
          subject: cand.id,
          claim: 'circuit.equivalence',
          recorded: cand.equivalence.status,
          recomputed: status,
          result: status === cand.equivalence.status ? 'match' : 'mismatch',
          ...(now?.reason ? { recomputedReason: now.reason } : {}),
        });
        if (cand.native) rows.push({ subject: cand.id, claim: 'native.correctness', recorded: cand.native.passed ? 'passed' : 'failed', recomputed: '-', result: 'not re-checked' });
      }
      if (exp.measurements) {
        rows.push({ subject: 'measurements', claim: 'native.timing', recorded: exp.measurements.verdict, recomputed: '-', result: 'historical' });
      }
      if (state !== 'completed') notes.push(`A re-check ended with state ${state}.`);
      notes.push('Benchmark results are historical measurements from the machine that produced the bundle.');
      return finalize(report, state, null, rows, notes);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  } finally {
    if (!opts.keep) rmSync(dir, { recursive: true, force: true });
    else log(`bundle extracted to ${dir}`);
  }
}

/** Execution state of one certificate check, as the analysis pipeline would record it. */
function certificateState(cert: CertificateCheck): ExecutionState {
  if (cert.emitError) {
    const k = cert.emitError.kind;
    return k === 'cancelled' || k === 'timeout' || k === 'invalid' ? k : 'failed';
  }
  if (cert.problem?.reason === 'cancelled') return 'cancelled';
  if (cert.problem?.reason === 'not-run') return 'timeout';
  if (cert.problem) return 'failed';
  const o = cert.outcome;
  if (!o) return 'completed';
  if (o.cancelled) return 'cancelled';
  if (o.timedOut) return 'timeout';
  return o.unavailable || o.exitCode !== 0 ? 'failed' : 'completed';
}

function finalize(report: Report, state: ExecutionState, recomputedDigest: string | null, rows: VerifyRow[], notes: string[]): VerifyResult {
  const digestOk = recomputedDigest === null || recomputedDigest === report.inputDigest;
  const ok = digestOk && rows.every((r) => r.result !== 'mismatch') && rows.some((r) => r.result === 'match');
  if (!rows.some((r) => r.result === 'match')) notes.push('No claim could be re-checked.');
  return { kind: report.kind, id: report.id, inputDigest: { recorded: report.inputDigest, recomputed: recomputedDigest }, state, rows, ok, notes };
}
