import { naiveCircuit } from './circuit';
import { circulant } from './library';
import { AES_MIXCOLUMNS } from './presets';
import type { AesLikeDesign, Program } from './types';

/**
 * Widths of the AES-like model. Width 4 is the supported model; widths 2
 * and 3 are experimental: the schema accepts them only with
 * `experimental: true`, and the active S-box bound (stated for width 4) is
 * not established for them by this method.
 */
export const AES_WIDTHS = [4, 3, 2] as const;
export type AesWidth = (typeof AES_WIDTHS)[number];

export function isExperimentalWidth(w: number): boolean {
  return w === 2 || w === 3;
}

/**
 * The starting matrix for each width: AES MixColumns for 4, and small
 * circulants that are MDS under the AES polynomial for 3 and 2
 * (width.test.ts checks every square submatrix in the browser).
 */
export function defaultMatrix(w: AesWidth): string[][] {
  if (w === 4) return AES_MIXCOLUMNS.map((r) => [...r]);
  return circulant(w === 3 ? ['02', '01', '01'] : ['02', '03']);
}

export function matrixLabel(w: AesWidth): string {
  return w === 4 ? 'AES MixColumns' : w === 3 ? 'circ(02, 01, 01)' : 'circ(02, 03)';
}

/**
 * The design at another width: the default matrix for that width, offsets
 * 0..w-1 (pairwise distinct), the same rounds and S-box. A circuit, if
 * there was one, is replaced by a term-by-term circuit for the new matrix
 * so the circuit and the design keep the same width.
 */
export function resizeAesDesign(
  design: AesLikeDesign,
  program: Program | null,
  w: AesWidth,
): { design: AesLikeDesign; program: Program | null } {
  const matrix = defaultMatrix(w);
  const next: AesLikeDesign = {
    model: design.model,
    field: design.field,
    width: w,
    matrix,
    offsets: Array.from({ length: w }, (_, i) => i),
    rounds: design.rounds,
    sbox: design.sbox,
    ...(isExperimentalWidth(w) ? { experimental: true } : {}),
  };
  return { design: next, program: program ? naiveCircuit(matrix, 'gf256', 'term-by-term') : null };
}
