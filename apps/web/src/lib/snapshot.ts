import { canonicalJson } from './canonical';
import type { CandidateDesign, Program, ProgramTarget } from './types';

/** The editable workspace inputs: what undo, persistence and share links carry. */
export interface Snapshot {
  design: CandidateDesign;
  program: Program | null;
  target: ProgramTarget;
}

/** Exact equality of two snapshots, including in-progress (invalid) cell text. */
export function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  if (a.design === b.design && a.program === b.program && a.target === b.target) return true;
  try {
    return canonicalJson(a) === canonicalJson(b);
  } catch {
    return false;
  }
}

/** The target a program implements by default for a design's field. */
export function fieldTarget(design: CandidateDesign, target?: ProgramTarget): ProgramTarget {
  if (design.field === 'gf256') return 'matrix';
  return target === 'internal' ? 'internal' : 'external';
}
