import { abbreviateDecimal, BN254_P } from './bn254';
import { fieldOps, primeModulusOf, type DisplayField } from './field';
import type { Witness } from './types';

/** Display form of one element: uppercase hex for GF(2^8), decimal for a prime field. */
export function formatElement(field: DisplayField, value: string, abbreviate = false): string {
  const f = fieldOps(field);
  const text = f.isValid(value) ? f.canonical(value) : value;
  return field !== 'gf256' && abbreviate ? abbreviateDecimal(text) : text;
}

export function formatList(field: DisplayField, values: readonly string[], abbreviate = false): string {
  return `[${values.map((v) => formatElement(field, v, abbreviate)).join(', ')}]`;
}

/**
 * An element of a prime field (BN254 unless `field` names another) as a
 * small signed number when it is one, so that `p - 1` reads as `-1`; other
 * elements are abbreviated.
 */
export function signedDecimal(text: string, field: DisplayField = 'bn254'): string {
  const p = field === 'bn254' ? BN254_P : primeModulusOf(field);
  if (p === null || !fieldOps(field).isValid(text)) return text;
  const x = BigInt(text);
  const neg = p - x;
  if (x !== 0n && neg < 1_000_000n && neg < x) return `-${neg}`;
  return abbreviateDecimal(x.toString());
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function joinWords(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** One plain-language sentence explaining what the witness shows. */
export function describeWitness(w: Witness, field: DisplayField): string {
  switch (w.kind) {
    case 'branch': {
      const total = w.inputWeight + w.outputWeight;
      return (
        `The nonzero input ${formatList(field, w.input, true)} has ${w.inputWeight} nonzero ` +
        `${plural(w.inputWeight, 'entry', 'entries')} and its image ${formatList(field, w.output, true)} has ` +
        `${w.outputWeight}; ${w.inputWeight} + ${w.outputWeight} = ${total} is below ${w.bound}, ` +
        `so the branch number is less than ${w.bound} and the matrix is not MDS.`
      );
    }
    case 'distinguishing-input': {
      const outs = w.differing.map((i) => `y${i}`);
      return (
        `On input ${formatList(field, w.input, true)} the design gives ${formatList(field, w.expected, true)} ` +
        `but the circuit gives ${formatList(field, w.actual, true)}: ` +
        `${plural(outs.length, 'output', 'outputs')} ${joinWords(outs)} ${plural(outs.length, 'differs', 'differ')}.`
      );
    }
    case 'offset-collision':
      return (
        `Rows ${joinWords(w.rows.map(String))} are ${w.rows.length === 2 ? 'both' : 'all'} shifted by ${w.offset}, so their bytes from one column ` +
        `land in the same column and the shift does not spread a column over all four.`
      );
    case 'sbox-collision':
      return `S(${w.x1.toUpperCase()}) = S(${w.x2.toUpperCase()}) = ${w.y.toUpperCase()}: two inputs share an output, so the S-box is not a permutation.`;
    case 'sbox-differential':
      return (
        `Input difference ${w.inputDifference.toUpperCase()} becomes output difference ${w.outputDifference.toUpperCase()} on ` +
        `${w.uniformity} of the 256 inputs, and no nonzero input difference reaches any output difference more often: ` +
        `the differential uniformity is ${w.uniformity}.`
      );
    case 'sbox-linearity':
      return (
        `Input mask ${w.inputMask.toUpperCase()} and output mask ${w.outputMask.toUpperCase()} have a Walsh coefficient of ` +
        `absolute value ${w.linearity}, the largest at a nonzero output mask: the linearity is ${w.linearity} ` +
        `(nonlinearity ${128 - w.linearity / 2}).`
      );
    case 'power-collision':
      return (
        `x ↦ x^${w.exponent} sends ${abbreviateDecimal(w.x1)} and ω = ${abbreviateDecimal(w.x2)} to the same value ` +
        `(${w.note.replace(/omega/g, 'ω')}), so it is not a permutation of the field.`
      );
    case 'partial-bypass': {
      const at = w.positions.map((i) => `x${i}`);
      return (
        `Two states that differ by [${w.difference.map((x) => signedDecimal(x, field)).join(', ')}] when they enter the partial rounds ` +
        `give equal inputs to the S-box${at.length === 1 ? '' : 'es'} at ${joinWords(at)} in all ${w.partialRounds} partial ` +
        `${plural(w.partialRounds, 'round', 'rounds')}, whatever the round constants: with M the internal matrix, M^j v ` +
        `is zero there for every j < ${w.partialRounds}, so no partial-round S-box is active.`
      );
    }
  }
}

/** Short heading for the witness viewer. */
export function witnessHeading(w: Witness): string {
  switch (w.kind) {
    case 'branch':
      return 'Low-weight input';
    case 'distinguishing-input':
      return 'Distinguishing input';
    case 'offset-collision':
      return 'Offset collision';
    case 'sbox-collision':
      return 'S-box collision';
    case 'power-collision':
      return 'Power map collision';
    case 'partial-bypass':
      return 'Partial-round bypass';
    case 'sbox-differential':
      return 'Largest difference-table entry';
    case 'sbox-linearity':
      return 'Largest Walsh coefficient';
  }
}
