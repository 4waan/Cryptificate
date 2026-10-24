/**
 * Toolchain pins and checker identity, recorded in every report and bundle.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { ToolchainPins } from '@cryptificate/schema';
import { findRustc, type Paths } from './paths.js';
import { run } from './proc.js';

export interface ManifestPin {
  name: string;
  url: string;
  rev: string;
  inputRev: string | null;
}

export interface ToolchainInfo {
  pins: ToolchainPins;
  leanToolchain: string;
  lakeManifest: ManifestPin[];
  cargoLockSha256: string | null;
  version: string;
  /** `git describe` of the checkout, when available. */
  revision: string | null;
  /** "cryptificate <version>" plus the revision. */
  checker: string;
}

export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function readText(p: string): string | null {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

export function serverVersion(root: string): string {
  const pkg = readText(join(root, 'apps', 'server', 'package.json'));
  if (pkg) {
    try {
      const v = (JSON.parse(pkg) as { version?: unknown }).version;
      if (typeof v === 'string') return v;
    } catch {
      // fall through
    }
  }
  return '0.0.0';
}

export function readLeanPins(leanDir: string): { leanToolchain: string; manifest: ManifestPin[] } {
  const leanToolchain = (readText(join(leanDir, 'lean-toolchain')) ?? 'unknown').trim();
  const manifest: ManifestPin[] = [];
  const raw = readText(join(leanDir, 'lake-manifest.json'));
  if (raw) {
    try {
      const doc = JSON.parse(raw) as { packages?: Array<Record<string, unknown>> };
      for (const p of doc.packages ?? []) {
        manifest.push({
          name: String(p['name'] ?? ''),
          url: String(p['url'] ?? ''),
          rev: String(p['rev'] ?? ''),
          inputRev: typeof p['inputRev'] === 'string' ? p['inputRev'] : null,
        });
      }
    } catch {
      // leave empty
    }
  }
  manifest.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { leanToolchain, manifest };
}

/** `rustc -V` without the build date: "rustc 1.97.0 (2d8144b78 YYYY-MM-DD)" -> "rustc 1.97.0 (2d8144b78)". */
export function stripBuildDate(version: string): string {
  return version.replace(/\s+\d{4}-\d{2}-\d{2}(?=\))/, '');
}

let rustcCache: Promise<string> | null = null;
export function rustcVersion(): Promise<string> {
  if (!rustcCache) {
    const rustc = findRustc();
    rustcCache = rustc
      ? run(rustc, ['-V'], { timeoutMs: 15000 }).then((r) => (r.code === 0 ? stripBuildDate(r.stdout.trim()) : 'unavailable'))
      : Promise.resolve('unavailable');
  }
  return rustcCache;
}

let revisionCache: Promise<string | null> | null = null;
export function gitRevision(root: string): Promise<string | null> {
  if (process.env['CRYPTIFICATE_REVISION']) return Promise.resolve(process.env['CRYPTIFICATE_REVISION']);
  if (!revisionCache) {
    revisionCache = existsSync(join(root, '.git'))
      ? run('git', ['describe', '--always', '--dirty', '--tags'], { cwd: root, timeoutMs: 10000 }).then((r) =>
          r.code === 0 && r.stdout.trim() ? r.stdout.trim() : null,
        )
      : Promise.resolve(null);
  }
  return revisionCache;
}

export async function readToolchain(paths: Paths): Promise<ToolchainInfo> {
  const { leanToolchain, manifest } = readLeanPins(paths.leanDir);
  const lean = leanToolchain.includes(':') ? leanToolchain.slice(leanToolchain.indexOf(':') + 1) : leanToolchain;
  const widetrail = manifest.find((p) => p.name === 'WideTrail');
  const mathlib = manifest.find((p) => p.name === 'mathlib');
  const lock = (() => {
    try {
      return readFileSync(join(paths.root, 'Cargo.lock'));
    } catch {
      return null;
    }
  })();
  const version = serverVersion(paths.root);
  const [rustc, revision] = await Promise.all([rustcVersion(), gitRevision(paths.root)]);
  return {
    pins: {
      lean,
      mathlib: mathlib ? mathlib.inputRev ?? mathlib.rev : 'unknown',
      widetrail: widetrail ? widetrail.rev : 'unknown',
      rustc,
    },
    leanToolchain,
    lakeManifest: manifest,
    cargoLockSha256: lock ? sha256Hex(lock) : null,
    version,
    revision,
    checker: revision ? `cryptificate ${version} (${revision})` : `cryptificate ${version}`,
  };
}

/** Lists files below `dir` (relative paths, sorted) with the given extensions. */
export function listFiles(dir: string, exts: readonly string[]): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const e of entries) {
      if (e === '.lake' || e.startsWith('.')) continue;
      const p = join(d, e);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(p);
      else if (exts.some((x) => e.endsWith(x))) out.push(relative(dir, p));
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * Digest of the certificate templates and the trusted Lean library sources.
 * Any change to them invalidates cached proofs.
 */
export function templatesDigest(paths: Paths): string {
  const h = createHash('sha256');
  for (const [base, exts] of [
    [paths.templatesDir, ['.lean', '.json']],
    [join(paths.leanDir, 'Cryptificate'), ['.lean']],
  ] as const) {
    for (const rel of listFiles(base, exts)) {
      h.update(`${relative(paths.root, join(base, rel))}\0`);
      h.update(readFileSync(join(base, rel)));
      h.update('\0');
    }
  }
  for (const f of ['Cryptificate.lean', 'lakefile.toml', 'lake-manifest.json', 'lean-toolchain']) {
    const t = readText(join(paths.leanDir, f));
    if (t !== null) h.update(`lean/${f}\0${t}\0`);
  }
  return h.digest('hex');
}
