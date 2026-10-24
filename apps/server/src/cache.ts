/**
 * Proof cache. A completed analysis is stored under a key derived from the
 * normalized inputs, the toolchain pins, the checker version, and digests
 * of the certificate templates and the generated Lean source. A hit is
 * reported with origin "cached".
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson } from '@cryptificate/schema';
import type { AnalysisReport, ToolchainPins } from '@cryptificate/schema';
import { sha256Hex } from './toolchain.js';

export interface CacheKeyParts {
  inputDigest: string;
  pins: ToolchainPins;
  checker: string;
  templatesSha256: string;
  leanSourceSha256: string;
}

export function cacheKey(parts: CacheKeyParts): string {
  return sha256Hex(canonicalJson({ v: 1, ...parts }));
}

export interface CacheEntry {
  report: AnalysisReport;
  leanSource: string;
  audit: string;
}

export class ProofCache {
  constructor(private readonly dir: string) {}

  private entryDir(key: string): string {
    return join(this.dir, key);
  }

  get(key: string): CacheEntry | null {
    if (!/^[0-9a-f]{64}$/.test(key)) return null;
    const d = this.entryDir(key);
    try {
      const report = JSON.parse(readFileSync(join(d, 'report.json'), 'utf8')) as AnalysisReport;
      const leanSource = readFileSync(join(d, 'Cert.lean'), 'utf8');
      const audit = readFileSync(join(d, 'audit.txt'), 'utf8');
      if (report.kind !== 'analysis' || report.provenance?.cacheKey !== key) return null;
      return { report, leanSource, audit };
    } catch {
      return null;
    }
  }

  put(key: string, entry: CacheEntry): void {
    const d = this.entryDir(key);
    if (existsSync(join(d, 'report.json'))) return;
    const tmp = `${d}.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`;
    mkdirSync(tmp, { recursive: true });
    writeFileSync(join(tmp, 'Cert.lean'), entry.leanSource);
    writeFileSync(join(tmp, 'audit.txt'), entry.audit);
    writeFileSync(join(tmp, 'report.json'), `${JSON.stringify(entry.report, null, 2)}\n`);
    try {
      mkdirSync(this.dir, { recursive: true });
      renameSync(tmp, d);
    } catch {
      // another job stored the same entry first
      rmSync(tmp, { recursive: true, force: true });
    }
  }
}
