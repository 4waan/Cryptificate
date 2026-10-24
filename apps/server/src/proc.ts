/**
 * Subprocess execution. Every command is spawned from an argument array
 * (never through a shell) as the leader of its own process group, so that a
 * timeout or a stop request can kill everything it started.
 */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

export const DEFAULT_MAX_OUTPUT = 1024 * 1024;

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Written to stdin, which is then closed. */
  input?: string;
  /** Wall-clock limit; the process group is killed when it expires. */
  timeoutMs?: number;
  /** Aborting kills the process group. */
  signal?: AbortSignal;
  /** Per-stream capture limit in bytes; further output is discarded. */
  maxOutputBytes?: number;
}

export interface RunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  timedOut: boolean;
  cancelled: boolean;
  /** Set when the command could not be started at all. */
  spawnError?: string;
  ms: number;
}

const live = new Set<ChildProcess>();

/** Kill the process group led by `child` (falls back to the child alone). */
export function killGroup(child: ChildProcess, sig: NodeJS.Signals = 'SIGKILL'): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, sig);
  } catch {
    try {
      child.kill(sig);
    } catch {
      // already gone
    }
  }
}

/** Kill every process group this module started and that is still running. */
export function killAll(): void {
  for (const child of live) killGroup(child);
  live.clear();
}

let exitHookInstalled = false;
function installExitHook(): void {
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  process.once('exit', killAll);
}

class Capture {
  private chunks: Buffer[] = [];
  private size = 0;
  truncated = false;
  constructor(private readonly limit: number) {}
  push(chunk: Buffer): void {
    if (this.size >= this.limit) {
      this.truncated = true;
      return;
    }
    const room = this.limit - this.size;
    if (chunk.length > room) {
      this.chunks.push(chunk.subarray(0, room));
      this.size = this.limit;
      this.truncated = true;
    } else {
      this.chunks.push(chunk);
      this.size += chunk.length;
    }
  }
  text(): string {
    return Buffer.concat(this.chunks).toString('utf8');
  }
}

export function run(command: string, args: readonly string[], opts: RunOptions = {}): Promise<RunResult> {
  installExitHook();
  const started = performance.now();
  const limit = opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;
  return new Promise((resolve) => {
    const out = new Capture(limit);
    const err = new Capture(limit);
    let timedOut = false;
    let cancelled = false;
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const finish = (code: number | null, signal: NodeJS.Signals | null, spawnError?: string): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      const result: RunResult = {
        code,
        signal,
        stdout: out.text(),
        stderr: err.text(),
        stdoutTruncated: out.truncated,
        stderrTruncated: err.truncated,
        timedOut,
        cancelled,
        ms: Math.round(performance.now() - started),
      };
      if (spawnError !== undefined) result.spawnError = spawnError;
      resolve(result);
    };

    if (opts.signal?.aborted) {
      cancelled = true;
      finish(null, null);
      return;
    }

    let child: ChildProcess;
    try {
      child = spawn(command, [...args], {
        cwd: opts.cwd,
        env: opts.env ?? process.env,
        detached: true,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (e) {
      finish(null, null, (e as Error).message);
      return;
    }
    live.add(child);

    function onAbort(): void {
      cancelled = true;
      killGroup(child);
    }
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    if (opts.timeoutMs !== undefined) {
      timer = setTimeout(() => {
        timedOut = true;
        killGroup(child);
      }, Math.max(0, opts.timeoutMs));
    }

    child.stdout?.on('data', (c: Buffer) => out.push(c));
    child.stderr?.on('data', (c: Buffer) => err.push(c));
    child.stdin?.on('error', () => {
      // the child may exit before reading its input
    });
    child.on('error', (e) => {
      live.delete(child);
      finish(null, null, e.message);
    });
    child.on('close', (code, signal) => {
      live.delete(child);
      // make sure nothing the command started keeps running
      if (code === null || timedOut || cancelled) killGroup(child);
      finish(code, signal);
    });
    if (opts.input !== undefined) child.stdin?.end(opts.input);
    else child.stdin?.end();
  });
}
