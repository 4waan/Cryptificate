import { fieldOps } from './field';
import type { AesLikeDesign, CandidateDesign, HadesDesign } from './types';

export interface DesignIssue {
  path: string;
  message: string;
}

export const ROUNDS_MIN = 4;
export const ROUNDS_MAX = 32;
export const EXPONENT_MAX = 65535;
export const HADES_TOTAL_ROUNDS_MAX = 160;

function matrixIssues(
  name: string,
  label: string,
  m: string[][],
  width: number,
  field: 'gf256' | 'bn254',
): DesignIssue[] {
  const f = fieldOps(field);
  const issues: DesignIssue[] = [];
  if (m.length !== width || m.some((row) => row.length !== width)) {
    issues.push({ path: `/${name}`, message: `${label} must be ${width} by ${width}.` });
    return issues;
  }
  m.forEach((row, i) =>
    row.forEach((x, j) => {
      if (!f.isValid(x)) {
        issues.push({
          path: `/${name}/${i}/${j}`,
          message: `${label} row ${i + 1}, column ${j + 1}: enter ${f.syntax}.`,
        });
      }
    }),
  );
  return issues;
}

export function validateDesign(d: CandidateDesign): DesignIssue[] {
  const issues: DesignIssue[] = [];
  if (d.model === 'aes-like/gf256/v1') {
    const w = d.width;
    if (![2, 3, 4].includes(w)) {
      issues.push({ path: '/width', message: 'AES-like designs have width 4 (2 and 3 are experimental).' });
      return issues;
    }
    issues.push(...matrixIssues('matrix', 'Matrix', d.matrix, w, 'gf256'));
    if (d.offsets.length !== w) issues.push({ path: '/offsets', message: 'Give one offset per row.' });
    d.offsets.forEach((o, i) => {
      if (!Number.isInteger(o) || o < 0 || o >= w) {
        issues.push({ path: `/offsets/${i}`, message: `Row ${i} offset must be between 0 and ${w - 1}.` });
      }
    });
    if (!Number.isInteger(d.rounds) || d.rounds < ROUNDS_MIN || d.rounds > ROUNDS_MAX) {
      issues.push({ path: '/rounds', message: `Rounds must be between ${ROUNDS_MIN} and ${ROUNDS_MAX}.` });
    }
    if (d.sbox.kind === 'table') {
      const f = fieldOps('gf256');
      if (d.sbox.table.length !== 256) {
        issues.push({
          path: '/sbox/table',
          message: `The S-box table needs 256 entries (it has ${d.sbox.table.length}).`,
        });
      } else {
        const bad = d.sbox.table.findIndex((x) => !f.isValid(x));
        if (bad >= 0) issues.push({ path: `/sbox/table/${bad}`, message: `S-box entry ${bad} must be ${f.syntax}.` });
      }
    }
    return issues;
  }
  issues.push(...matrixIssues('external', 'External matrix', d.external, 3, 'bn254'));
  issues.push(...matrixIssues('internal', 'Internal matrix', d.internal, 3, 'bn254'));
  const e = d.sbox.exponent;
  if (!Number.isInteger(e) || e < 1 || e > EXPONENT_MAX) {
    issues.push({ path: '/sbox/exponent', message: `The exponent must be a whole number from 1 to ${EXPONENT_MAX}.` });
  }
  if (!Number.isInteger(d.fullRounds) || d.fullRounds < 2 || d.fullRounds % 2 !== 0) {
    issues.push({ path: '/fullRounds', message: 'Full rounds must be a positive even number.' });
  }
  if (!Number.isInteger(d.partialRounds) || d.partialRounds < 0) {
    issues.push({ path: '/partialRounds', message: 'Partial rounds must be zero or more.' });
  }
  if (d.fullRounds + d.partialRounds > HADES_TOTAL_ROUNDS_MAX) {
    issues.push({ path: '/partialRounds', message: `At most ${HADES_TOTAL_ROUNDS_MAX} rounds in total.` });
  }
  return issues;
}

/**
 * Lower bound on active S-boxes for an AES-like design with an MDS matrix
 * (branch number 5) and pairwise distinct row offsets:
 * floor(r/4)*25 + (5 if r mod 4 >= 2 else 0).
 */
export function activityBound(rounds: number): number {
  return Math.floor(rounds / 4) * 25 + (rounds % 4 >= 2 ? 5 : 0);
}

export function activityFormula(rounds: number): string {
  const q = Math.floor(rounds / 4);
  const rem = rounds % 4;
  return `⌊${rounds}/4⌋·25 + ${rem >= 2 ? '5' : '0'} = ${q}·25 + ${rem >= 2 ? 5 : 0} = ${activityBound(rounds)}`;
}

export function identityMatrix(width: number, field: 'gf256' | 'bn254'): string[][] {
  const f = fieldOps(field);
  return Array.from({ length: width }, (_, i) => Array.from({ length: width }, (_, j) => (i === j ? f.one : f.zero)));
}

export function isAesLike(d: CandidateDesign): d is AesLikeDesign {
  return d.model === 'aes-like/gf256/v1';
}

export function isHades(d: CandidateDesign): d is HadesDesign {
  return d.model === 'hades/bn254/v1';
}

/** The matrix a program must implement for the given target. */
export function targetMatrix(d: CandidateDesign, target?: string): string[][] {
  if (isAesLike(d)) return d.matrix;
  return target === 'internal' ? d.internal : d.external;
}
