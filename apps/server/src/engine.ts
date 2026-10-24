/**
 * Wrapper around the `cryptificate-engine` binary: one JSON document on
 * stdin, one on stdout; exit 0 on success, 2 on invalid input.
 */
import { findEngine } from './paths.js';
import { run, type RunResult } from './proc.js';
import { sanitizeLog } from './sanitize.js';

export const ENGINE_SUBCOMMANDS = ['validate', 'diagnose', 'emit-lean', 'search', 'codegen', 'native'] as const;
export type EngineSubcommand = (typeof ENGINE_SUBCOMMANDS)[number];

export interface EngineError {
  code: string;
  message: string;
  path?: string;
}

export type EngineResult<T> =
  | { ok: true; value: T; ms: number; stderr: string }
  | { ok: false; kind: 'invalid'; error: EngineError; ms: number; stderr: string }
  | { ok: false; kind: 'failed' | 'timeout' | 'cancelled' | 'unavailable'; error: EngineError; ms: number; stderr: string };

export interface EngineCallOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** stdout capture limit (engine outputs can carry Lean and Rust sources). */
  maxOutputBytes?: number;
  replacements?: Array<[string, string]>;
  cwd?: string;
}

export class Engine {
  private subcommandsCache: Promise<string[]> | null = null;

  constructor(
    readonly path: string | null,
    private readonly cwd: string,
  ) {}

  static locate(root: string): Engine {
    return new Engine(findEngine(root), root);
  }

  get available(): boolean {
    return this.path !== null;
  }

  /** Subcommands the installed binary advertises in its help text. */
  subcommands(): Promise<string[]> {
    if (!this.path) return Promise.resolve([]);
    if (!this.subcommandsCache) {
      const path = this.path;
      this.subcommandsCache = run(path, ['--help'], { cwd: this.cwd, timeoutMs: 15000 }).then((r) => {
        const text = `${r.stdout}\n${r.stderr}`;
        return ENGINE_SUBCOMMANDS.filter((s) => new RegExp(`(^|\\s)${s}(\\s|$)`, 'm').test(text));
      });
    }
    return this.subcommandsCache;
  }

  async supports(sub: EngineSubcommand): Promise<boolean> {
    return (await this.subcommands()).includes(sub);
  }

  private versionCache: Promise<string | undefined> | null = null;

  version(): Promise<string | undefined> {
    if (!this.path) return Promise.resolve(undefined);
    if (!this.versionCache) {
      this.versionCache = run(this.path, ['--version'], { cwd: this.cwd, timeoutMs: 15000 }).then((r) =>
        r.code === 0 ? r.stdout.trim().split('\n')[0] || undefined : undefined,
      );
    }
    return this.versionCache;
  }

  async call<T>(sub: EngineSubcommand, input: unknown, opts: EngineCallOptions = {}): Promise<EngineResult<T>> {
    if (!this.path) {
      return {
        ok: false,
        kind: 'unavailable',
        error: { code: 'engine-unavailable', message: 'cryptificate-engine is not built (run scripts/setup.sh)' },
        ms: 0,
        stderr: '',
      };
    }
    const r = await run(this.path, [sub], {
      cwd: opts.cwd ?? this.cwd,
      input: JSON.stringify(input),
      timeoutMs: opts.timeoutMs ?? 120000,
      maxOutputBytes: opts.maxOutputBytes ?? 32 * 1024 * 1024,
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
    return interpret<T>(sub, r, opts.replacements ?? []);
  }
}

export function interpret<T>(sub: string, r: RunResult, replacements: Array<[string, string]>): EngineResult<T> {
  const stderr = sanitizeLog(r.stderr, { replacements, maxLength: 64 * 1024 });
  const ms = r.ms;
  if (r.cancelled) return { ok: false, kind: 'cancelled', error: { code: 'cancelled', message: `${sub} was stopped` }, ms, stderr };
  if (r.timedOut) return { ok: false, kind: 'timeout', error: { code: 'timeout', message: `${sub} exceeded its time limit` }, ms, stderr };
  if (r.spawnError !== undefined) {
    return { ok: false, kind: 'unavailable', error: { code: 'engine-unavailable', message: `could not start the engine: ${r.spawnError}` }, ms, stderr };
  }
  if (r.stdoutTruncated) {
    return { ok: false, kind: 'failed', error: { code: 'output-too-large', message: `${sub} produced more output than allowed` }, ms, stderr };
  }
  let doc: unknown;
  try {
    doc = JSON.parse(r.stdout);
  } catch {
    doc = undefined;
  }
  if (r.code === 2) {
    const err = extractError(doc) ?? { code: 'invalid', message: firstLine(stderr) ?? `${sub} rejected the input` };
    return { ok: false, kind: 'invalid', error: err, ms, stderr };
  }
  if (r.code !== 0) {
    const err = extractError(doc) ?? {
      code: 'engine-failed',
      message: `${sub} exited with status ${r.code ?? r.signal ?? 'unknown'}${firstLine(stderr) ? `: ${firstLine(stderr)}` : ''}`,
    };
    return { ok: false, kind: 'failed', error: err, ms, stderr };
  }
  if (doc === undefined) {
    return { ok: false, kind: 'failed', error: { code: 'bad-output', message: `${sub} did not print a JSON document` }, ms, stderr };
  }
  return { ok: true, value: doc as T, ms, stderr };
}

function extractError(doc: unknown): EngineError | null {
  if (!doc || typeof doc !== 'object') return null;
  const e = (doc as Record<string, unknown>)['error'];
  if (!e || typeof e !== 'object') return null;
  const o = e as Record<string, unknown>;
  const err: EngineError = {
    code: typeof o['code'] === 'string' ? o['code'] : 'invalid',
    message: typeof o['message'] === 'string' ? o['message'] : 'invalid input',
  };
  if (typeof o['path'] === 'string') err.path = o['path'];
  return err;
}

function firstLine(s: string): string | undefined {
  const line = s.split('\n').find((l) => l.trim().length > 0);
  return line?.trim().slice(0, 300);
}
