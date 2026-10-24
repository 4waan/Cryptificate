/**
 * Running the Lean checker on a generated certificate:
 * `cd lean && lake env lean --threads=1 -M 3072 <file>` under a wall-clock limit.
 */
import type { LeanOutcome } from './acceptance.js';
import { run } from './proc.js';
import { sanitizeLog } from './sanitize.js';

export const LEAN_TIMEOUT_MS = 180_000;
export const LEAN_MEMORY_MB = 3072;

export interface LeanRunOptions {
  lake: string | null;
  leanDir: string;
  file: string;
  timeoutMs: number;
  signal?: AbortSignal;
  replacements: Array<[string, string]>;
}

export interface LeanRunResult {
  outcome: LeanOutcome;
  /** Sanitized combined output for the audit log. */
  log: string;
}

export function leanArgs(file: string): string[] {
  return ['env', 'lean', '--threads=1', `-M`, String(LEAN_MEMORY_MB), file];
}

export async function runLean(opts: LeanRunOptions): Promise<LeanRunResult> {
  if (!opts.lake) {
    return {
      outcome: { exitCode: null, timedOut: false, cancelled: false, unavailable: true, stdout: '', stderr: '', ms: 0 },
      log: 'Lean is not installed (lake was not found).\n',
    };
  }
  const r = await run(opts.lake, leanArgs(opts.file), {
    cwd: opts.leanDir,
    timeoutMs: Math.max(1000, opts.timeoutMs),
    maxOutputBytes: 1024 * 1024,
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
  const outcome: LeanOutcome = {
    exitCode: r.code,
    timedOut: r.timedOut,
    cancelled: r.cancelled,
    unavailable: r.spawnError !== undefined,
    stdout: r.stdout,
    stderr: r.stderr,
    ms: r.ms,
  };
  const parts = [r.stdout];
  if (r.stdoutTruncated) parts.push('[stdout truncated]\n');
  if (r.stderr.trim()) parts.push(`--- stderr ---\n${r.stderr}`);
  if (r.stderrTruncated) parts.push('[stderr truncated]\n');
  if (r.timedOut) parts.push(`--- killed after ${Math.round(r.ms / 1000)} s wall-clock limit ---\n`);
  if (r.cancelled) parts.push('--- stopped on request ---\n');
  if (r.spawnError !== undefined) parts.push(`--- could not start lake: ${r.spawnError} ---\n`);
  if (!r.timedOut && !r.cancelled && r.spawnError === undefined) parts.push(`--- exit status ${r.code ?? r.signal} ---\n`);
  return { outcome, log: sanitizeLog(parts.join(''), { replacements: opts.replacements }) };
}
