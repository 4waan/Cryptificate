/**
 * One certificate check: emit the Lean file from templates (engine), run the
 * Lean checker, and accept or reject each expected theorem.
 */
import type { AnalysisRequest, ClaimId, NotEstablishedReason, Witness } from '@cryptificate/schema';
import { acceptCertificate, parseLeanOutput, sameEcho } from './acceptance.js';
import type { AcceptanceResult, ExpectedTheorem, LeanOutcome } from './acceptance.js';
import type { JobContext, PipelineEnv } from './context.js';
import type { EngineError } from './engine.js';
import { LEAN_TIMEOUT_MS, runLean } from './leanrun.js';
import { sha256Hex } from './toolchain.js';

export interface EmitLeanOutput {
  source: string;
  expect: ExpectedTheorem[];
  inputsEcho: Record<string, unknown>;
  /** Claims the generator did not include, with its reason. */
  skipped: Array<{ claim: string; reason: string }>;
}

export function parseEmitLean(doc: unknown): EmitLeanOutput | null {
  if (!doc || typeof doc !== 'object') return null;
  const d = doc as Record<string, unknown>;
  if (typeof d['source'] !== 'string' || !Array.isArray(d['expect'])) return null;
  const expect: ExpectedTheorem[] = [];
  for (const e of d['expect'] as unknown[]) {
    if (!e || typeof e !== 'object') return null;
    const o = e as Record<string, unknown>;
    const status = o['status'];
    if (
      typeof o['claim'] !== 'string' ||
      typeof o['theorem'] !== 'string' ||
      typeof o['expectedType'] !== 'string' ||
      (status !== 'proved' && status !== 'refuted')
    ) {
      return null;
    }
    const entry: ExpectedTheorem = {
      claim: o['claim'] as ClaimId,
      theorem: o['theorem'],
      status,
      expectedType: o['expectedType'],
    };
    if (o['witness'] && typeof o['witness'] === 'object') entry.witness = o['witness'] as Witness;
    expect.push(entry);
  }
  const echo = d['inputsEcho'];
  const skipped: Array<{ claim: string; reason: string }> = [];
  if (Array.isArray(d['skipped'])) {
    for (const x of d['skipped'] as unknown[]) {
      const o = x as Record<string, unknown> | null;
      if (o && typeof o['claim'] === 'string' && typeof o['reason'] === 'string') skipped.push({ claim: o['claim'], reason: o['reason'] });
    }
  }
  return {
    source: d['source'],
    expect,
    inputsEcho: echo && typeof echo === 'object' && !Array.isArray(echo) ? (echo as Record<string, unknown>) : {},
    skipped,
  };
}

/**
 * Values Lean must echo, derived independently from the normalized request.
 * Keys follow the constant names of the certificate templates.
 */
export function derivedEcho(req: AnalysisRequest): Record<string, unknown> {
  const d = req.design;
  const out: Record<string, unknown> = {};
  if (d.model === 'aes-like/gf256/v1') {
    out['candMatrix'] = d.matrix;
    out['candOffsets'] = d.offsets;
    out['candRounds'] = d.rounds;
    // the S-box is echoed as its request spec: {"kind":"aes"} or {"kind":"table","table":[...]}
    out['candSboxTable'] = d.sbox.kind === 'aes' ? { kind: 'aes' } : { kind: 'table', table: d.sbox.table };
  } else {
    out['candExternal'] = d.external;
    out['candInternal'] = d.internal;
    out['candExponent'] = d.sbox.exponent;
    out['candFullRounds'] = d.fullRounds;
    out['candPartialRounds'] = d.partialRounds;
  }
  if (req.program) {
    // the display name is not part of the certificate
    const p = req.program;
    out['candProgram'] = { field: p.field, width: p.width, instructions: p.instructions, outputs: p.outputs };
  }
  return out;
}

export interface CertificateCheck {
  emit: EmitLeanOutput | null;
  emitError?: EngineError & { kind: string };
  outcome: LeanOutcome | null;
  acceptance: AcceptanceResult | null;
  leanSourceSha256?: string;
  leanFile?: string;
  auditLog: string;
  /** Set when no claim could be checked by Lean. */
  problem?: { reason: NotEstablishedReason; detail: string };
}

export interface CertificateOptions {
  /** Directory, relative to the job, for Cert.lean and audit.txt. */
  subdir: string;
  emitStep: string;
  leanStep: string;
  /** Called after emit-lean, before Lean runs; return true to skip Lean. */
  beforeLean?: (emit: EmitLeanOutput, sha: string) => boolean;
}

export async function checkCertificate(env: PipelineEnv, ctx: JobContext, request: AnalysisRequest, opts: CertificateOptions): Promise<CertificateCheck> {
  ctx.start(opts.emitStep);
  const emitted = await env.engine.call<unknown>('emit-lean', request, {
    signal: ctx.signal,
    timeoutMs: Math.min(60_000, Math.max(1000, ctx.remainingMs())),
    replacements: env.replacements,
  });
  if (!emitted.ok) {
    ctx.finish(opts.emitStep, emitted.kind === 'cancelled' ? 'cancelled' : emitted.kind === 'timeout' ? 'timeout' : emitted.kind === 'invalid' ? 'invalid' : 'failed', emitted.error.message);
    const reason: NotEstablishedReason = emitted.kind === 'cancelled' ? 'cancelled' : emitted.kind === 'unavailable' ? 'engine-unavailable' : 'lean-failed';
    return {
      emit: null,
      emitError: { ...emitted.error, kind: emitted.kind },
      outcome: null,
      acceptance: null,
      auditLog: '',
      problem: { reason, detail: `The certificate could not be generated: ${emitted.error.message}.` },
    };
  }
  const emit = parseEmitLean(emitted.value);
  if (!emit) {
    ctx.finish(opts.emitStep, 'failed', 'unexpected emit-lean output');
    return {
      emit: null,
      emitError: { code: 'bad-output', message: 'emit-lean returned an unexpected document', kind: 'failed' },
      outcome: null,
      acceptance: null,
      auditLog: '',
      problem: { reason: 'lean-failed', detail: 'The certificate generator returned an unexpected document.' },
    };
  }
  const sha = sha256Hex(emit.source);
  const leanFile = ctx.write(`${opts.subdir}/Cert.lean`, emit.source);
  ctx.finish(opts.emitStep, 'completed', `${emit.expect.length} theorem(s)`);

  if (opts.beforeLean?.(emit, sha)) {
    return { emit, outcome: null, acceptance: null, leanSourceSha256: sha, leanFile, auditLog: '' };
  }

  if (ctx.cancelled) {
    return { emit, outcome: null, acceptance: null, leanSourceSha256: sha, leanFile, auditLog: '', problem: { reason: 'cancelled', detail: 'Stopped before Lean ran.' } };
  }
  const remaining = ctx.remainingMs();
  if (remaining < 1000) {
    ctx.finish(opts.leanStep, 'not_run', 'budget exhausted');
    return {
      emit,
      outcome: null,
      acceptance: null,
      leanSourceSha256: sha,
      leanFile,
      auditLog: '',
      problem: { reason: 'not-run', detail: 'The time budget ran out before Lean could run.' },
    };
  }
  const limit = Math.min(env.leanTimeoutMs ?? LEAN_TIMEOUT_MS, remaining);
  ctx.start(opts.leanStep, `limit ${Math.round(limit / 1000)} s`);
  const { outcome, log } = await runLean({
    lake: env.lake,
    leanDir: env.paths.leanDir,
    file: leanFile,
    timeoutMs: limit,
    signal: ctx.signal,
    replacements: env.replacements,
  });
  ctx.write(`${opts.subdir}/audit.txt`, log);

  // Expected echoes: the engine's statement of what it substituted, checked
  // against values derived here from the normalized request.
  const expected: Record<string, unknown> = { ...emit.inputsEcho };
  const derived = derivedEcho(request);
  const echoed = parseLeanOutput(outcome.stdout, [leanFile]).inputs;
  const engineMismatch: string[] = [];
  // every candidate constant the file defines must be echoed
  const defined = new Set([...emit.source.matchAll(/^(?:noncomputable\s+)?(?:def|abbrev)\s+(cand[A-Za-z0-9_]*)\b/gm)].map((m) => m[1]!));
  for (const [k, v] of Object.entries(derived)) {
    if (k in expected && !sameEcho(expected[k], v)) engineMismatch.push(k);
    if (k in expected || echoed.has(k) || defined.has(k)) expected[k] = v;
  }
  const acceptance = acceptCertificate(emit.expect, expected, outcome, [leanFile]);
  if (engineMismatch.length > 0 && acceptance.inputsMatch) {
    // The engine's echo table disagrees with the request: refuse everything.
    for (const v of acceptance.verdicts) {
      v.status = 'not_established';
      v.accepted = false;
      v.reason = 'audit-input-mismatch';
      v.detail = `The generated certificate does not describe the submitted ${engineMismatch.join(', ')}.`;
    }
    acceptance.inputsMatch = false;
    acceptance.inputProblems.push(...engineMismatch.map((k) => `${k} differs from the request`));
  }
  const state = outcome.cancelled ? 'cancelled' : outcome.timedOut ? 'timeout' : outcome.unavailable ? 'failed' : outcome.exitCode === 0 ? 'completed' : 'failed';
  const accepted = acceptance.verdicts.filter((v) => v.accepted).length;
  ctx.finish(opts.leanStep, state, `${accepted}/${emit.expect.length} theorem(s) accepted`);
  return { emit, outcome, acceptance, leanSourceSha256: sha, leanFile, auditLog: log };
}
