/**
 * Expansion of the input patterns of `check`, `verify` and `report`.
 *
 * Patterns are expanded here rather than by the shell, so that quoted
 * patterns (as CI configuration passes them) behave the same everywhere.
 * Supported: `*` and `?` within one path segment, `[abc]` character classes,
 * and `**` as a whole segment for any number of directories. Entries whose
 * name starts with a dot are only matched by a segment that starts with a
 * dot. A pattern without any of these characters is a plain path and is
 * returned unchanged, whether or not it exists.
 */
import { readdirSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

export function hasGlob(pattern: string): boolean {
  return /[*?[]/.test(pattern);
}

function segmentRegex(seg: string): RegExp {
  let re = '';
  for (let k = 0; k < seg.length; k++) {
    const c = seg[k]!;
    if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '[') {
      const end = seg.indexOf(']', k + 1);
      if (end < 0) re += '\\[';
      else {
        let body = seg.slice(k + 1, end).replace(/\\/g, '\\\\');
        if (body.startsWith('!')) body = `^${body.slice(1)}`;
        re += `[${body}]`;
        k = end;
      }
    } else re += c.replace(/[.+^${}()|\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

function listDir(dir: string): { name: string; dir: boolean }[] {
  try {
    return readdirSync(dir, { withFileTypes: true }).map((d) => {
      let isDir = d.isDirectory();
      if (d.isSymbolicLink()) {
        try {
          isDir = statSync(join(dir, d.name)).isDirectory();
        } catch {
          isDir = false;
        }
      }
      return { name: d.name, dir: isDir };
    });
  } catch {
    return [];
  }
}

function walk(base: string, segs: string[], out: Set<string>): void {
  if (segs.length === 0) {
    out.add(base);
    return;
  }
  const [seg, ...rest] = segs as [string, ...string[]];
  if (seg === '**') {
    walk(base, rest, out);
    for (const e of listDir(base)) {
      if (e.dir && !e.name.startsWith('.')) walk(join(base, e.name), segs, out);
    }
    return;
  }
  if (!hasGlob(seg)) {
    const next = join(base, seg);
    if (rest.length === 0) {
      try {
        statSync(next);
        out.add(next);
      } catch {
        /* no match */
      }
    } else walk(next, rest, out);
    return;
  }
  const re = segmentRegex(seg);
  for (const e of listDir(base)) {
    if (e.name.startsWith('.') && !seg.startsWith('.')) continue;
    if (!re.test(e.name)) continue;
    if (rest.length === 0) out.add(join(base, e.name));
    else if (e.dir) walk(join(base, e.name), rest, out);
  }
}

/** Files matched by `pattern`, relative to `cwd` when the pattern is relative, sorted. */
export function expandGlob(pattern: string, cwd: string): string[] {
  if (!hasGlob(pattern)) return [pattern];
  const abs = isAbsolute(pattern);
  const parts = pattern.split(/[\\/]+/);
  const root = abs ? (parts.shift() ?? '') + sep : cwd;
  const out = new Set<string>();
  walk(root || sep, parts.filter((p) => p !== '' && p !== '.'), out);
  const files = [...out].filter((p) => {
    try {
      return statSync(p).isFile();
    } catch {
      return false;
    }
  });
  return files.map((p) => (abs ? p : relative(cwd, p))).sort();
}

export class NoMatchError extends Error {}

/**
 * Expand every pattern, keeping the order of the patterns and dropping
 * duplicates. A pattern that matches no file is an error.
 */
export function expandInputs(patterns: readonly string[], cwd: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of patterns) {
    const files = expandGlob(p, cwd);
    if (files.length === 0) throw new NoMatchError(`no file matches ${p}`);
    for (const f of files) {
      if (seen.has(f)) continue;
      seen.add(f);
      out.push(f);
    }
  }
  return out;
}
