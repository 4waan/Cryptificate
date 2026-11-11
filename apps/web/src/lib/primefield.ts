/**
 * The prime-field profile (`hades/prime/v1`) in the browser: the named
 * fields, the modulus of a design and a primality test for custom moduli.
 *
 * The test here only decides what the editor reports while you type. The
 * engine decides validity again, and every report proves the modulus prime
 * in Lean from a Pratt certificate (claim `field.prime`).
 */
import { powMod } from './bn254';
import { PRIME_FIELD_PRESETS, PRIME_MODULUS_LIMIT } from './types';
import type { CandidateDesign, PrimeFieldName } from './types';

export { PRIME_FIELD_PRESETS };

const DEC_RE = /^[1-9][0-9]{0,19}$/;

/** The display name of a prime field: "BabyBear", …, or "custom prime". */
export function primeFieldLabel(field: PrimeFieldName): string {
  return PRIME_FIELD_PRESETS.find((f) => f.id === field)?.label ?? 'custom prime';
}

/** The modulus of a prime-field design: the given one, else the named field's. */
export function modulusOf(design: CandidateDesign): bigint | null {
  if (design.model !== 'hades/prime/v1') return null;
  const text = design.modulus ?? PRIME_FIELD_PRESETS.find((f) => f.id === design.field)?.modulus;
  return text !== undefined && DEC_RE.test(text) ? BigInt(text) : null;
}

const BASES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];

/**
 * Whether `n` is prime, for `n` below 2^64: Miller-Rabin with the first
 * twelve prime bases, which is exact in that range (the same test as the
 * engine's).
 */
export function isPrime64(n: bigint): boolean {
  if (n < 2n || n >= PRIME_MODULUS_LIMIT) return false;
  for (const p of BASES) {
    if (n % p === 0n) return n === p;
  }
  let d = n - 1n;
  let s = 0;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    s += 1;
  }
  outer: for (const a of BASES) {
    let x = powMod(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    for (let i = 1; i < s; i++) {
      x = (x * x) % n;
      if (x === n - 1n) continue outer;
    }
    return false;
  }
  return true;
}

/** Why a custom modulus is not usable, or null when it is a prime below 2^64. */
export function modulusProblem(text: string | undefined): string | null {
  if (text === undefined || text === '') return 'Enter a prime modulus below 2^64.';
  if (!DEC_RE.test(text)) return 'The modulus is a decimal number without sign, spaces or leading zeros.';
  const n = BigInt(text);
  if (n >= PRIME_MODULUS_LIMIT) return 'The modulus must be below 2^64.';
  if (!isPrime64(n)) return `${text} is not prime.`;
  return null;
}
