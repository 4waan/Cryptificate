/**
 * `cryptificate verify <bundle>`: re-derive the claims of a bundle with the
 * installed engine, templates and Lean checker. Only inputs.json and
 * report.json are read from the bundle; bundled Lean, Rust and shell files
 * are never executed.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { validateAnalysisRequest, validateExperimentRequest } from '@cryptificate/schema';
import type { AnalysisReport, AnalysisRequest, Claim, ExperimentReport, Report } from '@cryptificate/schema';
import { runAnalysis, ANALYSIS_STEPS } from './analysis.js';
import { checkCertificate } from './certificate.js';
import { sameEcho } from './acceptance.js';
import { buildAnalysisClaims, VALUE_CLAIMS } from './claims.js';
import { JobContext } from './context.js';
import type { PipelineEnv } from './context.js';
import { run } from './proc.js';
import { readTarGz } from './tar.js';

export type MatchKind = 'match' | 'mismatch' | 'historical' | 'not re-checked' | 'not recorded';

export interface VerifyRow {
  subject: string;
  claim: string;
  recorded: string;
  recomputed: string;
  result: MatchKind;
}

export interface VerifyResult {
  kind: Report['kind'];
  id: string;
  inputDigest: { recorded: string; recomputed: string | null };
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

const RECHECKED: ReadonlySet<string> = new Set([
  'field.prime',
  'matrix.mds',
  'offsets.dispersion',
  'sbox.bijective',
  'sbox.differential',
  'sbox.linearity',
  'activity.bound',
  'external.mds',
  'internal.invertible',
  'activity.outer',
  'activity.partial',
  'activity.total',
  'circuit.equivalence',
]);

/**
 * How a bundle is shown to predate a group of claims:
 *
 * - `revision`: the checker revision the bundle records is a commit of the
 *   local checkout whose claim list does not name the group's claims (see
 *   `predatesAddedClaims`);
 * - `certificate`: the bundle records a Lean source digest and it differs from
 *   the digest of the certificate regenerated now, so the bundle was produced
 *   by a different engine or template set.
 */
export type PredatingEvidence = 'revision' | 'certificate';

export interface AddedClaimGroup {
  readonly ids: readonly string[];
  readonly evidence: PredatingEvidence;
}

/**
 * Claims that reports did not carry before a later release, one group per
 * release step. A bundle that lacks every claim of a group, and is shown by
 * the group's evidence to predate it, has no status for them to compare with:
 * they are re-derived and shown as `not recorded`. A bundle that lacks only
 * some claims of a group, or cannot be shown to predate it, gets `mismatch`
 * for each missing one, as for every other re-checked claim.
 */
export const ADDED_LATER: readonly AddedClaimGroup[] = [
  { ids: ['activity.partial', 'activity.total'], evidence: 'revision' },
  { ids: ['sbox.differential', 'sbox.linearity'], evidence: 'certificate' },
];

/** The schema file whose claim list gained the `revision` groups of `ADDED_LATER`. */
const CLAIM_LIST_FILE = 'packages/schema/src/constants.ts';

/**
 * The commit named by a checker string `cryptificate <version> (<revision>)`,
 * as `git describe --always --dirty --tags` printed it. `null` for a missing
 * or malformed revision, and for a dirty tree, whose uncommitted changes may
 * already have had the newer claims.
 */
export function recordedRevision(checker: unknown): string | null {
  if (typeof checker !== 'string') return null;
  const m = /^cryptificate \S+ \(([^()\s]+)\)$/.exec(checker);
  if (!m) return null;
  const rev = m[1]!;
  if (rev.endsWith('-dirty')) return null;
  const described = /-g([0-9a-f]{7,40})$/.exec(rev);
  const name = described ? described[1]! : rev;
  // A hash or a tag name; never anything git could read as an option.
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(name) ? name : null;
}

/**
 * Whether the checker that recorded a bundle provably predates the
 * `revision` groups of `ADDED_LATER`: its revision is a commit of the local
 * checkout whose claim list names none of their claims. Without git, without
 * that commit, or with a dirty or missing revision this cannot be shown, and
 * the answer is `false`.
 */
export async function predatesAddedClaims(root: string, checker: unknown): Promise<boolean> {
  const rev = recordedRevision(checker);
  if (!rev) return false;
  const r = await run('git', ['-C', root, 'show', `${rev}:${CLAIM_LIST_FILE}`], { timeoutMs: 10000 });
  if (r.code !== 0) return false;
  const ids = ADDED_LATER.filter((g) => g.evidence === 'revision').flatMap((g) => g.ids);
  return ids.every((id) => !r.stdout.includes(`'${id}'`));
}

export interface CompareOptions {
  /** The recording checker predates the `revision` groups (`predatesAddedClaims`). */
  predatesRevision?: boolean;
  /**
   * The bundle records a Lean source digest and it differs from the digest of
   * the certificate regenerated now (evidence for the `certificate` groups).
   */
  olderCertificate?: boolean;
}

function hasEvidence(opts: CompareOptions, evidence: PredatingEvidence): boolean {
  return evidence === 'revision' ? (opts.predatesRevision ?? false) : (opts.olderCertificate ?? false);
}

/** The group of `ADDED_LATER` a claim belongs to, if any. */
export function addedLaterGroup(id: string): AddedClaimGroup | undefined {
  return ADDED_LATER.find((g) => g.ids.includes(id));
}

/** Value of a proved value claim as shown in a row: its status and witness. */
function valueText(c: Claim): string {
  const w = c.witness;
  if (w?.kind === 'sbox-differential') return `${c.status} (uniformity ${w.uniformity} at ${w.inputDifference}/${w.outputDifference})`;
  if (w?.kind === 'sbox-linearity') return `${c.status} (linearity ${w.linearity} at ${w.inputMask}/${w.outputMask})`;
  return c.witness ? `${c.status} (witness)` : c.status;
}

/**
 * Compare recorded claims with the recomputed ones. A re-checked claim
 * matches when its status is the same; a value claim (VALUE_CLAIMS) also
 * needs the same witness, since its status alone does not carry the value.
 * Re-checked claims missing from the bundle are mismatches, except a group of
 * `ADDED_LATER` that the bundle lacks entirely and provably predates, which is
 * `not recorded`.
 */
export function compareClaims(subject: string, recorded: readonly Claim[], recomputed: readonly Claim[], native: boolean, opts: CompareOptions = {}): VerifyRow[] {
  // Groups the bundle may omit: it lacks all of their claims and predates them.
  const omittable = ADDED_LATER.filter((g) => hasEvidence(opts, g.evidence) && g.ids.every((id) => !recorded.some((r) => r.id === id)));
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
    if (VALUE_CLAIMS.has(rc.id)) {
      const same = now.status === rc.status && sameEcho(rc.witness ?? null, now.witness ?? null);
      rows.push({ subject, claim: rc.id, recorded: valueText(rc), recomputed: valueText(now), result: same ? 'match' : 'mismatch' });
      continue;
    }
    rows.push({ subject, claim: rc.id, recorded: rc.status, recomputed: now.status, result: now.status === rc.status ? 'match' : 'mismatch' });
  }
  for (const c of recomputed) {
    if (!recorded.some((r) => r.id === c.id) && RECHECKED.has(c.id)) {
      const result = omittable.some((g) => g.ids.includes(c.id)) ? 'not recorded' : 'mismatch';
      rows.push({ subject, claim: c.id, recorded: 'missing', recomputed: VALUE_CLAIMS.has(c.id) ? valueText(c) : c.status, result });
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
        const recorded = (report as AnalysisReport).claims;
        const checker = (report as AnalysisReport).provenance?.checker;
        const predatesRevision = await predatesAddedClaims(env.paths.root, checker);
        const recordedSource = report.provenance.leanSourceSha256;
        const recomputedSource = now?.provenance.leanSourceSha256;
        const olderCertificate = recordedSource !== undefined && recomputedSource !== undefined && recordedSource !== recomputedSource;
        let rows = compareClaims('design', recorded, now?.claims ?? [], opts.native ?? false, { predatesRevision, olderCertificate });
        rows = rows.map((r) => ({ ...r, subject: r.claim.startsWith('circuit') || r.claim.startsWith('native') || r.claim.startsWith('rust') ? 'implementation' : 'design' }));
        if (recomputedDigest && recomputedDigest !== report.inputDigest) notes.push('The recomputed input digest differs from the recorded one.');
        if (result.state !== 'completed') notes.push(`The re-run ended with state ${result.state}.`);
        const missingAdded = (evidence: PredatingEvidence, kind: MatchKind) =>
          rows.filter((r) => r.recorded === 'missing' && r.result === kind && addedLaterGroup(r.claim)?.evidence === evidence).map((r) => r.claim);
        const unrecordedByRevision = missingAdded('revision', 'not recorded');
        if (unrecordedByRevision.length > 0) notes.push(`The bundle has no recorded status for ${unrecordedByRevision.join(' and ')}: it was recorded by ${String(checker)}, whose claim list does not name them. They were derived now and are not compared.`);
        const lackingByRevision = missingAdded('revision', 'mismatch');
        if (lackingByRevision.length > 0) notes.push(`The bundle has no recorded status for ${lackingByRevision.join(' and ')}, and its checker (${String(checker ?? 'not recorded')}) could not be shown to predate them in this checkout, so the omission counts as a mismatch.`);
        const unrecordedByCertificate = missingAdded('certificate', 'not recorded');
        if (unrecordedByCertificate.length > 0) {
          notes.push(
            `The bundle does not record ${unrecordedByCertificate.join(', ')}, which the installed engine produces. Its Lean certificate differs from the ` +
              'regenerated one, as for a bundle recorded before these claims existed; the bundle is not signed, so verify cannot rule out ' +
              'that they were removed from it.',
          );
        }
        notes.push('Timings in the bundle are historical and were not re-measured.');
        return finalize(report, recomputedDigest, rows, notes);
      }
      // experiment: re-check the equivalence claim of every recorded candidate
      const exp = report as ExperimentReport;
      const v = validateExperimentRequest(inputs);
      if (!v.ok) throw new Error(`inputs.json is not a valid experiment request: ${v.errors[0]?.path} ${v.errors[0]?.message}`);
      const design = v.value.design;
      const target = design.model === 'hades/bn254/v1' ? 'external' : 'matrix';
      const rows: VerifyRow[] = [];
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
        rows.push({ subject: cand.id, claim: 'circuit.equivalence', recorded: cand.equivalence.status, recomputed: status, result: status === cand.equivalence.status ? 'match' : 'mismatch' });
        if (cand.native) rows.push({ subject: cand.id, claim: 'native.correctness', recorded: cand.native.passed ? 'passed' : 'failed', recomputed: '-', result: 'not re-checked' });
      }
      if (exp.measurements) {
        rows.push({ subject: 'measurements', claim: 'native.timing', recorded: exp.measurements.verdict, recomputed: '-', result: 'historical' });
      }
      notes.push('Benchmark results are historical measurements from the machine that produced the bundle.');
      return finalize(report, null, rows, notes);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  } finally {
    if (!opts.keep) rmSync(dir, { recursive: true, force: true });
    else log(`bundle extracted to ${dir}`);
  }
}

function finalize(report: Report, recomputedDigest: string | null, rows: VerifyRow[], notes: string[]): VerifyResult {
  const digestOk = recomputedDigest === null || recomputedDigest === report.inputDigest;
  const ok = digestOk && rows.every((r) => r.result !== 'mismatch') && rows.some((r) => r.result === 'match');
  if (!rows.some((r) => r.result === 'match')) notes.push('No claim could be re-checked.');
  return { kind: report.kind, id: report.id, inputDigest: { recorded: report.inputDigest, recomputed: recomputedDigest }, rows, ok, notes };
}
