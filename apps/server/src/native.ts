/**
 * Native code generation, correctness and benchmarks through the engine's
 * `codegen` and `native` subcommands.
 */
import type { CandidateDesign, Program, ProgramTarget, Witness } from '@cryptificate/schema';
import type { JobContext, PipelineEnv } from './context.js';
import type { EngineError } from './engine.js';

export interface VariantInput {
  id: string;
  program: Program;
}

export interface VariantCorrectness {
  id: string;
  cases: number;
  passed: boolean;
  checksum?: string;
  witness?: Witness | null;
  detail?: string;
}

export interface CodegenResult {
  /** Raw engine document (sources per variant). */
  raw: unknown;
  /** Source files to store: relative path -> text. */
  files: Record<string, string>;
}

export function targetMatrix(design: CandidateDesign, target: ProgramTarget | undefined): string[][] {
  if (design.model === 'aes-like/gf256/v1') return design.matrix;
  return target === 'internal' ? design.internal : design.external;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Collect `{path or id: source}` pairs from a codegen document. */
export function codegenFiles(doc: unknown): Record<string, string> {
  const files: Record<string, string> = {};
  const root = asRecord(doc);
  if (!root) return files;
  const variants = root['variants'] ?? root['programs'] ?? root['sources'];
  const add = (name: string, text: unknown): void => {
    if (typeof text !== 'string') return;
    const safe = name.replace(/[^A-Za-z0-9._-]/g, '_') || 'variant';
    files[safe.endsWith('.rs') ? safe : `${safe}.rs`] = text;
  };
  if (Array.isArray(variants)) {
    for (const v of variants) {
      const o = asRecord(v);
      if (!o) continue;
      const id = typeof o['id'] === 'string' ? o['id'] : 'variant';
      add(id, o['source'] ?? o['rust'] ?? o['code']);
      const extra = asRecord(o['files']);
      if (extra) for (const [k, t] of Object.entries(extra)) add(`${id}-${k}`, t);
    }
  } else {
    const o = asRecord(variants);
    if (o) for (const [k, t] of Object.entries(o)) add(k, typeof t === 'string' ? t : asRecord(t)?.['source']);
  }
  return files;
}

/** Find per-variant correctness results in a native document. */
export function parseCorrectness(doc: unknown): VariantCorrectness[] {
  const root = asRecord(doc);
  if (!root) return [];
  const list = root['correctness'] ?? root['variants'] ?? root['results'];
  const out: VariantCorrectness[] = [];
  const take = (id: string, v: unknown): void => {
    const o = asRecord(v);
    if (!o) return;
    const c = asRecord(o['correctness']) ?? o;
    const cases = c['cases'];
    const passed = c['passed'];
    if (typeof cases !== 'number' || typeof passed !== 'boolean') return;
    const r: VariantCorrectness = { id, cases, passed };
    if (typeof c['checksum'] === 'string') r.checksum = c['checksum'];
    const w = c['witness'] ?? c['counterexample'];
    if (w && typeof w === 'object') r.witness = w as Witness;
    if (typeof c['detail'] === 'string') r.detail = c['detail'];
    out.push(r);
  };
  if (Array.isArray(list)) {
    for (const v of list) {
      const o = asRecord(v);
      if (o) take(typeof o['id'] === 'string' ? o['id'] : String(out.length), o);
    }
  } else {
    const o = asRecord(list);
    if (o) for (const [k, v] of Object.entries(o)) take(k, v);
  }
  return out;
}

export interface NativeRunResult {
  ok: boolean;
  correctness: VariantCorrectness[];
  raw: unknown;
  codegen: CodegenResult | null;
  error?: EngineError & { kind: string };
  unavailable?: string;
}

export interface NativeOptions {
  design: CandidateDesign;
  target?: ProgramTarget;
  variants: VariantInput[];
  /** "correctness" only, or a benchmark session with a seed. */
  mode: 'correctness' | 'benchmark';
  session?: number;
  seed?: string;
  timeoutMs: number;
  /** Job-relative directory for generated sources and raw results. */
  subdir: string;
  stepName: string;
  /** Codegen output from an earlier step, to avoid regenerating. */
  codegen?: CodegenResult | null;
}

export async function nativeAvailable(env: PipelineEnv): Promise<string | null> {
  if (!env.engine.available) return 'The engine is not built.';
  const subs = await env.engine.subcommands();
  if (!subs.includes('codegen') || !subs.includes('native')) return 'This engine build has no native backend.';
  return null;
}

export async function runNative(env: PipelineEnv, ctx: JobContext, opts: NativeOptions): Promise<NativeRunResult> {
  const unavailable = await nativeAvailable(env);
  if (unavailable) {
    ctx.finish(opts.stepName, 'skipped', unavailable);
    return { ok: false, correctness: [], raw: null, codegen: null, unavailable };
  }
  ctx.start(opts.stepName);
  const matrix = targetMatrix(opts.design, opts.target);
  const field = opts.design.field;
  const width = opts.design.width;
  let codegen = opts.codegen ?? null;
  if (!codegen) {
    const cg = await env.engine.call<unknown>(
      'codegen',
      { field, width, matrix, programs: opts.variants.map((v) => ({ id: v.id, program: v.program })) },
      { signal: ctx.signal, timeoutMs: Math.min(120_000, Math.max(1000, ctx.remainingMs())), replacements: env.replacements, log: ctx.logger },
    );
    if (!cg.ok) {
      ctx.finish(opts.stepName, cg.kind === 'cancelled' ? 'cancelled' : cg.kind === 'timeout' ? 'timeout' : 'failed', cg.error.message);
      return { ok: false, correctness: [], raw: null, codegen: null, error: { ...cg.error, kind: cg.kind } };
    }
    codegen = { raw: cg.value, files: codegenFiles(cg.value) };
    for (const [name, text] of Object.entries(codegen.files)) ctx.write(`native/src/${name}`, text);
  }
  const input: Record<string, unknown> = {
    mode: opts.mode,
    field,
    width,
    matrix,
    codegen: codegen.raw,
  };
  if (opts.seed !== undefined) input['seed'] = opts.seed;
  if (opts.session !== undefined) input['session'] = opts.session;
  const r = await env.engine.call<unknown>('native', input, {
    signal: ctx.signal,
    timeoutMs: Math.max(1000, Math.min(opts.timeoutMs, ctx.remainingMs())),
    replacements: env.replacements,
    log: ctx.logger,
    maxOutputBytes: 64 * 1024 * 1024,
  });
  if (!r.ok) {
    ctx.finish(opts.stepName, r.kind === 'cancelled' ? 'cancelled' : r.kind === 'timeout' ? 'timeout' : 'failed', r.error.message);
    return { ok: false, correctness: [], raw: null, codegen, error: { ...r.error, kind: r.kind } };
  }
  ctx.writeJson(`${opts.subdir}/${opts.mode}${opts.session !== undefined ? `-${opts.session}` : ''}.json`, r.value);
  const correctness = parseCorrectness(r.value);
  ctx.finish(opts.stepName, 'completed');
  return { ok: true, correctness, raw: r.value, codegen };
}
