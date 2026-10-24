/** BN254 scalar field Fr arithmetic over BigInt, elements as canonical decimal strings. */

export const BN254_P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

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

/** Shortens a long decimal for compact display, keeping both ends. */
export function abbreviateDecimal(text: string, keep = 6): string {
  return text.length <= keep * 2 + 3 ? text : `${text.slice(0, keep)}…${text.slice(-keep)}`;
}
