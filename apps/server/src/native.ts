/**
 * Native code generation, correctness and benchmarks through the engine's
 * `codegen` and `native` subcommands.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { CandidateDesign, CandidateOrigin, Program, ProgramTarget, Witness } from '@cryptificate/schema';
import type { JobContext, PipelineEnv } from './context.js';
import type { EngineError } from './engine.js';
import { listFiles, sha256Hex } from './toolchain.js';

export interface VariantInput {
  id: string;
  program: Program;
  /** References (baselines) are compared against; others are contenders. */
  origin?: CandidateOrigin;
}

export interface VariantCorrectness {
  id: string;
  cases: number;
  /** Cases with a wrong output (0 when passed). */
  failures: number;
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

/** Files to keep from a codegen document: each variant's crate (lib.rs, Cargo.toml) and the workspace manifest. */
export function codegenFiles(doc: unknown): Record<string, string> {
  const files: Record<string, string> = {};
  const root = asRecord(doc);
  if (!root) return files;
  const safe = (name: string): string => name.replace(/[^A-Za-z0-9._-]/g, '_') || 'variant';
  const variants = root['variants'];
  if (Array.isArray(variants)) {
    for (const v of variants) {
      const o = asRecord(v);
      if (!o) continue;
      const id = safe(typeof o['id'] === 'string' ? o['id'] : 'variant');
      if (typeof o['source'] === 'string') files[`variants/${id}/src/lib.rs`] = o['source'];
      if (typeof o['manifest'] === 'string') files[`variants/${id}/Cargo.toml`] = o['manifest'];
    }
  }
  const ws = asRecord(root['workspace']);
  if (ws && typeof ws['manifest'] === 'string') files['workspace/Cargo.toml'] = ws['manifest'];
  return files;
}

/** Order paths component by component, as Rust's `Path` ordering does. */
function comparePaths(a: string, b: string): number {
  const pa = a.split('/');
  const pb = b.split('/');
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    if (pa[i] !== pb[i]) return pa[i]! < pb[i]! ? -1 : 1;
  }
  return pa.length - pb.length;
}

/**
 * Files of a crate in the order the engine embeds them: `Cargo.toml`, then
 * everything under `src/`, then `build.rs` when present.
 */
export function crateFiles(dir: string): string[] {
  const files = existsSync(join(dir, 'Cargo.toml')) ? ['Cargo.toml'] : [];
  const src = listFiles(join(dir, 'src'), ['']).map((f) => `src/${f.split('\\').join('/')}`);
  files.push(...src.sort(comparePaths));
  if (existsSync(join(dir, 'build.rs')) && statSync(join(dir, 'build.rs')).isFile()) files.push('build.rs');
  return files;
}

/** The engine's digest of a crate: sha256 over "<path>\0<sha256 of contents>\0" for each file in order. */
export function crateDigest(dir: string, files: readonly string[]): string {
  let all = '';
  for (const rel of files) all += `${rel}\0${sha256Hex(readFileSync(join(dir, rel)))}\0`;
  return `sha256:${sha256Hex(all)}`;
}

/**
 * Keep the sources behind native results with the job: the arithmetic
 * kernels every variant links against and the harness that checks and times
 * them. The kernels are compared with the digest of the copy embedded in the
 * engine; the harness is the checkout's `crates/native`.
 */
export function writeNativeSources(env: PipelineEnv, ctx: JobContext, codegenDoc: unknown): void {
  const crates = join(env.paths.root, 'crates');
  const kernelsDir = join(crates, 'kernels');
  const harnessDir = join(crates, 'native');
  if (!existsSync(kernelsDir) || !existsSync(harnessDir)) return;
  const kernelFiles = crateFiles(kernelsDir);
  for (const rel of kernelFiles) ctx.write(`native/kernels/${rel}`, readFileSync(join(kernelsDir, rel)));
  const harnessFiles = crateFiles(harnessDir);
  for (const rel of harnessFiles) ctx.write(`native/harness/${rel}`, readFileSync(join(harnessDir, rel)));
  const ws = asRecord(asRecord(codegenDoc)?.['workspace']);
  const embedded = typeof ws?.['kernelsSha256'] === 'string' ? ws['kernelsSha256'] : null;
  const local = crateDigest(kernelsDir, kernelFiles);
  const kernelsLine =
    embedded === null
      ? `The engine did not report a digest of its kernels; \`kernels/\` is the checkout's copy (${local}).`
      : embedded === local
        ? `\`kernels/\` matches the kernels the engine compiled into every variant (${embedded}).`
        : `\`kernels/\` is the checkout's copy (${local}); it differs from the kernels the engine compiled (${embedded}), so the engine was built from other sources.`;
  ctx.write(
    'native/SOURCES.md',
    [
      '# Native sources',
      '',
      '- `variants/<id>/`: the generated crate of each circuit (`src/lib.rs` is the crate root named `lib.rs` in its manifest).',
      '- `workspace/Cargo.toml`: the build workspace; its members are `kernels` and `variants/<package>`.',
      `- \`kernels/\`: the arithmetic primitives shared by every variant. ${kernelsLine}`,
      `- \`harness/\`: the correctness and benchmark harness (\`crates/native\` of the checkout; its revision is the checker revision in \`toolchain.json\`).`,
      '- `correctness.json`, `measurements/`: raw results as the engine reported them.',
      '',
    ].join('\n'),
  );
}

/** The codegen document restricted to some variant ids. */
export function restrictCodegen(doc: unknown, ids: ReadonlySet<string>): unknown {
  const root = asRecord(doc);
  if (!root || !Array.isArray(root['variants'])) return doc;
  return { ...root, variants: (root['variants'] as unknown[]).filter((v) => ids.has(String(asRecord(v)?.['id'] ?? ''))) };
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
    const failures = typeof c['failures'] === 'number' ? c['failures'] : passed ? 0 : cases;
    const r: VariantCorrectness = { id, cases, failures, passed };
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
  /** "correctness" only, or one benchmark session (master seed + session number). */
  mode: 'correctness' | 'benchmark';
  session?: number;
  seed?: string;
  timeoutMs: number;
  /** Job-relative directory for generated sources and raw results. */
  subdir: string;
  stepName: string;
  /** Codegen output from an earlier step, to avoid regenerating. */
  codegen?: CodegenResult | null;
  /** Additional correctness inputs, e.g. the distinguishing input of a wiring witness. */
  extraCases?: string[][];
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
      { field, width, matrix, programs: opts.variants.map((v) => ({ id: v.id, program: v.program, ...(v.origin ? { origin: v.origin } : {}) })) },
      { signal: ctx.signal, timeoutMs: Math.min(120_000, Math.max(1000, ctx.remainingMs())), replacements: env.replacements, log: ctx.logger },
    );
    if (!cg.ok) {
      ctx.finish(opts.stepName, cg.kind === 'cancelled' ? 'cancelled' : cg.kind === 'timeout' ? 'timeout' : 'failed', cg.error.message);
      return { ok: false, correctness: [], raw: null, codegen: null, error: { ...cg.error, kind: cg.kind } };
    }
    codegen = { raw: cg.value, files: codegenFiles(cg.value) };
    for (const [name, text] of Object.entries(codegen.files)) ctx.write(`native/${name}`, text);
    try {
      writeNativeSources(env, ctx, cg.value);
    } catch (err) {
      ctx.logger(`native sources not kept: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const input: Record<string, unknown> = {
    mode: opts.mode,
    field,
    width,
    matrix,
    codegen: restrictCodegen(codegen.raw, new Set(opts.variants.map((v) => v.id))),
  };
  if (opts.seed !== undefined) input['seed'] = opts.seed;
  if (opts.session !== undefined) input['session'] = opts.session;
  if (opts.extraCases && opts.extraCases.length > 0) input['extraCases'] = opts.extraCases.slice(0, 256);
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
