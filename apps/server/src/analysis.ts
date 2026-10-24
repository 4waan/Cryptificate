/**
 * Analysis pipeline: validate -> diagnose -> emit-lean -> Lean -> native
 * correctness -> report.
 */
import { canonicalJson, designClaimsFor, IMPLEMENTATION_CLAIMS, normalizeAnalysisRequest, EVIDENCE_LABELS } from '@cryptificate/schema';
import type { AnalysisReport, AnalysisRequest, Claim, NotEstablishedReason, Witness } from '@cryptificate/schema';
import { cacheKey, ProofCache } from './cache.js';
import { checkCertificate } from './certificate.js';
import type { CertificateCheck } from './certificate.js';
import { buildAnalysisClaims, diagnosticWitness } from './claims.js';
import type { NativeOutcome } from './claims.js';
import type { JobContext, PipelineEnv, PipelineResult } from './context.js';
import { toolchainDocument } from './bundle.js';
import { runNative } from './native.js';
import { refinementStatus } from './refinement.js';
import { sha256Hex, templatesDigest } from './toolchain.js';

export const ANALYSIS_STEPS = ['validate', 'diagnose', 'emit-lean', 'lean', 'native', 'report'] as const;
export const ANALYSIS_BUDGET_MS = 300_000;

export interface Normalized<T> {
  request: T;
  inputDigest: string;
}

/** Pull the normalized request and digest out of the engine's validate output. */
export function parseValidate<T>(doc: unknown, fallback: T): Normalized<T> {
  const d = (doc && typeof doc === 'object' ? doc : {}) as Record<string, unknown>;
  const req = (d['request'] ?? d['normalized'] ?? (d['design'] ? d : undefined)) as T | undefined;
  const request = req && typeof req === 'object' ? stripMeta(req) : fallback;
  const digest = typeof d['inputDigest'] === 'string' ? d['inputDigest'] : `sha256:${sha256Hex(canonicalJson(request))}`;
  return { request, inputDigest: digest };
}

function stripMeta<T>(req: T): T {
  const copy = { ...(req as Record<string, unknown>) };
  delete copy['inputDigest'];
  delete copy['kind'];
  return copy as T;
}

/** Inputs of distinguishing-input witnesses, as extra native correctness cases. */
export function wiringWitnesses(witnesses: ReadonlyArray<Witness | null | undefined>): string[][] {
  const out: string[][] = [];
  for (const w of witnesses) {
    if (w && w.kind === 'distinguishing-input' && !out.some((x) => x.join() === w.input.join())) out.push([...w.input]);
  }
  return out;
}

export function allClaimsNotEstablished(req: AnalysisRequest, reason: NotEstablishedReason, note: string): Claim[] {
  return [...designClaimsFor(req.design.model), ...IMPLEMENTATION_CLAIMS].map((info) => ({
    id: info.id,
    chain: info.chain,
    title: info.title,
    status: 'not_established',
    evidence: { kind: 'diagnostic', label: EVIDENCE_LABELS.uncheckedDiagnostic },
    witness: null,
    note,
    reason,
  }));
}

export async function runAnalysis(env: PipelineEnv, ctx: JobContext, raw: AnalysisRequest): Promise<PipelineResult> {
  const tc = await env.toolchain();
  ctx.writeJson('toolchain.json', toolchainDocument(tc));
  const fallback = normalizeAnalysisRequest(raw);
  const provenanceBase = { origin: 'live' as const, checker: tc.checker, toolchain: tc.pins };

  const makeReport = (inputs: AnalysisRequest, inputDigest: string, claims: Claim[], state: AnalysisReport['execution']['state'], extra: Partial<AnalysisReport['provenance']> = {}): AnalysisReport => ({
    kind: 'analysis',
    id: ctx.id,
    inputDigest,
    inputs,
    claims,
    execution: { state, steps: ctx.executionSteps() },
    provenance: { ...provenanceBase, origin: ctx.origin, ...extra },
  });

  // 1. validate
  ctx.start('validate');
  const validated = await env.engine.call<unknown>('validate', raw, { signal: ctx.signal, timeoutMs: 30_000, replacements: env.replacements, log: ctx.logger });
  if (!validated.ok) {
    if (validated.kind === 'invalid') {
      ctx.finish('validate', 'invalid', validated.error.message);
      ctx.closeRemaining('not_run');
      return { state: 'invalid', report: null, error: validated.error };
    }
    if (validated.kind === 'cancelled') {
      ctx.finish('validate', 'cancelled');
      ctx.closeRemaining('cancelled');
      const digest = `sha256:${sha256Hex(canonicalJson(fallback))}`;
      return { state: 'cancelled', report: makeReport(fallback, digest, allClaimsNotEstablished(fallback, 'cancelled', 'Stopped before any check ran.'), 'cancelled') };
    }
    ctx.finish('validate', 'failed', validated.error.message);
    ctx.closeRemaining('not_run');
    const reason: NotEstablishedReason = validated.kind === 'unavailable' ? 'engine-unavailable' : 'not-run';
    const digest = `sha256:${sha256Hex(canonicalJson(fallback))}`;
    const report = makeReport(fallback, digest, allClaimsNotEstablished(fallback, reason, `No check ran: ${validated.error.message}.`), 'failed');
    ctx.setReport(report);
    return { state: 'failed', report, error: validated.error };
  }
  const { request, inputDigest } = parseValidate<AnalysisRequest>(validated.value, fallback);
  ctx.finish('validate', 'completed');
  ctx.writeJson('inputs.json', request);
  ctx.setReport(makeReport(request, inputDigest, [], 'running'));

  // 2. diagnose (unchecked)
  ctx.start('diagnose');
  const diag = await env.engine.call<unknown>('diagnose', request, { signal: ctx.signal, timeoutMs: 60_000, replacements: env.replacements, log: ctx.logger });
  let diagnostics: unknown = null;
  if (diag.ok) {
    diagnostics = diag.value;
    ctx.writeJson('engine/diagnose.json', diagnostics);
    ctx.finish('diagnose', 'completed');
  } else {
    ctx.finish('diagnose', diag.kind === 'cancelled' ? 'cancelled' : 'failed', diag.error.message);
  }

  // 3-4. certificate + Lean, with the proof cache in front of Lean
  const cache = env.noCache ? null : new ProofCache(env.paths.cacheDir);
  let key: string | undefined;
  let cachedReport: AnalysisReport | null = null;
  let cert: CertificateCheck | null = null;
  if (!ctx.cancelled) {
    cert = await checkCertificate(env, ctx, request, {
      subdir: 'lean',
      emitStep: 'emit-lean',
      leanStep: 'lean',
      beforeLean: (_emit, sha) => {
        key = cacheKey({ inputDigest, pins: tc.pins, checker: tc.checker, templatesSha256: templatesDigest(env.paths), leanSourceSha256: sha });
        const hit = cache?.get(key);
        if (!hit) return false;
        cachedReport = hit.report;
        ctx.write('lean/audit.txt', hit.audit);
        ctx.finish('lean', 'skipped', `proof cache hit (run ${hit.report.id})`);
        ctx.setOrigin('cached');
        return true;
      },
    });
  }

  if (cachedReport !== null) {
    const hit: AnalysisReport = cachedReport;
    ctx.finish('native', 'skipped', 'proof cache hit');
    ctx.finish('report', 'completed');
    const report: AnalysisReport = {
      ...hit,
      id: ctx.id,
      inputs: request,
      inputDigest,
      claims: hit.claims.map((c) => ({ ...c })),
      execution: { state: 'completed', steps: ctx.executionSteps() },
      provenance: { ...hit.provenance, origin: 'cached', cachedFrom: hit.id, ...(key ? { cacheKey: key } : {}) },
    };
    ctx.writeJson('report.json', report);
    ctx.setReport(report);
    return { state: 'completed', report };
  }

  // Partial report: the Lean-backed claims are final once Lean has run.
  if (cert?.emit) {
    const partial = buildAnalysisClaims({
      request,
      expect: cert.emit.expect,
      verdicts: cert.acceptance?.verdicts ?? [],
      diagnostics,
      ...(cert.problem ? { leanProblem: cert.problem } : {}),
      native: null,
      skipped: cert.emit.skipped,
    });
    for (const c of partial) {
      if (c.id === 'native.correctness' && request.program && !env.skipNative) c.note = 'Native correctness is running.';
    }
    ctx.setReport(makeReport(request, inputDigest, partial, 'running', cert.leanSourceSha256 ? { leanSourceSha256: cert.leanSourceSha256 } : {}));
  }

  // 5. native correctness of the submitted circuit
  let native: NativeOutcome | { unavailable: string } | null = null;
  if (request.program && env.skipNative) {
    ctx.finish('native', 'skipped', 'not requested');
    native = { unavailable: 'Native correctness was not re-run.' };
  } else if (request.program && !ctx.cancelled) {
    const nr = await runNative(env, ctx, {
      design: request.design,
      ...(request.target ? { target: request.target } : {}),
      variants: [{ id: 'user', program: request.program }],
      mode: 'correctness',
      timeoutMs: 300_000,
      subdir: 'native',
      stepName: 'native',
      extraCases: wiringWitnesses([...(cert?.emit?.expect ?? []).map((e) => e.witness ?? null), diagnosticWitness(diagnostics, 'circuit.equivalence')]),
    });
    if (nr.unavailable) native = { unavailable: nr.unavailable };
    else if (!nr.ok) native = { unavailable: `Native correctness did not complete: ${nr.error?.message ?? 'unknown error'}.` };
    else {
      const r = nr.correctness.find((c) => c.id === 'user') ?? nr.correctness[0];
      native = r
        ? { cases: r.cases, failures: r.failures, passed: r.passed, ...(r.checksum ? { checksum: r.checksum } : {}), witness: r.witness ?? null, ...(r.detail ? { detail: r.detail } : {}) }
        : { unavailable: 'The native backend returned no result.' };
    }
  } else if (!request.program) {
    ctx.finish('native', 'skipped', 'no circuit submitted');
  }

  // 6. report
  ctx.start('report');
  const leanState = cert?.outcome;
  const leanProblem = cert?.problem ?? (ctx.cancelled && !cert ? { reason: 'cancelled' as const, detail: 'Stopped before Lean ran.' } : undefined);
  const claims = buildAnalysisClaims({
    request,
    expect: cert?.emit?.expect ?? [],
    verdicts: cert?.acceptance?.verdicts ?? [],
    diagnostics,
    ...(leanProblem ? { leanProblem } : {}),
    native,
    skipped: cert?.emit?.skipped ?? [],
    refinement: request.program ? refinementStatus(env.paths, request.design.field) : null,
  });
  if (!cert?.emit && leanProblem) {
    // Without a certificate no design or circuit claim was checked.
    for (const c of claims) {
      if (c.status === 'not_established' && c.reason === 'out-of-scope') {
        c.reason = leanProblem.reason;
        c.note = leanProblem.detail;
      }
    }
  }
  let state: PipelineResult['state'] = 'completed';
  if (ctx.cancelled || leanState?.cancelled) state = 'cancelled';
  else if (leanState?.timedOut) state = 'timeout';
  else if (cert?.emitError && cert.emitError.kind === 'invalid') state = 'invalid';
  else if (!cert?.emit || leanState?.unavailable || (leanState && leanState.exitCode !== 0)) state = 'failed';
  ctx.finish('report', 'completed');
  if (state === 'cancelled') ctx.closeRemaining('cancelled');
  else ctx.closeRemaining('not_run');

  const extra: Partial<AnalysisReport['provenance']> = {};
  if (cert?.leanSourceSha256) extra.leanSourceSha256 = cert.leanSourceSha256;
  if (key) extra.cacheKey = key;
  const report = makeReport(request, inputDigest, claims, state, extra);
  ctx.writeJson('report.json', report);
  ctx.setReport(report);

  // Only a clean, complete Lean run is cached.
  if (state === 'completed' && cache && key && cert?.emit && cert.outcome && cert.outcome.exitCode === 0 && !cert.outcome.timedOut) {
    cache.put(key, { report, leanSource: cert.emit.source, audit: cert.auditLog });
  }
  const result: PipelineResult = { state, report };
  if (cert?.emitError && state !== 'completed') result.error = { code: cert.emitError.code, message: cert.emitError.message, ...(cert.emitError.path ? { path: cert.emitError.path } : {}) };
  return result;
}
