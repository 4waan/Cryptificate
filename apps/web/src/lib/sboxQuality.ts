import { formatGfHex } from './gf256';
import type { SboxDifferentialWitness, SboxLinearityWitness } from './types';

/**
 * Differential uniformity and linearity of a 256-entry byte table, computed
 * in the browser for the unchecked preview. The certificate states the same
 * values and Lean checks them on the table. The witness is the first pair
 * attaining the maximum, in order of the input difference or mask and then
 * of the output one, as the engine reports it.
 */

function parity(n: number): number {
  let p = 0;
  for (let v = n; v; v &= v - 1) p ^= 1;
  return p;
}

/** max over a != 0 and b of #{x : S(x ^ a) ^ S(x) = b}. */
export function differentialUniformity(table: readonly number[]): SboxDifferentialWitness {
  let best = { u: 0, a: 1, b: 0 };
  const row = new Uint16Array(256);
  for (let a = 1; a < 256; a++) {
    row.fill(0);
    for (let x = 0; x < 256; x++) row[table[x ^ a]! ^ table[x]!]! += 1;
    for (let b = 0; b < 256; b++) if (row[b]! > best.u) best = { u: row[b]!, a, b };
  }
  return { kind: 'sbox-differential', uniformity: best.u, inputDifference: formatGfHex(best.a), outputDifference: formatGfHex(best.b) };
}

/** Walsh coefficients W(a, b) for every a, by the fast Walsh-Hadamard transform of (-1)^(b.S(x)). */
function walshColumn(table: readonly number[], b: number): Int32Array {
  const w = new Int32Array(256);
  for (let x = 0; x < 256; x++) w[x] = parity(b & table[x]!) ? -1 : 1;
  for (let half = 1; half < 256; half *= 2) {
    for (let start = 0; start < 256; start += 2 * half) {
      for (let i = start; i < start + half; i++) {
        const p = w[i]!;
        const q = w[i + half]!;
        w[i] = p + q;
        w[i + half] = p - q;
      }
    }
  }
  return w;
}

/** max over a and b != 0 of |sum over x of (-1)^(a.x ^ b.S(x))|. */
export function linearity(table: readonly number[]): SboxLinearityWitness {
  const columns: Int32Array[] = [new Int32Array(256)];
  for (let b = 1; b < 256; b++) columns.push(walshColumn(table, b));
  let best = { l: 0, a: 0, b: 1 };
  for (let a = 0; a < 256; a++) {
    for (let b = 1; b < 256; b++) {
      const v = Math.abs(columns[b]![a]!);
      if (v > best.l) best = { l: v, a, b };
    }
  }
  return { kind: 'sbox-linearity', linearity: best.l, inputMask: formatGfHex(best.a), outputMask: formatGfHex(best.b) };
}
