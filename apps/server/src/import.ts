/**
 * `cryptificate import`: round constants from the files implementations ship
 * them in, turned into the `constants` of a HADES design.
 *
 * Every format ends up as rows of `width` integers, one row per round, in the
 * Poseidon2 layout that claim `constants.grain` compares with: `R_F / 2` full
 * rows, `R_P` rows `[c, 0, …, 0]` and `R_F / 2` full rows.
 *
 * * `plonky3`: Rust source with Plonky3's split arrays `<NAME>_EXTERNAL_INITIAL`
 *   (`R_F / 2` rows), `<NAME>_INTERNAL` (one constant per partial round) and
 *   `<NAME>_EXTERNAL_FINAL` (`R_F / 2` rows), e.g.
 *   `KOALABEAR_POSEIDON2_RC_16_*` or `BABYBEAR_RC16_*`.
 * * `horizen`: an instance file written by `poseidon2_rust_params.sage` of
 *   HorizenLabs/poseidon2 (`pub static ref RC<t>: Vec<Vec<Scalar>> =
 *   vec![vec![from_hex("0x…"), …], …]`), or the flat list its
 *   `print_round_constants` prints (`['0x…', '0x…', …]`, already padded with
 *   the zeros of the partial rounds).
 * * `json`: rows (`[["1", "2"], …]`), a flat list, `{"kind": "explicit",
 *   "values": rows}`, a design whose `constants` are explicit, or the split
 *   form `{"externalInitial", "internal", "externalFinal"}`. Numbers may be
 *   JSON integers (exact only below 2^53) or decimal or `0x` hex strings.
 * * `csv`: one round per line, values separated by commas, semicolons or
 *   white space; `#` starts a comment and a first line without numbers is
 *   taken as a header.
 *
 * The importer only reads numbers: it does not check that they are the Grain
 * constants (`cryptificate check` does, claim `constants.grain`), and it does
 * not reduce them modulo the field's prime (a value `>= p` is an error).
 */
import { BN254_MODULUS, PRIME_FIELD_PRESETS } from '@cryptificate/schema';

export type ImportFormat = 'plonky3' | 'horizen' | 'json' | 'csv';

export const IMPORT_FORMATS: readonly ImportFormat[] = ['plonky3', 'horizen', 'json', 'csv'];

/** Round constants read from a file, in the Poseidon2 layout. */
export interface ImportedConstants {
  /** One row of `width` numbers per round. */
  rows: bigint[][];
  width: number;
  fullRounds: number;
  partialRounds: number;
  /** What was read, for messages: the array names or the shape. */
  source: string;
}

export class ImportError extends Error {}

// ---------------------------------------------------------------------------
// Numbers and nested lists in source text

type Nested = bigint | Nested[];

/**
 * The bracketed list that starts at `text[open]` (a `[`), as nested lists of
 * the integer literals inside it. Integer literals are `0x` hex or decimal,
 * with `_` separators and an optional type suffix (`0x1fu32`), bare or inside
 * a string (`from_hex("0x…")`, `'0x…'`). Identifiers are skipped whole, so the
 * digits of `u32` or `from_canonical_u64` are not read as numbers; anything
 * in parentheses is read as part of the enclosing list (`BabyBear::new(5)`).
 */
function parseList(text: string, open: number): { value: Nested[]; end: number } {
  const stack: Nested[][] = [];
  let i = open;
  while (i < text.length) {
    const c = text[i]!;
    if (c === '[') {
      stack.push([]);
      i++;
    } else if (c === ']') {
      const done = stack.pop()!;
      if (stack.length === 0) return { value: done, end: i + 1 };
      stack[stack.length - 1]!.push(done);
      i++;
    } else if (c === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i);
      i = nl < 0 ? text.length : nl;
    } else if (c === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2);
      i = close < 0 ? text.length : close + 2;
    } else if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i, i + 200))!;
      i += m[0].length;
    } else if (/[0-9]/.test(c)) {
      const m = /^(0[xX][0-9A-Fa-f_]+|[0-9][0-9_]*)([A-Za-z_][A-Za-z0-9_]*)?/.exec(text.slice(i, i + 400))!;
      if (m[2] !== undefined && !/^[ui](8|16|32|64|128|size)$/.test(m[2])) {
        throw new ImportError(`unexpected literal "${m[0]}" at offset ${i}`);
      }
      stack[stack.length - 1]!.push(BigInt(m[1]!.replace(/_/g, '')));
      i += m[0].length;
    } else if (c === '"' || c === "'") {
      const close = text.indexOf(c, i + 1);
      if (close < 0) throw new ImportError(`unterminated string at offset ${i}`);
      const body = text.slice(i + 1, close).trim();
      if (!/^(0[xX][0-9A-Fa-f]+|[0-9]+)$/.test(body)) throw new ImportError(`string "${body}" at offset ${i} is not a number`);
      stack[stack.length - 1]!.push(BigInt(body));
      i = close + 1;
    } else if (c === '-') {
      throw new ImportError(`negative number at offset ${i}`);
    } else {
      i++;
    }
  }
  throw new ImportError('unterminated list');
}

function isRow(x: Nested): x is bigint[] {
  return Array.isArray(x) && x.every((y) => typeof y === 'bigint');
}

function asRows(x: Nested[], what: string): bigint[][] {
  if (!x.every(isRow)) throw new ImportError(`${what} is not a list of rows of numbers`);
  return x as bigint[][];
}

function asFlat(x: Nested[], what: string): bigint[] {
  if (!x.every((y) => typeof y === 'bigint')) throw new ImportError(`${what} is not a flat list of numbers`);
  return x as bigint[];
}

/** The value of the Rust item `name` (`const`, `static` or `static ref`): its first list after `=`. */
function rustItem(text: string, name: string): Nested[] | null {
  const decl = new RegExp(`\\b(?:const|static(?:\\s+ref)?)\\s+${name}\\s*:`).exec(text);
  if (!decl) return null;
  const eq = text.indexOf('=', decl.index + decl[0].length);
  if (eq < 0) return null;
  const open = text.indexOf('[', eq);
  if (open < 0) throw new ImportError(`${name} has no list`);
  return parseList(text, open).value;
}

// ---------------------------------------------------------------------------
// Layout

/** Rows `[c, 0, …, 0]`, the shape of a Poseidon2 partial round. */
function partialShaped(row: readonly bigint[]): boolean {
  return row.length > 1 && row.slice(1).every((x) => x === 0n);
}

/**
 * The round numbers of rows in the Poseidon2 layout: `R_F / 2` leading full
 * rows (the leading rows that are not of the partial shape), then partial
 * rows, then as many full rows as lead. An error when the rows do not have
 * this shape.
 */
export function inferRounds(rows: readonly bigint[][]): { fullRounds: number; partialRounds: number } {
  let half = 0;
  while (half < rows.length && !partialShaped(rows[half]!)) half++;
  const partialRounds = rows.length - 2 * half;
  if (partialRounds < 0) throw new ImportError(`${rows.length} rows cannot hold ${half} full rounds on each side`);
  const bad = rows.slice(half, half + partialRounds).findIndex((r) => !partialShaped(r));
  if (bad >= 0) {
    throw new ImportError(
      `row ${half + bad} is not of the shape [c, 0, …, 0] of a partial round: the rows are not in the Poseidon2 layout ` +
        `(${half} full rows, then partial rows, then ${half} full rows)`,
    );
  }
  return { fullRounds: 2 * half, partialRounds };
}

function fromRows(rows: bigint[][], source: string): ImportedConstants {
  if (rows.length === 0) throw new ImportError('no round constants found');
  const width = rows[0]!.length;
  const odd = rows.findIndex((r) => r.length !== width);
  if (odd >= 0) throw new ImportError(`row ${odd} has ${rows[odd]!.length} values, row 0 has ${width}`);
  if (width < 2) throw new ImportError('rows of one value: the width must be at least 2');
  return { rows, width, ...inferRounds(rows), source };
}

/** The Poseidon2 layout of Plonky3's split form. */
export function fromSplit(initial: bigint[][], internal: bigint[], final: bigint[][], source: string): ImportedConstants {
  if (initial.length === 0 || initial.length !== final.length) {
    throw new ImportError(`the first and last full rounds differ in number (${initial.length} and ${final.length})`);
  }
  const width = initial[0]!.length;
  for (const [what, rows] of [
    ['initial', initial],
    ['final', final],
  ] as const) {
    const odd = rows.findIndex((r) => r.length !== width);
    if (odd >= 0) throw new ImportError(`${what} row ${odd} has ${rows[odd]!.length} values, not ${width}`);
  }
  const rows = [...initial, ...internal.map((c) => [c, ...new Array<bigint>(width - 1).fill(0n)]), ...final];
  return { rows, width, fullRounds: 2 * initial.length, partialRounds: internal.length, source };
}

// ---------------------------------------------------------------------------
// Formats

const SPLIT_SUFFIXES = ['_EXTERNAL_INITIAL', '_INTERNAL', '_EXTERNAL_FINAL'] as const;

/** Prefixes `P` for which the file declares `P_EXTERNAL_INITIAL`, `P_INTERNAL` and `P_EXTERNAL_FINAL`. */
export function plonky3Names(text: string): string[] {
  const names = new Set<string>();
  for (const m of text.matchAll(/\b(?:const|static)\s+([A-Z0-9_]+)_EXTERNAL_INITIAL\s*:/g)) {
    const p = m[1]!;
    if (SPLIT_SUFFIXES.every((s) => new RegExp(`\\b(?:const|static)\\s+${p}${s}\\s*:`).test(text))) names.add(p);
  }
  return [...names];
}

export function parsePlonky3(text: string, name?: string): ImportedConstants {
  const names = plonky3Names(text);
  let prefix = name;
  if (prefix === undefined) {
    if (names.length !== 1) {
      throw new ImportError(
        names.length === 0
          ? 'no <NAME>_EXTERNAL_INITIAL, <NAME>_INTERNAL and <NAME>_EXTERNAL_FINAL arrays found'
          : `several instances found, choose one with --name: ${names.join(', ')}`,
      );
    }
    prefix = names[0]!;
  } else if (!names.includes(prefix)) {
    throw new ImportError(`no arrays ${prefix}_EXTERNAL_INITIAL, ${prefix}_INTERNAL and ${prefix}_EXTERNAL_FINAL found${names.length ? `; found: ${names.join(', ')}` : ''}`);
  }
  const [initial, internal, final] = SPLIT_SUFFIXES.map((s) => rustItem(text, prefix + s)!);
  return fromSplit(
    asRows(initial!, `${prefix}_EXTERNAL_INITIAL`),
    asFlat(internal!, `${prefix}_INTERNAL`),
    asRows(final!, `${prefix}_EXTERNAL_FINAL`),
    `${prefix}_EXTERNAL_INITIAL, ${prefix}_INTERNAL and ${prefix}_EXTERNAL_FINAL`,
  );
}

export function parseHorizen(text: string, opts: { name?: string; width?: number } = {}): ImportedConstants {
  const statics = [...text.matchAll(/\bstatic\s+ref\s+(RC\d+)\s*:/g)].map((m) => m[1]!);
  if (statics.length > 0 || opts.name !== undefined) {
    let name = opts.name;
    if (name === undefined) {
      if (statics.length !== 1) throw new ImportError(`several round-constant tables found, choose one with --name: ${statics.join(', ')}`);
      name = statics[0]!;
    }
    const value = rustItem(text, name);
    if (!value) throw new ImportError(`no static ${name} found${statics.length ? `; found: ${statics.join(', ')}` : ''}`);
    return fromRows(asRows(value, name), name);
  }
  // The flat list printed by print_round_constants.
  const open = text.indexOf('[');
  if (open < 0) throw new ImportError('neither a static RC<t> table nor a printed list of round constants found');
  const flat = asFlat(parseList(text, open).value, 'the printed list');
  const count = /Number of round constants:\s*(\d+)/.exec(text);
  if (count && Number(count[1]) !== flat.length) throw new ImportError(`the file announces ${count[1]} round constants and lists ${flat.length}`);
  if (opts.width === undefined) throw new ImportError('a flat list of round constants needs the width (from --base)');
  return fromRows(chunk(flat, opts.width), `a flat list of ${flat.length} constants`);
}

function chunk(flat: bigint[], width: number): bigint[][] {
  if (flat.length % width !== 0) throw new ImportError(`${flat.length} constants are not a whole number of rows of ${width}`);
  const rows: bigint[][] = [];
  for (let i = 0; i < flat.length; i += width) rows.push(flat.slice(i, i + width));
  return rows;
}

function jsonNumber(x: unknown, where: string): bigint {
  if (typeof x === 'number') {
    if (!Number.isSafeInteger(x) || x < 0) throw new ImportError(`${where}: ${x} is not an exact non-negative integer; write large values as strings`);
    return BigInt(x);
  }
  if (typeof x === 'string' && /^(0[xX][0-9A-Fa-f]+|[0-9]+)$/.test(x.trim())) return BigInt(x.trim());
  throw new ImportError(`${where}: ${JSON.stringify(x)} is not a number`);
}

function jsonRows(x: unknown, where: string): bigint[][] {
  if (!Array.isArray(x) || !x.every(Array.isArray)) throw new ImportError(`${where} is not a list of rows`);
  return x.map((r: unknown[], i) => r.map((v, j) => jsonNumber(v, `${where}[${i}][${j}]`)));
}

function jsonFlat(x: unknown, where: string): bigint[] {
  if (!Array.isArray(x)) throw new ImportError(`${where} is not a list`);
  return x.map((v, i) => jsonNumber(v, `${where}[${i}]`));
}

export function parseJson(text: string, opts: { width?: number } = {}): ImportedConstants {
  let doc: unknown;
  try {
    doc = JSON.parse(text) as unknown;
  } catch {
    throw new ImportError('not valid JSON');
  }
  if (doc && typeof doc === 'object' && !Array.isArray(doc)) {
    const o = doc as Record<string, unknown>;
    if ('externalInitial' in o || 'externalFinal' in o) {
      return fromSplit(jsonRows(o['externalInitial'], 'externalInitial'), jsonFlat(o['internal'], 'internal'), jsonRows(o['externalFinal'], 'externalFinal'), 'the split form');
    }
    const c = (o['design'] as Record<string, unknown> | undefined)?.['constants'] ?? o['constants'] ?? o;
    const k = c && typeof c === 'object' ? (c as Record<string, unknown>) : {};
    if (k['kind'] !== 'explicit') throw new ImportError('expected rows, a flat list, explicit constants or the split form');
    return fromRows(jsonRows(k['values'], 'values'), 'explicit constants');
  }
  if (Array.isArray(doc) && doc.length > 0 && doc.every(Array.isArray)) return fromRows(jsonRows(doc, 'rows'), 'rows');
  const flat = jsonFlat(doc, 'list');
  if (opts.width === undefined) throw new ImportError('a flat list of round constants needs the width (from --base)');
  return fromRows(chunk(flat, opts.width), `a flat list of ${flat.length} constants`);
}

export function parseCsv(text: string): ImportedConstants {
  const rows: bigint[][] = [];
  let first = true;
  for (const [n, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const cells = line.split(/[\s,;]+/).filter((c) => c.length > 0);
    const numeric = cells.every((c) => /^(0[xX][0-9A-Fa-f]+|[0-9]+)$/.test(c));
    if (!numeric) {
      if (first) {
        first = false;
        continue;
      }
      throw new ImportError(`line ${n + 1}: not a row of numbers`);
    }
    first = false;
    rows.push(cells.map((c) => BigInt(c)));
  }
  return fromRows(rows, 'CSV rows');
}

/** The format of a file from its name and contents. */
export function detectFormat(path: string, text: string): ImportFormat {
  const lower = path.toLowerCase();
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.csv') || lower.endsWith('.tsv')) return 'csv';
  if (plonky3Names(text).length > 0) return 'plonky3';
  if (/\bstatic\s+ref\s+RC\d+\s*:/.test(text) || /Round constants for GF\(p\)/.test(text)) return 'horizen';
  throw new ImportError('cannot tell the format of this file; pass --format');
}

export function parseConstants(format: ImportFormat, text: string, opts: { name?: string; width?: number } = {}): ImportedConstants {
  switch (format) {
    case 'plonky3':
      return parsePlonky3(text, opts.name);
    case 'horizen':
      return parseHorizen(text, opts);
    case 'json':
      return parseJson(text, opts);
    case 'csv':
      return parseCsv(text);
  }
}

// ---------------------------------------------------------------------------
// Into a design

/** The modulus of a HADES design: BN254, a named prime field, or the one it states. */
export function designModulus(design: Record<string, unknown>): bigint | null {
  if (design['model'] === 'hades/bn254/v1') return BigInt(BN254_MODULUS);
  if (design['model'] !== 'hades/prime/v1') return null;
  if (typeof design['modulus'] === 'string' && /^[0-9]+$/.test(design['modulus'])) return BigInt(design['modulus']);
  const preset = PRIME_FIELD_PRESETS.find((f) => f.id === design['field']);
  return preset ? BigInt(preset.modulus) : null;
}

export interface ImportResult {
  design: Record<string, unknown>;
  /** Changes made to the base design besides its constants, for the user. */
  notices: string[];
}

/**
 * `base` with its constants replaced by `imported` as explicit constants
 * (decimal strings), and its round numbers set to the ones the constants'
 * layout gives. The width must agree, and every value must be below the
 * design's modulus.
 */
export function intoDesign(base: unknown, imported: ImportedConstants): ImportResult {
  const doc = base && typeof base === 'object' && !Array.isArray(base) ? (base as Record<string, unknown>) : null;
  const design = doc && 'design' in doc ? (doc['design'] as Record<string, unknown>) : doc;
  if (!design || (design['model'] !== 'hades/bn254/v1' && design['model'] !== 'hades/prime/v1')) {
    throw new ImportError('the base must be a HADES design (hades/bn254/v1 or hades/prime/v1)');
  }
  if (design['width'] !== imported.width) {
    throw new ImportError(`the constants have width ${imported.width} and the base design width ${String(design['width'])}`);
  }
  const p = designModulus(design);
  if (p !== null) {
    for (const [r, row] of imported.rows.entries()) {
      const i = row.findIndex((x) => x >= p);
      if (i >= 0) throw new ImportError(`round ${r}, position ${i}: ${row[i]} is not below the modulus ${p}`);
    }
  }
  const notices: string[] = [];
  for (const [key, value] of [
    ['fullRounds', imported.fullRounds],
    ['partialRounds', imported.partialRounds],
  ] as const) {
    if (design[key] !== value) notices.push(`${key} set to ${value} (the base design has ${String(design[key])}), as the constants' layout gives`);
  }
  const out: Record<string, unknown> = {
    ...design,
    fullRounds: imported.fullRounds,
    partialRounds: imported.partialRounds,
    constants: { kind: 'explicit', values: imported.rows.map((r) => r.map((x) => x.toString())) },
  };
  return { design: out, notices };
}
