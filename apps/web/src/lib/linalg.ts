import type { FieldOps } from './field';

/** Small dense linear algebra over a field given by string-encoded elements. */

export type Mat = string[][];

/** Rank and a nonzero kernel vector (when rank < columns) by Gaussian elimination. */
export function rankAndKernel(f: FieldOps, m: Mat): { rank: number; kernel: string[] | null } {
  const rows = m.length;
  const cols = m[0]?.length ?? 0;
  const a = m.map((r) => [...r]);
  const pivotCols: number[] = [];
  let row = 0;
  for (let col = 0; col < cols && row < rows; col++) {
    let p = row;
    while (p < rows && f.isZero(a[p]![col]!)) p++;
    if (p === rows) continue;
    [a[row], a[p]] = [a[p]!, a[row]!];
    const inv = f.inv(a[row]![col]!)!;
    a[row] = a[row]!.map((x) => f.mul(x, inv));
    for (let r = 0; r < rows; r++) {
      if (r === row || f.isZero(a[r]![col]!)) continue;
      const factor = a[r]![col]!;
      // a[r] -= factor * a[row]; subtraction is addition of the negation.
      a[r] = a[r]!.map((x, j) => f.add(x, f.neg(f.mul(factor, a[row]![j]!))));
    }
    pivotCols.push(col);
    row++;
  }
  const rank = pivotCols.length;
  if (rank === cols) return { rank, kernel: null };
  const free = Array.from({ length: cols }, (_, j) => j).find((j) => !pivotCols.includes(j))!;
  const x = Array.from({ length: cols }, () => f.zero);
  x[free] = f.one;
  pivotCols.forEach((pc, r) => {
    x[pc] = f.neg(a[r]![free]!);
  });
  return { rank, kernel: x };
}

export function matVec(f: FieldOps, m: Mat, v: readonly string[]): string[] {
  return m.map((row) => row.reduce((acc, x, j) => f.add(acc, f.mul(x, v[j]!)), f.zero));
}

export function weight(f: FieldOps, v: readonly string[]): number {
  return v.filter((x) => !f.isZero(x)).length;
}

function combinations(n: number, k: number): number[][] {
  const out: number[][] = [];
  const go = (start: number, acc: number[]) => {
    if (acc.length === k) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < n; i++) go(i + 1, [...acc, i]);
  };
  go(0, []);
  return out;
}

export interface SingularMinor {
  rows: number[];
  cols: number[];
}

/** The first singular square submatrix in order of size, or null if every minor is nonzero. */
export function firstSingularMinor(f: FieldOps, m: Mat): SingularMinor | null {
  const n = m.length;
  for (let k = 1; k <= n; k++) {
    for (const cols of combinations(n, k)) {
      for (const rows of combinations(n, k)) {
        const sub = rows.map((r) => cols.map((c) => m[r]![c]!));
        if (rankAndKernel(f, sub).rank < k) return { rows, cols };
      }
    }
  }
  return null;
}

/**
 * A nonzero x with weight(x) + weight(Mx) <= width, built from a singular
 * minor M[R, C]: x is supported on C and Mx vanishes on R.
 */
export function branchWitness(f: FieldOps, m: Mat): { input: string[]; output: string[] } | null {
  const minor = firstSingularMinor(f, m);
  if (!minor) return null;
  const sub = minor.rows.map((r) => minor.cols.map((c) => m[r]![c]!));
  const { kernel } = rankAndKernel(f, sub);
  if (!kernel) return null;
  const n = m.length;
  const input = Array.from({ length: n }, () => f.zero);
  minor.cols.forEach((c, i) => {
    input[c] = kernel[i]!;
  });
  return { input, output: matVec(f, m, input) };
}
