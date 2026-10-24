import { BN254_P, bnAdd, bnInv, bnMul, formatBn, isBnDecimal, parseBn } from './bn254';
import { formatGfHex, gfInv, gfMul, isGfHex, parseGfHex } from './gf256';
import type { FieldName } from './types';

/** Field operations on the JSON string encoding of elements. */
export interface FieldOps {
  name: FieldName;
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

export function fieldOps(name: FieldName): FieldOps {
  return name === 'gf256' ? GF256 : BN254;
}

/** Formats a vector of elements for display: uppercase hex bytes, or decimals. */
export function formatVector(field: FieldName, values: readonly string[]): string {
  const ops = fieldOps(field);
  return `[${values.map((v) => (ops.isValid(v) ? ops.canonical(v) : v)).join(', ')}]`;
}
