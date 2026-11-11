import { BN254_P, bnAdd, bnInv, bnMul, formatBn, invMod, isBnDecimal, mod, parseBn } from './bn254';
import { formatGfHex, gfInv, gfMul, isGfHex, parseGfHex } from './gf256';
import { PRIME_FIELD_PRESETS } from './types';
import type { CandidateDesign, FieldName } from './types';

/**
 * The field a value is displayed and computed in: `gf256`, `bn254`, or
 * `prime:<p>` for the prime-field profile (`hades/prime/v1`) with modulus p.
 */
export type DisplayField = FieldName | `prime:${string}`;

/** Field operations on the JSON string encoding of elements. */
export interface FieldOps {
  name: DisplayField;
  zero: string;
  one: string;
  isValid(text: string): boolean;
  /** Canonical encoding (uppercase hex, or the decimal string unchanged). */
  canonical(text: string): string;
  add(a: string, b: string): string;
  mul(a: string, b: string): string;
  neg(a: string): string;
  inv(a: string): string | null;
  isZero(a: string): boolean;
  /** Short message describing the accepted syntax. */
  syntax: string;
}

export const GF256: FieldOps = {
  name: 'gf256',
  zero: '00',
  one: '01',
  isValid: isGfHex,
  canonical: (t) => formatGfHex(parseGfHex(t)),
  add: (a, b) => formatGfHex(parseGfHex(a) ^ parseGfHex(b)),
  mul: (a, b) => formatGfHex(gfMul(parseGfHex(a), parseGfHex(b))),
  neg: (a) => formatGfHex(parseGfHex(a)),
  inv: (a) => (parseGfHex(a) === 0 ? null : formatGfHex(gfInv(parseGfHex(a)))),
  isZero: (a) => parseGfHex(a) === 0,
  syntax: 'two hex digits, 00 to FF',
};

export const BN254: FieldOps = {
  name: 'bn254',
  zero: '0',
  one: '1',
  isValid: isBnDecimal,
  canonical: (t) => formatBn(parseBn(t)),
  add: (a, b) => formatBn(bnAdd(parseBn(a), parseBn(b))),
  mul: (a, b) => formatBn(bnMul(parseBn(a), parseBn(b))),
  neg: (a) => formatBn(-parseBn(a)),
  inv: (a) => {
    const r = bnInv(parseBn(a));
    return r === null ? null : formatBn(r);
  },
  isZero: (a) => parseBn(a) === 0n,
  syntax: `a decimal number from 0 to p - 1 (p = ${BN254_P.toString().slice(0, 6)}…), no sign or leading zeros`,
};

const DEC_RE = /^(0|[1-9][0-9]*)$/;
const primeCache = new Map<string, FieldOps>();

/** Arithmetic modulo a prime `p` below 2^64 on canonical decimal strings. */
export function primeFieldOps(p: bigint): FieldOps {
  const key = p.toString();
  const cached = primeCache.get(key);
  if (cached) return cached;
  const valid = (t: string): boolean => DEC_RE.test(t) && t.length <= 20 && BigInt(t) < p;
  const parse = (t: string): bigint => {
    if (!valid(t)) throw new Error(`not a canonical element modulo ${key}: ${JSON.stringify(t)}`);
    return BigInt(t);
  };
  const fmt = (x: bigint): string => mod(x, p).toString(10);
  const ops: FieldOps = {
    name: `prime:${key}`,
    zero: '0',
    one: '1',
    isValid: valid,
    canonical: (t) => fmt(parse(t)),
    add: (a, b) => fmt(parse(a) + parse(b)),
    mul: (a, b) => fmt(parse(a) * parse(b)),
    neg: (a) => fmt(-parse(a)),
    inv: (a) => {
      const r = invMod(parse(a), p);
      return r === null ? null : fmt(r);
    },
    isZero: (a) => parse(a) === 0n,
    syntax: `a decimal number from 0 to ${(p - 1n).toString()}, no sign or leading zeros`,
  };
  primeCache.set(key, ops);
  return ops;
}

/** The modulus named by a `prime:<p>` display field, if it is one. */
export function primeModulusOf(field: DisplayField): bigint | null {
  if (!field.startsWith('prime:')) return null;
  const text = field.slice('prime:'.length);
  return DEC_RE.test(text) && text.length <= 20 ? BigInt(text) : null;
}

export function fieldOps(name: DisplayField): FieldOps {
  if (name === 'gf256') return GF256;
  if (name === 'bn254') return BN254;
  const p = primeModulusOf(name);
  // An unusable modulus validates nothing.
  return p !== null && p >= 2n ? primeFieldOps(p) : primeFieldOps(1n);
}

/**
 * The display field of a design: `prime:<p>` for the prime-field profile
 * (with an empty modulus while a custom one is being typed).
 */
export function displayFieldOf(design: CandidateDesign): DisplayField {
  if (design.model === 'hades/prime/v1') {
    const preset = PRIME_FIELD_PRESETS.find((f) => f.id === design.field);
    return `prime:${design.modulus ?? preset?.modulus ?? ''}`;
  }
  return design.field;
}

/** Formats a vector of elements for display: uppercase hex bytes, or decimals. */
export function formatVector(field: DisplayField, values: readonly string[]): string {
  const ops = fieldOps(field);
  return `[${values.map((v) => (ops.isValid(v) ? ops.canonical(v) : v)).join(', ')}]`;
}
