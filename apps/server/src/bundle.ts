/**
 * Evidence bundles: a deterministic .tar.gz of everything needed to inspect
 * and replay a job. Entries are sorted, every mtime is zero and no file
 * carries a timestamp.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Report } from '@cryptificate/schema';
import type { Paths } from './paths.js';
import { listFiles } from './toolchain.js';
import type { ToolchainInfo } from './toolchain.js';
import { createTarGz } from './tar.js';
import type { TarEntry } from './tar.js';

export interface BundleSource {
  jobDir: string;
  report: Report;
  /** Normalized inputs (falls back to report.inputs). */
  inputs?: unknown;
  toolchain: ToolchainInfo;
  paths: Paths;
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function readIf(p: string): Buffer | null {
  try {
    return readFileSync(p);
  } catch {
    return null;
  }
}

export function toolchainDocument(tc: ToolchainInfo): unknown {
  return {
    leanToolchain: tc.leanToolchain,
    lakeManifest: tc.lakeManifest.map((p) => ({ name: p.name, url: p.url, rev: p.rev, inputRev: p.inputRev })),
    cargoLockSha256: tc.cargoLockSha256,
    rustc: tc.pins.rustc,
    checker: tc.checker,
  };
}

export function verifyMarkdown(report: Report, tc: ToolchainInfo): string {
  const kind = report.kind === 'analysis' ? 'analysis' : 'experiment';
  const lines = [
    '# Replaying this bundle',
    '',
    `This bundle records a Cryptificate ${kind} (run \`${report.id}\`, inputs \`${report.inputDigest}\`).`,
    '',
    '## Contents',
    '',
    '- `inputs.json`: the normalized request.',
    '- `report.json`: claims, witnesses, execution steps and provenance as reported.',
    '- `lean/`: the generated Lean certificate(s) and the checker output (`audit.txt`).',
    '- `toolchain.json`: Lean toolchain, Lake manifest pins, Cargo.lock digest and `rustc -V`.',
  ];
  if (report.kind === 'experiment') {
    lines.push(
      '- `native/`: generated Rust sources, native correctness results and raw measurements.',
      '- `search/`: search history and seeds.',
    );
  }
  lines.push(
    '',
    '## Verify',
    '',
    'From a Cryptificate checkout prepared with `scripts/setup.sh`:',
    '',
    '```sh',
    'npx cryptificate verify <this-bundle>.tar.gz',
    '```',
    '',
    '`verify` reads only `inputs.json` and `report.json`. It regenerates the Lean certificate with the installed',
    'engine and templates, runs the installed Lean checker, recomputes the claims and prints a table comparing them',
    'with the claims recorded here. It never runs Lean, Rust or shell code from the bundle. Timings in `report.json`',
    'are historical measurements from the machine that produced the bundle and are reported as such.',
    '',
    '## Toolchain',
    '',
    `- Lean: \`${tc.leanToolchain}\``,
    `- WideTrail: \`${tc.pins.widetrail}\``,
    `- Mathlib: \`${tc.pins.mathlib}\``,
    `- rustc: \`${tc.pins.rustc}\``,
    '',
    'Replaying needs the pinned Lean toolchain and the Lake packages listed in `toolchain.json`. On a machine',
    'without them, `scripts/setup.sh` downloads the toolchain (elan), the Lake dependencies and the Mathlib build',
    'cache, which requires network access; it also builds the engine with cargo, which downloads crates unless they',
    'are already vendored or cached. After setup, verification runs offline.',
    '',
  );
  return lines.join('\n');
}

/**
 * Sanitize text written into a bundle: no local paths, and no build dates in
 * tool version strings ("rustc 1.97.0 (2d8144b78 YYYY-MM-DD)" keeps its commit).
 */
function scrub(text: string, paths: Paths): string {
  let s = text.replace(/(\([0-9a-f]{7,40}) \d{4}-\d{2}-\d{2}\)/g, '$1)');
  for (const [from, to] of [
    [paths.jobsDir, '<jobs>'],
    [paths.home, '<state>'],
    [paths.root, '<repo>'],
  ] as const) {
    s = s.split(from).join(to);
  }
  return s;
}

export function bundleEntries(src: BundleSource): TarEntry[] {
  const { jobDir, report, toolchain, paths } = src;
  const entries: TarEntry[] = [];
  const inputs = src.inputs ?? (report.kind === 'analysis' ? report.inputs : report.inputs ?? null);
  entries.push({ path: 'inputs.json', data: scrub(json(inputs), paths) });
  entries.push({ path: 'report.json', data: scrub(json(report), paths) });
  // Pins recorded when the job ran; the current checkout only as a fallback.
  const recorded = readIf(join(jobDir, 'toolchain.json'));
  entries.push({ path: 'toolchain.json', data: recorded ?? json(toolchainDocument(toolchain)) });
  entries.push({ path: 'VERIFY.md', data: verifyMarkdown(report, toolchain) });

  const leanDir = join(jobDir, 'lean');
  if (existsSync(leanDir)) {
    for (const rel of listFiles(leanDir, ['.lean', '.txt'])) {
      const data = readIf(join(leanDir, rel));
      if (data) entries.push({ path: `lean/${rel}`, data: rel.endsWith('.txt') ? scrub(data.toString('utf8'), paths) : data });
    }
  }
  const nativeDir = join(jobDir, 'native');
  if (existsSync(nativeDir)) {
    for (const rel of listFiles(nativeDir, ['.rs', '.json', '.toml', '.txt', '.csv'])) {
      const data = readIf(join(nativeDir, rel));
      if (data) entries.push({ path: `native/${rel}`, data: scrub(data.toString('utf8'), paths) });
    }
  }
  const searchDir = join(jobDir, 'search');
  if (existsSync(searchDir)) {
    for (const rel of listFiles(searchDir, ['.json'])) {
      const data = readIf(join(searchDir, rel));
      if (data) entries.push({ path: `search/${rel}`, data: scrub(data.toString('utf8'), paths) });
    }
  }
  const diag = readIf(join(jobDir, 'engine', 'diagnose.json'));
  if (diag) entries.push({ path: 'engine/diagnose.json', data: scrub(diag.toString('utf8'), paths) });
  return entries;
}

export function buildBundle(src: BundleSource): Buffer {
  return createTarGz(bundleEntries(src));
}
