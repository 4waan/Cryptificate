/** BN254 scalar field Fr arithmetic over BigInt, elements as canonical decimal strings. */

import { BN254_MODULUS } from './types';

export const BN254_P = BigInt(BN254_MODULUS);

const DEC_RE = /^(0|[1-9][0-9]*)$/;

/** Canonical decimal: digits only, no sign, no leading zeros, below p. */
export function isBnDecimal(text: string): boolean {
  return DEC_RE.test(text) && text.length <= 80 && BigInt(text) < BN254_P;
}

export function parseBn(text: string): bigint {
  if (!isBnDecimal(text)) throw new Error(`not a canonical BN254 element: ${JSON.stringify(text)}`);
  return BigInt(text);
}

export function formatBn(value: bigint): string {
  return mod(value).toString(10);
}

export function mod(a: bigint, m: bigint = BN254_P): bigint {
  const r = a % m;
  return r < 0n ? r + m : r;
}

export function bnAdd(a: bigint, b: bigint): bigint {
  return mod(a + b);
}

export function bnMul(a: bigint, b: bigint): bigint {
  return mod(a * b);
}

export function powMod(base: bigint, exponent: bigint, m: bigint = BN254_P): bigint {
  let result = 1n;
  let b = mod(base, m);
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return result;
}

export function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y) [x, y] = [y, x % y];
  return x;
}

/** Inverse of a modulo m, or null when gcd(a, m) != 1. */
export function invMod(a: bigint, m: bigint): bigint | null {
  let [oldR, r] = [mod(a, m), m];
  let [oldS, s] = [1n, 0n];
  while (r !== 0n) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  return oldR === 1n ? mod(oldS, m) : null;
}

export function bnInv(a: bigint): bigint | null {
  return a === 0n ? null : invMod(a, BN254_P);
}

/** Values within this distance below p are shown as "p−k". */
export const NEAR_P = 1_000_000n;

/**
 * Compact display text for a BN254 element in a matrix cell: short values
 * as they are, values just below p as "p−k" (so -1 reads p−1), and other
 * long values as the first 6 digits, an ellipsis and the last 4. `spoken`
 * is the text for screen readers: "p minus k", or the full value.
 * Non-canonical text is returned unchanged.
 */
export function compactBn(text: string, maxDigits = 12): { text: string; spoken: string; short: boolean } {
  if (!isBnDecimal(text) || text.length <= maxDigits) return { text, spoken: text, short: false };
  const below = BN254_P - BigInt(text);
  if (below <= NEAR_P) return { text: `p\u2212${below}`, spoken: `p minus ${below}`, short: true };
  return { text: `${text.slice(0, 6)}\u2026${text.slice(-4)}`, spoken: text, short: true };
}

/** Shortens a long decimal for compact display, keeping both ends. */
export function abbreviateDecimal(text: string, keep = 6): string {
  return text.length <= keep * 2 + 3 ? text : `${text.slice(0, keep)}…${text.slice(-keep)}`;
}
