import { BN254_P } from './bn254';
import { primeModulusOf, type DisplayField } from './field';

/**
 * Matrix text in the notations designers copy from papers, reference code
 * and computer-algebra sessions:
 *
 * - whitespace, comma or semicolon separated grids, one row per line
 *   (a single line of n·n values is read row by row);
 * - C and Rust array literals: {{0x02, 0x03, …}, …} and [[0x02u8, …], …],
 *   with or without a declaration before the "=";
 * - Python, NumPy and Sage nested lists: [[2, 3, 1, 1], …],
 *   matrix(F, [[…]]), matrix(F, 4, 4, [ …16 values… ]), np.array([[…]]);
 * - single-argument wrappers around entries such as F(2), e(0x02),
 *   F.fetch_int(2) or F.from_integer(2), and quoted entries ("02").
 *
 * GF(2^8) cells come out as two uppercase hex digits, and BN254 and other
 * prime-field cells as canonical decimals below p.
 */

/** How to read numbers without a 0x prefix in GF(2^8). */
export type Radix = 'auto' | 'hex' | 'dec';

export interface ParseOptions {
  /** Expected size; a flat list of size·size values is reshaped. */
  size?: number;
  radix?: Radix;
}

export interface ParsedMatrix {
  ok: true;
  matrix: string[][];
  /** The reading used for bare GF(2^8) numbers. */
  radix: 'hex' | 'dec';
  /** True when a bare number would read differently in the other radix. */
  ambiguous: boolean;
  /** Short notes on how the text was read, for display. */
  notes: string[];
}

export interface MatrixError {
  ok: false;
  error: string;
  /** Zero-based row and column of the offending entry, when there is one. */
  at?: { row: number; col: number };
}

export type MatrixParse = ParsedMatrix | MatrixError;

/* ------------------------------------------------------------------ */
/* Tokenizer and tree                                                  */

type Node = { kind: 'atom'; text: string } | { kind: 'group'; open: string; items: Node[][] };

const OPEN: Record<string, string> = { '[': ']', '{': '}', '(': ')' };
const CLOSE = new Set([']', '}', ')']);

/**
 * Splits text into a tree of groups. A group's items are the comma or
 * semicolon separated parts; each part is a list of nodes (an atom, a group,
 * or an atom followed by a call group such as F(2)).
 */
function parseTree(text: string): Node[][] | string {
  let i = 0;
  const parseItems = (close: string | null): Node[][] | string => {
    const items: Node[][] = [[]];
    while (i < text.length) {
      const ch = text[i]!;
      if (close !== null && ch === close) {
        i++;
        return items;
      }
      if (CLOSE.has(ch)) return `Unexpected “${ch}”.`;
      if (ch === ',' || ch === ';') {
        items.push([]);
        i++;
        continue;
      }
      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      if (OPEN[ch]) {
        i++;
        const inner = parseItems(OPEN[ch]!);
        if (typeof inner === 'string') return inner;
        items[items.length - 1]!.push({ kind: 'group', open: ch, items: inner });
        continue;
      }
      if (ch === '"' || ch === "'") {
        const end = text.indexOf(ch, i + 1);
        if (end < 0) return 'A quoted entry is not closed.';
        items[items.length - 1]!.push({ kind: 'atom', text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
      let j = i;
      while (j < text.length && !/[\s,;[\]{}()"']/.test(text[j]!)) j++;
      items[items.length - 1]!.push({ kind: 'atom', text: text.slice(i, j) });
      i = j;
    }
    if (close !== null) return `A “${Object.keys(OPEN).find((k) => OPEN[k] === close)}” is not closed.`;
    return items;
  };
  return parseItems(null);
}

/** The scalar text of an item, unwrapping single-argument calls such as F(2); null if not scalar. */
function scalarOf(item: Node[]): string | null {
  if (item.length === 1 && item[0]!.kind === 'atom') return item[0]!.text;
  // Wrapper call: name(arg) or name.method(arg), possibly chained like GF(p)(5).
  const last = item[item.length - 1];
  if (item.length >= 2 && last?.kind === 'group' && last.open === '(' && item[0]!.kind === 'atom') {
    if (last.items.length === 1) return scalarOf(last.items[0]!);
  }
  return null;
}

function nonEmpty(items: Node[][]): Node[][] {
  return items.filter((it) => it.length > 0);
}

/** A list group's entries as scalars, or null when some entry is not a scalar. */
function scalarList(g: Node): string[] | null {
  if (g.kind !== 'group' || g.open === '(') return null;
  const out: string[] = [];
  for (const item of nonEmpty(g.items)) {
    const s = scalarOf(item);
    if (s === null) return null;
    out.push(s);
  }
  return out.length ? out : null;
}

/** A list of lists of scalars: [[…], […]] or {{…}, {…}}. */
function nestedRows(g: Node): string[][] | null {
  if (g.kind !== 'group' || g.open === '(') return null;
  const items = nonEmpty(g.items);
  if (items.length < 1) return null;
  const rows: string[][] = [];
  for (const item of items) {
    if (item.length !== 1) return null;
    const row = scalarList(item[0]!);
    if (!row) return null;
    rows.push(row);
  }
  return rows;
}

function* walk(items: Node[][]): Generator<Node> {
  for (const item of items) {
    for (const node of item) {
      yield node;
      if (node.kind === 'group') yield* walk(node.items);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Cells                                                               */

const HEX_PREFIX = /^[+-]?0x/i;

/** Strips C and Rust integer suffixes: 0x02u8, 2_u8, 3U, 4UL. */
function stripSuffix(t: string): string {
  return t.replace(/_?(u8|u16|u32|u64|u128|i8|i16|i32|i64|usize)$/i, '').replace(/^(\d+|0x[0-9a-f]+)(u|ul|ull|l|ll)$/i, '$1');
}

function cleanToken(raw: string): string {
  return stripSuffix(raw.trim());
}

const NUMERIC = /^[+-]?(0x)?[0-9a-f]+$/i;

function looksNumeric(t: string): boolean {
  return NUMERIC.test(cleanToken(t));
}

function isBareDigits(t: string): boolean {
  return /^\d+$/.test(t);
}

type CellRead = { value: string } | { error: string };

function readGf(token: string, radix: 'hex' | 'dec'): CellRead {
  const t = cleanToken(token);
  let n: number;
  if (HEX_PREFIX.test(t)) {
    if (t.startsWith('-')) return { error: `“${token}” is negative; GF(2⁸) bytes are 00 to FF` };
    const body = t.replace(/^\+?0x/i, '');
    if (!/^[0-9a-f]+$/i.test(body)) return { error: `“${token}” is not a hex byte` };
    n = parseInt(body, 16);
  } else if (radix === 'dec') {
    if (!isBareDigits(t)) {
      return /^[0-9a-f]+$/i.test(t)
        ? { error: `“${token}” has hex digits but bare numbers are read as decimal here` }
        : { error: `“${token}” is not a number` };
    }
    n = parseInt(t, 10);
  } else {
    if (!/^[0-9a-f]+$/i.test(t)) return { error: `“${token}” is not a hex byte` };
    n = parseInt(t, 16);
  }
  if (!Number.isFinite(n) || n > 0xff) return { error: `“${token}” is larger than FF` };
  return { value: n.toString(16).toUpperCase().padStart(2, '0') };
}

/** The modulus of a prime display field and how errors name it. */
function primeOf(field: DisplayField): { p: bigint; name: string } {
  if (field === 'bn254') return { p: BN254_P, name: 'the BN254 modulus p' };
  return { p: primeModulusOf(field) ?? 0n, name: 'the field modulus p' };
}

function readBn(token: string, { p, name }: { p: bigint; name: string } = primeOf('bn254')): CellRead {
  const t = cleanToken(token);
  let n: bigint;
  try {
    if (/^[+-]?0x[0-9a-f]+$/i.test(t)) {
      const neg = t.startsWith('-');
      n = BigInt(t.replace(/^[+-]/, ''));
      if (neg) n = -n;
    } else if (/^[+-]?\d+$/.test(t)) n = BigInt(t);
    else return { error: `“${token}” is not an integer` };
  } catch {
    return { error: `“${token}” is not an integer` };
  }
  if (n >= p) return { error: `“${token}” is not below ${name}` };
  if (n < 0n) {
    if (-n >= p) return { error: `“${token}” is not above −p` };
    n += p;
  }
  return { value: n.toString(10) };
}

/**
 * Normalizes one typed cell: "1" → "01", "a" → "0A", "0x1b" → "1B" in
 * GF(2^8); "0x10" → "16", "-1" → p − 1, "007" → "7" in BN254 and the other
 * prime fields. Returns null when the text is not an element.
 */
export function normalizeCell(text: string, field: DisplayField): string | null {
  const t = text.trim();
  if (!t) return null;
  if (field === 'gf256') {
    if (!HEX_PREFIX.test(t) && t.replace(/^\+/, '').length > 2) return null;
    const r = readGf(t, 'hex');
    return 'value' in r ? r.value : null;
  }
  const r = readBn(t, primeOf(field));
  return 'value' in r ? r.value : null;
}

/* ------------------------------------------------------------------ */
/* Matrix parsing                                                      */

interface Extracted {
  rows: string[][];
  code: boolean;
  notes: string[];
}

function extract(text: string, size: number | undefined): Extracted | MatrixError {
  // LaTeX environments: \begin{pmatrix} 02 & 03 \\ 01 & 02 \end{pmatrix}.
  text = text.replace(/\\(begin|end)\{[a-z*]*\}/gi, ' ').replace(/\\(left|right)\s*[[\]()]/g, ' ');
  const hasBrackets = /[[\]{}]/.test(text);
  if (hasBrackets) {
    const tree = parseTree(text);
    if (typeof tree === 'string') return { ok: false, error: tree };
    const nodes = [...walk(tree)];
    // Prefer a list of at least two lists of scalars.
    for (const node of nodes) {
      const rows = nestedRows(node);
      if (rows && rows.length >= 2) return { rows, code: true, notes: [] };
    }
    // Then a flat list of size·size numbers (Sage's matrix(F, n, n, [ … ]), a C array of 16 bytes).
    let nearest: number | null = null;
    for (const node of nodes) {
      const flat = scalarList(node);
      if (!flat || flat.length < 2 || !flat.every(looksNumeric)) continue;
      const n = size ?? Math.round(Math.sqrt(flat.length));
      if (n >= 2 && flat.length === n * n) {
        return {
          rows: Array.from({ length: n }, (_, r) => flat.slice(r * n, r * n + n)),
          code: true,
          notes: [`Read a flat list of ${flat.length} values row by row.`],
        };
      }
      nearest ??= flat.length;
    }
    if (nearest !== null) {
      const want = size ? `a ${size}×${size} matrix needs ${size * size}` : 'a square matrix needs a square count';
      return { ok: false, error: `Found a list of ${nearest} values; ${want}.` };
    }
    return { ok: false, error: 'No matrix found: expected nested lists such as [[02, 03], [01, 02]].' };
  }
  // Plain grid. LaTeX rows end in \\ and separate cells with &.
  const lines = text
    .replace(/\\\\/g, '\n')
    .replace(/&/g, ' ')
    .split(/\r?\n|;/)
    .map((l) => l.split(/[\s,|]+/).filter(Boolean))
    .filter((l) => l.length);
  if (!lines.length) return { ok: false, error: 'Nothing to read.' };
  if (lines.length === 1) {
    const flat = lines[0]!;
    const n = size ?? Math.round(Math.sqrt(flat.length));
    if (n >= 2 && flat.length === n * n) {
      return {
        rows: Array.from({ length: n }, (_, r) => flat.slice(r * n, r * n + n)),
        code: false,
        notes: flat.length > 1 ? [`Read ${flat.length} values row by row.`] : [],
      };
    }
  }
  return { rows: lines, code: false, notes: [] };
}

/** Parses matrix text in any supported notation; see the module comment. */
export function parseMatrixText(text: string, field: DisplayField, options: ParseOptions = {}): MatrixParse {
  if (!text.trim()) return { ok: false, error: 'Nothing to read.' };
  if (text.length > 200_000) return { ok: false, error: 'The text is too long for a matrix.' };
  const got = extract(text, options.size);
  if ('ok' in got) return got;
  const { rows } = got;
  const notes = [...got.notes];
  const n = rows.length;
  if (options.size !== undefined && n !== options.size) {
    return { ok: false, error: `Found ${n} ${n === 1 ? 'row' : 'rows'}; expected ${options.size}.` };
  }
  const width = options.size ?? rows[0]!.length;
  const plural = (k: number) => `${k} ${k === 1 ? 'entry' : 'entries'}`;
  for (let r = 0; r < n; r++) {
    const len = rows[r]!.length;
    if (len !== width) {
      return {
        ok: false,
        error: options.size
          ? `Row ${r + 1} has ${plural(len)}; a ${width}×${width} matrix needs ${width} per row.`
          : `Row ${r + 1} has ${plural(len)}; row 1 has ${width}.`,
        at: { row: r, col: Math.max(0, Math.min(len, width - 1)) },
      };
    }
  }
  if (n !== width) {
    return { ok: false, error: `Found ${n} ${n === 1 ? 'row' : 'rows'} of ${plural(width)}; the matrix must be square.` };
  }

  let radix: 'hex' | 'dec' = 'hex';
  let ambiguous = false;
  if (field === 'gf256') {
    const bare = rows.flat().map(cleanToken).filter((t) => !HEX_PREFIX.test(t));
    const hasHexLetters = bare.some((t) => /^[0-9a-f]+$/i.test(t) && /[a-f]/i.test(t));
    const requested = options.radix ?? 'auto';
    if (requested === 'auto') radix = hasHexLetters ? 'hex' : got.code ? 'dec' : 'hex';
    else radix = requested;
    ambiguous = !hasHexLetters && bare.some((t) => isBareDigits(t) && parseInt(t, 10) >= 10);
    if (ambiguous) {
      notes.push(
        radix === 'dec'
          ? 'Numbers without 0x were read as decimal, as in Python, Sage, C and Rust source.'
          : 'Numbers without 0x were read as hex, as in the matrix cells.',
      );
    }
  }

  const matrix: string[][] = [];
  for (let r = 0; r < n; r++) {
    const row: string[] = [];
    for (let c = 0; c < n; c++) {
      const read = field === 'gf256' ? readGf(rows[r]![c]!, radix) : readBn(rows[r]![c]!, primeOf(field));
      if ('error' in read) return { ok: false, error: `Row ${r + 1}, column ${c + 1}: ${read.error}.`, at: { row: r, col: c } };
      row.push(read.value);
    }
    matrix.push(row);
  }
  if (field !== 'gf256' && rows.flat().some((t) => cleanToken(t).startsWith('-'))) {
    notes.push('Negative entries were reduced modulo p.');
  }
  return { ok: true, matrix, radix, ambiguous, notes };
}

/* ------------------------------------------------------------------ */
/* Export                                                              */

export type MatrixFormat = 'json' | 'c' | 'rust' | 'sage' | 'grid';

export const MATRIX_FORMATS: { id: MatrixFormat; label: string }[] = [
  { id: 'json', label: 'JSON' },
  { id: 'c', label: 'C array' },
  { id: 'rust', label: 'Rust array' },
  { id: 'sage', label: 'Sage matrix' },
  { id: 'grid', label: 'Plain grid' },
];

const AES_MODULUS_SAGE = 'x^8 + x^4 + x^3 + x + 1';

/**
 * Formats a matrix for pasting into other tools. GF(2^8) entries become
 * 0x-prefixed bytes in C and Rust and field elements of
 * GF(2)[x]/(x^8 + x^4 + x^3 + x + 1) in Sage; BN254 entries stay decimal
 * (strings in C and Rust, which have no native 254-bit integer); entries of
 * the 64-bit prime fields are u64 literals in C and Rust, and GF(p) in Sage.
 */
export function formatMatrix(m: string[][], field: DisplayField, format: MatrixFormat, name = 'M'): string {
  const n = m.length;
  const p64 = field === 'gf256' || field === 'bn254' ? null : primeModulusOf(field);
  const hex = (v: string) => `0x${v.toUpperCase()}`;
  switch (format) {
    case 'json':
      return `[\n${m.map((row) => `  [${row.map((v) => JSON.stringify(v)).join(', ')}]`).join(',\n')}\n]`;
    case 'grid':
      return m.map((row) => row.join(' ')).join('\n');
    case 'c':
      if (p64 !== null) return `/* elements modulo p = ${p64.toString()} */\nstatic const uint64_t ${name}[${n}][${n}] = {\n${m.map((row) => `    {${row.map((v) => `${v}ULL`).join(', ')}}`).join(',\n')}\n};`;
      return field === 'gf256'
        ? `static const uint8_t ${name}[${n}][${n}] = {\n${m.map((row) => `    {${row.map(hex).join(', ')}}`).join(',\n')}\n};`
        : `/* BN254 scalar field elements, decimal */\nstatic const char *${name}[${n}][${n}] = {\n${m.map((row) => `    {${row.map((v) => `"${v}"`).join(', ')}}`).join(',\n')}\n};`;
    case 'rust':
      if (p64 !== null) return `// elements modulo p = ${p64.toString()}\nconst ${name}: [[u64; ${n}]; ${n}] = [\n${m.map((row) => `    [${row.join(', ')}],`).join('\n')}\n];`;
      return field === 'gf256'
        ? `const ${name}: [[u8; ${n}]; ${n}] = [\n${m.map((row) => `    [${row.map(hex).join(', ')}],`).join('\n')}\n];`
        : `// BN254 scalar field elements, decimal\nconst ${name}: [[&str; ${n}]; ${n}] = [\n${m.map((row) => `    [${row.map((v) => `"${v}"`).join(', ')}],`).join('\n')}\n];`;
    case 'sage':
      return field === 'gf256'
        ? [
            'R.<x> = GF(2)[]',
            `F.<a> = GF(2^8, modulus=${AES_MODULUS_SAGE})`,
            '# byte -> field element, bit i is the coefficient of a^i',
            'e = lambda n: sum(((n >> i) & 1) * a^i for i in range(8))',
            `${name} = matrix(F, [\n${m.map((row) => `    [${row.map((v) => `e(${hex(v)})`).join(', ')}]`).join(',\n')}\n])`,
          ].join('\n')
        : [
            `p = ${(p64 ?? BN254_P).toString()}`,
            'F = GF(p)',
            `${name} = matrix(F, [\n${m.map((row) => `    [${row.join(', ')}]`).join(',\n')}\n])`,
          ].join('\n');
  }
}
