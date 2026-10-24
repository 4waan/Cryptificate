import { circuitStats } from './circuit';
import type { Comparison, ExperimentCandidate, ExperimentReport } from './types';

export const PRIMARY_BYTES = 65536;
export const THRESHOLD = 1.02;

export function candidateLabel(c: Pick<ExperimentCandidate, 'id' | 'origin'>): string {
  switch (c.origin) {
    case 'baseline-known':
      return 'Reference (textbook)';
    case 'baseline-direct':
      return 'Reference (direct)';
    case 'user':
      return 'Your circuit';
    default:
      return `Candidate ${c.id}`;
  }
}

export function labelForId(report: ExperimentReport, id: string): string {
  const c = report.candidates.find((x) => x.id === id);
  if (c) return candidateLabel(c);
  if (id === 'baseline-known' || id === 'baseline-direct' || id === 'user') {
    return candidateLabel({ id, origin: id });
  }
  return id;
}

export function opCount(c: ExperimentCandidate): number {
  const s = circuitStats(c.program);
  return s.adds + s.muls;
}

/** A candidate counts only if its equivalence is proved and, when run, native correctness passed. */
export function isVerified(c: ExperimentCandidate): boolean {
  return c.equivalence.status === 'proved' && (c.native === null || c.native.passed);
}

/** The cheapest verified search candidate (fewest operations, then lowest depth). */
export function bestCandidate(report: ExperimentReport): ExperimentCandidate | null {
  const pool = report.candidates.filter((c) => c.origin === 'search' && isVerified(c));
  if (!pool.length) return null;
  return [...pool].sort((a, b) => {
    const d = opCount(a) - opCount(b);
    return d !== 0 ? d : circuitStats(a.program).depth - circuitStats(b.program).depth;
  })[0]!;
}

/** The reference the story compares against: the textbook circuit, else the direct one, else the user's. */
export function referenceCandidate(report: ExperimentReport): ExperimentCandidate | null {
  for (const origin of ['baseline-known', 'baseline-direct', 'user'] as const) {
    const c = report.candidates.find((x) => x.origin === origin);
    if (c) return c;
  }
  return null;
}

export function comparisonsFor(report: ExperimentReport, candidate: string, baseline: string): Comparison[] {
  const all = report.measurements?.comparisons ?? [];
  const pair = all.filter((c) => c.candidate === candidate && c.baseline === baseline);
  const primary = pair.filter((c) => c.bytes === undefined || c.bytes === PRIMARY_BYTES);
  return primary.length ? primary : pair;
}

export interface Savings {
  structural: string | null;
  timing: string | null;
}

function fmtCi(c: Comparison): string {
  return `session ${c.session}: ${c.ratio.toFixed(3)}× (95% CI ${c.ci95[0].toFixed(3)} to ${c.ci95[1].toFixed(3)})`;
}

function referenceName(c: ExperimentCandidate): string {
  switch (c.origin) {
    case 'baseline-known':
      return 'the textbook reference';
    case 'baseline-direct':
      return 'the direct reference';
    case 'user':
      return 'your circuit';
    default:
      return `candidate ${c.id}`;
  }
}

/**
 * Plain-language summary of what the experiment shows: structural savings
 * from operation counts, and what timing on this machine does or does not
 * confirm. Never claims a speedup the measurements do not support.
 */
export function savingsSummary(report: ExperimentReport): Savings {
  const best = bestCandidate(report);
  const ref = referenceCandidate(report);
  if (!best || !ref) return { structural: null, timing: null };
  const b = circuitStats(best.program);
  const r = circuitStats(ref.program);
  const addWord = best.program.field === 'gf256' ? 'XORs' : 'additions';
  const parts: string[] = [];
  if (b.adds !== r.adds) parts.push(`${b.adds} ${addWord} instead of ${r.adds}`);
  if (b.xtimes !== r.xtimes) parts.push(`${b.xtimes} xtimes instead of ${r.xtimes}`);
  if (b.otherMuls !== r.otherMuls) parts.push(`${b.otherMuls} other multiplications instead of ${r.otherMuls}`);
  const fewer = opCount(best) < opCount(ref);
  const structural = parts.length
    ? `${candidateLabel(best)} uses ${parts.join(' and ')} in ${referenceName(ref)}; its equivalence to the design is Lean-checked.`
    : `${candidateLabel(best)} uses the same operation counts as ${referenceName(ref)}.`;

  const m = report.measurements;
  if (!m) {
    const skipped = (report.execution?.steps ?? report.checkpoints ?? []).find(
      (s) => /^bench|tim/.test(s.name) && s.detail,
    );
    const why = skipped?.detail ? `: ${skipped.detail.charAt(0).toLowerCase()}${skipped.detail.slice(1)}` : '.';
    return { structural, timing: `Not timed in this run${why}` };
  }
  const comps = comparisonsFor(report, best.id, ref.id);
  const shown = comps.length ? ` Speedup over ${referenceName(ref)}, ${comps.map(fmtCi).join('; ')}.` : '';
  const mismatched = (m.sessions ?? [])
    .filter((x) => x.checksumsAgree === false || x.samplesConsistent === false)
    .map((x) => x.session);
  let timing: string;
  if (m.verdict === 'locally confirmed') {
    timing = `Faster on this machine: the 95% interval stays above ${THRESHOLD} in both confirmation sessions.${shown}`;
  } else if (m.verdict === 'inconclusive' && mismatched.length > 0) {
    timing = `Timing is inconclusive: the timed outputs did not all match in session ${mismatched.join(' and ')}, so no speed-up is claimed.${shown}`;
  } else if (m.verdict === 'inconclusive') {
    timing = `Timing is inconclusive on this machine: the 95% interval does not clear ${THRESHOLD}.${shown}`;
    if (fewer) {
      timing +=
        ' An optimizing compiler can already share these subexpressions in the reference, so fewer operations in the circuit need not mean faster machine code.';
    }
  } else {
    timing = `No improvement on this machine: the candidate is not faster than the reference.${shown}`;
  }
  return { structural, timing };
}
