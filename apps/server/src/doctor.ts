/**
 * `cryptificate doctor`: check that this machine can run Cryptificate and say
 * how to fix what is missing.
 *
 * The checks change nothing, with two exceptions: the state-directory check
 * writes and removes one probe file when the directory exists, and lake may
 * refresh its own configuration cache under lean/.lake. `lake build --no-build`
 * reports whether a build is needed without building anything. The Lean checks
 * never start lake while the pinned toolchain is missing, because the elan
 * launcher would then download it.
 */
import { randomBytes } from 'node:crypto';
import { accessSync, constants, existsSync, readdirSync, readFileSync, rmSync, statSync, statfsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { PipelineEnv } from './context.js';
import { which } from './paths.js';
import { run } from './proc.js';
import type { RunOptions, RunResult } from './proc.js';
import { readLeanPins } from './toolchain.js';

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip';

export interface DoctorCheck {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
  /** Command (or instruction) that fixes a failed or warned check. */
  fix?: string;
}

export interface DoctorReport {
  format: 'cryptificate-doctor/v1';
  checker: string;
  ok: boolean;
  checks: DoctorCheck[];
}

export interface DoctorProbes {
  nodeVersion: string;
  /** The elan launcher, or null when it is not installed. */
  elan: string | null;
  run: (command: string, args: readonly string[], opts?: RunOptions) => Promise<RunResult>;
  /** GET a URL; resolves with the status and parsed JSON body (null when not JSON). */
  getJson: (url: string, timeoutMs: number) => Promise<{ status: number; body: unknown }>;
  /** Free bytes available to this user on the file system holding `path`. */
  freeBytes: (path: string) => number;
  serviceUrl: string;
}

/** Oldest Node.js major version the command supports (package.json "engines"). */
export const MIN_NODE_MAJOR = 20;
export const DISK_FAIL_BYTES = 512 * 1024 * 1024;
export const DISK_WARN_BYTES = 2 * 1024 * 1024 * 1024;
export const DEFAULT_SERVICE_URL = 'http://127.0.0.1:4173';
const LAKE_CHECK_MS = 180_000;
const SERVICE_MS = 2000;

/** `s` as one POSIX shell word: unchanged when it holds only safe characters, else single-quoted. */
export function shellQuote(s: string): string {
  return /^[A-Za-z0-9_\/.,:@%+=-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}

export function findElan(): string | null {
  const onPath = which('elan');
  if (onPath) return onPath;
  const p = join(homedir(), '.elan', 'bin', 'elan');
  return existsSync(p) ? p : null;
}

export function defaultProbes(serviceUrl = DEFAULT_SERVICE_URL): DoctorProbes {
  return {
    nodeVersion: process.versions.node,
    elan: findElan(),
    run,
    getJson: async (url, timeoutMs) => {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
      const text = await res.text();
      let body: unknown = null;
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = null;
      }
      return { status: res.status, body };
    },
    freeBytes: (path) => {
      const s = statfsSync(path);
      return Number(s.bavail) * Number(s.bsize);
    },
    serviceUrl,
  };
}

function gib(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
}

/** fetch reports "fetch failed" and keeps the system error code in `cause`. */
function reason(e: unknown): string {
  const cause = (e as { cause?: { code?: unknown; message?: unknown } }).cause;
  if (cause && typeof cause.code === 'string') return cause.code;
  if ((e as Error).name === 'TimeoutError') return 'no answer within 2 s';
  return (e as Error).message;
}

function firstLine(s: string): string {
  return (s.split('\n').find((l) => l.trim()) ?? '').trim().slice(0, 200);
}

/** The nearest existing directory at or above `p`. */
function existingAncestor(p: string): string {
  let d = p;
  while (!existsSync(d)) {
    const parent = dirname(d);
    if (parent === d) break;
    d = parent;
  }
  return d;
}

/** Version of the Cargo workspace (Cargo.toml [workspace.package] version). */
export function workspaceVersion(root: string): string | null {
  let text: string;
  try {
    text = readFileSync(join(root, 'Cargo.toml'), 'utf8');
  } catch {
    return null;
  }
  const section = /\[workspace\.package\]([\s\S]*?)(?:\n\[|$)/.exec(text);
  const m = section ? /^\s*version\s*=\s*"([^"]+)"/m.exec(section[1] ?? '') : null;
  return m?.[1] ?? null;
}

/** Newest modification time (ms) of the engine's sources, or null when there are none. */
function newestSource(root: string): number | null {
  let newest: number | null = null;
  const consider = (p: string): void => {
    try {
      const t = statSync(p).mtimeMs;
      if (newest === null || t > newest) newest = t;
    } catch {
      // ignore
    }
  };
  const walk = (d: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const e of entries) {
      if (e === 'target' || e.startsWith('.')) continue;
      const p = join(d, e);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(p);
      else if (e.endsWith('.rs') || e === 'Cargo.toml') consider(p);
    }
  };
  if (!existsSync(join(root, 'crates'))) return null;
  walk(join(root, 'crates'));
  consider(join(root, 'Cargo.lock'));
  return newest;
}

export async function runDoctor(env: PipelineEnv, probes: DoctorProbes): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  const add = (c: DoctorCheck): DoctorCheck => {
    checks.push(c);
    return c;
  };
  const { root, leanDir, home } = env.paths;
  const tc = await env.toolchain();

  // Node.js
  const major = Number(probes.nodeVersion.split('.')[0]);
  add(
    major >= MIN_NODE_MAJOR
      ? { id: 'node', title: 'Node.js', status: 'pass', detail: `${probes.nodeVersion} (needs ${MIN_NODE_MAJOR} or later)` }
      : { id: 'node', title: 'Node.js', status: 'fail', detail: `${probes.nodeVersion} is older than ${MIN_NODE_MAJOR}`, fix: `install Node.js ${MIN_NODE_MAJOR} or later (https://nodejs.org)` },
  );

  // elan and the pinned Lean toolchain
  const pinned = readLeanPins(leanDir).leanToolchain;
  const elanFix = 'curl -sSfL https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh | sh -s -- -y --default-toolchain none';
  add(
    probes.elan
      ? { id: 'elan', title: 'elan', status: 'pass', detail: probes.elan }
      : { id: 'elan', title: 'elan', status: 'fail', detail: 'the Lean toolchain manager elan was not found on PATH or in ~/.elan/bin', fix: elanFix },
  );
  let toolchainOk = false;
  if (pinned === 'unknown') {
    add({ id: 'lean-toolchain', title: 'Lean toolchain', status: 'fail', detail: `${join(leanDir, 'lean-toolchain')} is missing`, fix: 'run doctor from a complete Cryptificate checkout (or set CRYPTIFICATE_ROOT)' });
  } else if (!probes.elan) {
    add({ id: 'lean-toolchain', title: 'Lean toolchain', status: 'skip', detail: `cannot list toolchains without elan; the pin is ${pinned}` });
  } else {
    const r = await probes.run(probes.elan, ['toolchain', 'list'], { timeoutMs: 30000 });
    const installed = r.stdout.split('\n').map((l) => l.trim().split(/\s+/)[0] ?? '').filter(Boolean);
    toolchainOk = r.code === 0 && installed.includes(pinned);
    add(
      toolchainOk
        ? { id: 'lean-toolchain', title: 'Lean toolchain', status: 'pass', detail: `${pinned} is installed (pinned in lean/lean-toolchain)` }
        : {
            id: 'lean-toolchain',
            title: 'Lean toolchain',
            status: 'fail',
            detail: r.code === 0 ? `${pinned} (pinned in lean/lean-toolchain) is not installed` : `elan toolchain list failed: ${firstLine(r.stderr) || `exit ${r.code}`}`,
            fix: `elan toolchain install ${pinned}`,
          },
    );
  }
  add(
    env.lake
      ? { id: 'lake', title: 'lake', status: 'pass', detail: env.lake }
      : { id: 'lake', title: 'lake', status: 'fail', detail: 'lake was not found (CRYPTIFICATE_LAKE, PATH or ~/.elan/bin)', fix: probes.elan ? `elan toolchain install ${pinned}` : elanFix },
  );

  // Mathlib and the certificate library
  const mathlibOlean = join(leanDir, '.lake', 'packages', 'mathlib', '.lake', 'build', 'lib', 'lean', 'Mathlib.olean');
  const mathlibOk = existsSync(mathlibOlean);
  add(
    mathlibOk
      ? { id: 'mathlib', title: 'Mathlib build', status: 'pass', detail: `Mathlib.olean present (${tc.pins.mathlib})` }
      : { id: 'mathlib', title: 'Mathlib build', status: 'fail', detail: `no Mathlib.olean under ${join(leanDir, '.lake', 'packages', 'mathlib')}`, fix: `cd ${shellQuote(leanDir)} && lake exe cache get` },
  );
  const leanBuildFix = `cd ${shellQuote(leanDir)} && lake build Cryptificate`;
  if (!env.lake || !toolchainOk || !mathlibOk) {
    const missing = [!env.lake ? 'lake' : null, !toolchainOk ? 'the pinned toolchain' : null, !mathlibOk ? 'the Mathlib build' : null].filter(Boolean).join(', ');
    add({ id: 'lean-build', title: 'Certificate library', status: 'skip', detail: `not checked: needs ${missing} first` });
  } else {
    const r = await probes.run(env.lake, ['build', '--no-build', 'Cryptificate'], { cwd: leanDir, timeoutMs: LAKE_CHECK_MS, maxOutputBytes: 256 * 1024 });
    if (r.code === 0) add({ id: 'lean-build', title: 'Certificate library', status: 'pass', detail: 'lake build Cryptificate is up to date (Mathlib, WideTrail and the trusted core)' });
    else
      add({
        id: 'lean-build',
        title: 'Certificate library',
        status: 'fail',
        detail: r.timedOut
          ? `lake build --no-build did not answer within ${LAKE_CHECK_MS / 1000} s`
          : r.code === 3
            ? 'lake build Cryptificate is not up to date: a module needs to be built'
            : `lake build --no-build failed (exit ${r.code ?? r.signal}): ${firstLine(r.stderr) || firstLine(r.stdout)}`,
        fix: leanBuildFix,
      });
  }

  // Engine
  const engineFix = `cd ${shellQuote(root)} && cargo build --release --locked --bin cryptificate-engine`;
  const expected = workspaceVersion(root);
  if (!env.engine.path) {
    add({ id: 'engine', title: 'Engine', status: 'fail', detail: 'cryptificate-engine was not found (CRYPTIFICATE_ENGINE, target/release, target/debug or PATH)', fix: engineFix });
  } else {
    const version = await env.engine.version();
    const subs = await env.engine.subcommands();
    const needed = ['validate', 'diagnose', 'emit-lean'];
    const lacking = needed.filter((s) => !subs.includes(s));
    const want = expected ? `cryptificate-engine ${expected}` : null;
    if (!version) add({ id: 'engine', title: 'Engine', status: 'fail', detail: `${env.engine.path} --version gave no version`, fix: engineFix });
    else if (want && version !== want) add({ id: 'engine', title: 'Engine', status: 'fail', detail: `${env.engine.path} is ${version}; this checkout is ${want}`, fix: engineFix });
    else if (lacking.length > 0) add({ id: 'engine', title: 'Engine', status: 'fail', detail: `${env.engine.path} lacks the subcommands ${lacking.join(', ')}`, fix: engineFix });
    else {
      const newest = newestSource(root);
      let built: number | null = null;
      try {
        built = statSync(env.engine.path).mtimeMs;
      } catch {
        built = null;
      }
      const native = subs.includes('native') ? '' : '; built without the native backend, so native correctness is unavailable';
      if (newest !== null && built !== null && built < newest) {
        add({ id: 'engine', title: 'Engine', status: 'warn', detail: `${version} at ${env.engine.path} is older than the engine sources in crates/${native}`, fix: engineFix });
      } else if (!want) {
        add({ id: 'engine', title: 'Engine', status: 'warn', detail: `${version} at ${env.engine.path}; the expected version could not be read from Cargo.toml${native}` });
      } else {
        add({ id: 'engine', title: 'Engine', status: native ? 'warn' : 'pass', detail: `${version} at ${env.engine.path}${native}`, ...(native ? { fix: engineFix } : {}) });
      }
    }
  }

  // Rust compiler (native correctness and experiments build generated Rust)
  add(
    tc.pins.rustc === 'unavailable'
      ? { id: 'rustc', title: 'Rust compiler', status: 'warn', detail: 'rustc was not found: native correctness and experiments cannot run', fix: 'curl --proto =https --tlsv1.2 -sSf https://sh.rustup.rs | sh' }
      : { id: 'rustc', title: 'Rust compiler', status: 'pass', detail: tc.pins.rustc },
  );

  // State directory
  if (existsSync(home)) {
    const probe = join(home, `.doctor-${randomBytes(6).toString('hex')}`);
    try {
      if (!statSync(home).isDirectory()) throw new Error('not a directory');
      writeFileSync(probe, 'probe\n');
      rmSync(probe, { force: true });
      add({ id: 'state-dir', title: 'State directory', status: 'pass', detail: `${home} is writable` });
    } catch (e) {
      add({ id: 'state-dir', title: 'State directory', status: 'fail', detail: `${home} is not writable: ${(e as NodeJS.ErrnoException).code ?? (e as Error).message}`, fix: 'set CRYPTIFICATE_HOME to a writable directory, or fix the permissions of this one' });
    }
  } else {
    const parent = existingAncestor(home);
    try {
      accessSync(parent, constants.W_OK);
      add({ id: 'state-dir', title: 'State directory', status: 'pass', detail: `${home} will be created (${parent} is writable)` });
    } catch {
      add({ id: 'state-dir', title: 'State directory', status: 'fail', detail: `${home} does not exist and ${parent} is not writable`, fix: 'set CRYPTIFICATE_HOME to a writable directory' });
    }
  }

  // Disk space
  try {
    const free = probes.freeBytes(existingAncestor(home));
    add(
      free < DISK_FAIL_BYTES
        ? { id: 'disk', title: 'Disk space', status: 'fail', detail: `${gib(free)} free for ${home}; a check needs at least 0.5 GiB`, fix: 'free disk space, or set CRYPTIFICATE_HOME to a larger file system' }
        : free < DISK_WARN_BYTES
          ? { id: 'disk', title: 'Disk space', status: 'warn', detail: `${gib(free)} free for ${home}; native builds and experiments may need 2 GiB`, fix: 'free disk space, or set CRYPTIFICATE_HOME to a larger file system' }
          : { id: 'disk', title: 'Disk space', status: 'pass', detail: `${gib(free)} free for ${home}` },
    );
  } catch (e) {
    add({ id: 'disk', title: 'Disk space', status: 'skip', detail: `cannot read the free space: ${(e as Error).message}` });
  }

  // Local service (only the workbench and the Python client need it)
  const url = probes.serviceUrl.replace(/\/+$/, '');
  try {
    const r = await probes.getJson(`${url}/api/capabilities`, SERVICE_MS);
    const body = (r.body && typeof r.body === 'object' ? r.body : {}) as Record<string, unknown>;
    if (r.status === 200 && body['name'] === 'cryptificate') {
      const checker = typeof body['checker'] === 'string' ? body['checker'] : 'unknown';
      add(
        checker === tc.checker
          ? { id: 'service', title: 'Local service', status: 'pass', detail: `${url} answers (${checker})` }
          : { id: 'service', title: 'Local service', status: 'warn', detail: `${url} answers with ${checker}, not this checkout's ${tc.checker}`, fix: 'stop that service and run cryptificate serve from this checkout' },
      );
    } else {
      add({ id: 'service', title: 'Local service', status: 'warn', detail: `${url}/api/capabilities answered ${r.status}, not as a Cryptificate service`, fix: 'cryptificate serve (or pass --url)' });
    }
  } catch (e) {
    add({
      id: 'service',
      title: 'Local service',
      status: 'warn',
      detail: `${url} is not reachable (${reason(e)}); check, verify and report do not need it, the workbench and the Python client do`,
      fix: `cryptificate serve, or cd ${shellQuote(root)} && npm start`,
    });
  }

  return { format: 'cryptificate-doctor/v1', checker: tc.checker, ok: !checks.some((c) => c.status === 'fail'), checks };
}
