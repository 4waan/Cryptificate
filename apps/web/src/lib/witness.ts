import { abbreviateDecimal } from './bn254';
import { fieldOps } from './field';
import type { FieldName, Witness } from './types';

/** Display form of one element: uppercase hex for GF(2^8), decimal for BN254. */
export function formatElement(field: FieldName, value: string, abbreviate = false): string {
  const f = fieldOps(field);
  const text = f.isValid(value) ? f.canonical(value) : value;
  return field === 'bn254' && abbreviate ? abbreviateDecimal(text) : text;
}

export function formatList(field: FieldName, values: readonly string[], abbreviate = false): string {
  return `[${values.map((v) => formatElement(field, v, abbreviate)).join(', ')}]`;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function joinWords(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** One plain-language sentence explaining what the witness shows. */
export function describeWitness(w: Witness, field: FieldName): string {
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
    case 'power-collision':
      return (
        `x ↦ x^${w.exponent} sends ${abbreviateDecimal(w.x1)} and ω = ${abbreviateDecimal(w.x2)} to the same value ` +
        `(${w.note.replace(/omega/g, 'ω')}), so it is not a permutation of the field.`
      );
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
  }
}
