import type { Capabilities, ExperimentProfile, JobKind } from './types';

/**
 * Elapsed time and a rough estimate for a running job. Times are measured
 * on the client (they include polling latency), so everything here is
 * approximate. The upper bound is the service's own budget from
 * /api/capabilities; the typical duration is the median of the last few
 * runs of the same kind finished in this browser.
 */

export const TIMINGS_KEY = 'cryptificate.timings.v1';
/** Durations kept per kind of run. */
export const TIMINGS_KEPT = 9;

export type Timings = Record<string, number[]>;

export function timingKey(kind: JobKind, profile?: ExperimentProfile): string {
  return kind === 'analysis' ? 'analysis' : `experiment:${profile ?? 'quick'}`;
}

export function recordTiming(t: Timings, key: string, ms: number, kept = TIMINGS_KEPT): Timings {
  if (!Number.isFinite(ms) || ms < 0) return t;
  const list = [...(t[key] ?? []), Math.round(ms)].slice(-kept);
  return { ...t, [key]: list };
}

export function median(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function typicalMs(t: Timings, key: string): number | undefined {
  return median(t[key] ?? []);
}

export function parseTimings(text: string | null | undefined): Timings {
  if (!text) return {};
  try {
    const raw = JSON.parse(text) as unknown;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
    const out: Timings = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!/^(analysis|experiment:[a-z]+)$/.test(k) || !Array.isArray(v)) continue;
      const xs = v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0);
      if (xs.length) out[k] = xs.slice(-TIMINGS_KEPT);
    }
    return out;
  } catch {
    return {};
  }
}

/** The service's time budget for a job, in ms, when the capabilities say. */
export function budgetMs(caps: Capabilities | undefined, kind: JobKind, profile?: ExperimentProfile): number | undefined {
  if (!caps) return undefined;
  if (kind === 'analysis') {
    const s = caps.limits?.analysisBudgetSeconds;
    return typeof s === 'number' && s > 0 ? s * 1000 : undefined;
  }
  const p = caps.profiles?.find((x) => x.id === (profile ?? 'quick'));
  const s = p?.budget?.totalSeconds;
  return typeof s === 'number' && s > 0 ? s * 1000 : undefined;
}

export interface Estimate {
  elapsedMs: number;
  typicalMs?: number;
  budgetMs?: number;
  /** 0..1 against the typical duration, capped below 1 until the job ends. */
  fraction?: number;
  /** Time left against the typical duration, while there is some. */
  remainingMs?: number;
  /** Longer than the typical duration already. */
  overTypical: boolean;
}

export function estimate(elapsedMs: number, typical?: number, budget?: number): Estimate {
  const e = Math.max(0, elapsedMs);
  const out: Estimate = { elapsedMs: e, overTypical: false };
  if (budget !== undefined) out.budgetMs = budget;
  if (typical !== undefined && typical > 0) {
    out.typicalMs = typical;
    out.fraction = Math.min(0.95, e / typical);
    if (e < typical) out.remainingMs = typical - e;
    else out.overTypical = true;
  }
  return out;
}

/** "0.4 s", "2.4 s", "12 s", "1 min 05 s". */
export function formatDuration(ms: number): string {
  const t = Math.max(0, ms);
  if (t < 10_000) return `${(t / 1000).toFixed(1)} s`;
  const s = Math.round(t / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} min ${String(r).padStart(2, '0')} s` : `${m} min`;
}

/** The estimate as words, e.g. "about 1.2 s left · at most 90 s". */
export function estimateText(e: Estimate): string {
  const parts: string[] = [];
  if (e.remainingMs !== undefined) parts.push(`about ${formatDuration(e.remainingMs)} left`);
  else if (e.overTypical && e.typicalMs !== undefined) parts.push(`longer than usual (${formatDuration(e.typicalMs)})`);
  if (e.budgetMs !== undefined) parts.push(`at most ${formatDuration(e.budgetMs)}`);
  return parts.join(' · ');
}
