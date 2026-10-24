/**
 * Locations of the repository, runtime state and external tools.
 */
import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Paths {
  /** Repository root (contains lean/ and the workspace package.json). */
  root: string;
  /** Runtime state: CRYPTIFICATE_HOME or <root>/.cryptificate. */
  home: string;
  jobsDir: string;
  cacheDir: string;
  leanDir: string;
  templatesDir: string;
  webDist: string;
}

function isRepoRoot(dir: string): boolean {
  return existsSync(join(dir, 'lean', 'lean-toolchain')) && existsSync(join(dir, 'package.json'));
}

export function findRepoRoot(start?: string): string {
  const fromEnv = process.env['CRYPTIFICATE_ROOT'];
  if (fromEnv && isRepoRoot(resolve(fromEnv))) return resolve(fromEnv);
  const starts = [start, dirname(fileURLToPath(import.meta.url)), process.cwd()].filter(
    (s): s is string => typeof s === 'string',
  );
  for (const s of starts) {
    let dir = resolve(s);
    for (;;) {
      if (isRepoRoot(dir)) return dir;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return process.cwd();
}

export function resolvePaths(root = findRepoRoot()): Paths {
  const home = process.env['CRYPTIFICATE_HOME'] ? resolve(process.env['CRYPTIFICATE_HOME']) : join(root, '.cryptificate');
  return {
    root,
    home,
    jobsDir: join(home, 'jobs'),
    cacheDir: join(home, 'cache'),
    leanDir: join(root, 'lean'),
    templatesDir: join(root, 'lean', 'templates'),
    webDist: join(root, 'apps', 'web', 'dist'),
  };
}

function isExecutableFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** Look a command up on PATH. */
export function which(name: string): string | null {
  for (const dir of (process.env['PATH'] ?? '').split(delimiter)) {
    if (!dir) continue;
    const p = join(dir, name);
    if (isExecutableFile(p)) return p;
  }
  return null;
}

/** The engine binary: CRYPTIFICATE_ENGINE, a cargo build in the repo, or PATH. */
export function findEngine(root: string): string | null {
  const env = process.env['CRYPTIFICATE_ENGINE'];
  if (env) return isExecutableFile(env) ? resolve(env) : null;
  for (const profile of ['release', 'debug']) {
    const p = join(root, 'target', profile, 'cryptificate-engine');
    if (isExecutableFile(p)) return p;
  }
  return which('cryptificate-engine');
}

/** The `lake` launcher: CRYPTIFICATE_LAKE, PATH, or the default elan location. */
export function findLake(): string | null {
  const env = process.env['CRYPTIFICATE_LAKE'];
  if (env) return isExecutableFile(env) ? resolve(env) : null;
  const onPath = which('lake');
  if (onPath) return onPath;
  const elan = join(homedir(), '.elan', 'bin', 'lake');
  return isExecutableFile(elan) ? elan : null;
}

export function findRustc(): string | null {
  const env = process.env['RUSTC'];
  if (env && isExecutableFile(env)) return env;
  const onPath = which('rustc');
  if (onPath) return onPath;
  const cargoHome = process.env['CARGO_HOME'] ?? join(homedir(), '.cargo');
  const p = join(cargoHome, 'bin', 'rustc');
  return isExecutableFile(p) ? p : null;
}

/** Path replacements used when sanitizing logs and bundle contents. */
export function pathReplacements(paths: Paths): Array<[string, string]> {
  return [
    [paths.jobsDir, '<jobs>'],
    [paths.home, '<state>'],
    [paths.root, '<repo>'],
  ];
}
