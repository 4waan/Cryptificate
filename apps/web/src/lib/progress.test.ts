import { describe, expect, it } from 'vitest';
import type { Capabilities } from './types';
import {
  TIMINGS_KEPT,
  budgetMs,
  estimate,
  estimateText,
  formatDuration,
  median,
  parseTimings,
  recordTiming,
  timingKey,
  typicalMs,
} from './progress';

const caps = {
  limits: { analysisBudgetSeconds: 90, maxQueued: 2 },
  profiles: [
    { id: 'quick', label: 'Quick', budget: { totalSeconds: 120 } },
    { id: 'research', label: 'Research', budget: { totalSeconds: 900 } },
  ],
} as unknown as Capabilities;

describe('timings', () => {
  it('keys runs by kind and profile', () => {
    expect(timingKey('analysis')).toBe('analysis');
    expect(timingKey('analysis', 'research')).toBe('analysis');
    expect(timingKey('experiment')).toBe('experiment:quick');
    expect(timingKey('experiment', 'research')).toBe('experiment:research');
  });

  it('keeps the last few durations and takes their median', () => {
    let t = {};
    for (let i = 1; i <= TIMINGS_KEPT + 3; i++) t = recordTiming(t, 'analysis', i * 1000);
    expect((t as Record<string, number[]>).analysis).toHaveLength(TIMINGS_KEPT);
    expect(typicalMs(t, 'analysis')).toBe(((TIMINGS_KEPT + 1) / 2 + 3) * 1000);
    expect(typicalMs(t, 'experiment:quick')).toBeUndefined();
    expect(recordTiming(t, 'analysis', Number.NaN)).toBe(t);
    expect(recordTiming(t, 'analysis', -1)).toBe(t);
  });

  it('median', () => {
    expect(median([])).toBeUndefined();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('parses stored timings defensively', () => {
    expect(parseTimings(null)).toEqual({});
    expect(parseTimings('nope')).toEqual({});
    expect(parseTimings('[1,2]')).toEqual({});
    expect(parseTimings('{"analysis":[1000,"x",-5,2000],"bogus":[1],"experiment:quick":5,"experiment:research":[9000]}')).toEqual({
      analysis: [1000, 2000],
      'experiment:research': [9000],
    });
  });
});

describe('budget and estimate', () => {
  it('reads the service budgets', () => {
    expect(budgetMs(caps, 'analysis')).toBe(90_000);
    expect(budgetMs(caps, 'experiment')).toBe(120_000);
    expect(budgetMs(caps, 'experiment', 'research')).toBe(900_000);
    expect(budgetMs(undefined, 'analysis')).toBeUndefined();
  });

  it('estimates against the typical duration, capped below done', () => {
    const e = estimate(1500, 3000, 90_000);
    expect(e.fraction).toBe(0.5);
    expect(e.remainingMs).toBe(1500);
    expect(e.overTypical).toBe(false);
    expect(estimateText(e)).toBe('about 1.5 s left · at most 1 min 30 s');
    const late = estimate(5000, 3000, 90_000);
    expect(late.fraction).toBe(0.95);
    expect(late.remainingMs).toBeUndefined();
    expect(estimateText(late)).toBe('longer than usual (3.0 s) · at most 1 min 30 s');
    expect(estimateText(estimate(500))).toBe('');
    expect(estimateText(estimate(500, undefined, 60_000))).toBe('at most 1 min');
  });

  it.each([
    [0, '0.0 s'],
    [420, '0.4 s'],
    [2_449, '2.4 s'],
    [12_400, '12 s'],
    [59_400, '59 s'],
    [65_000, '1 min 05 s'],
    [120_000, '2 min'],
    [-5, '0.0 s'],
  ])('formatDuration(%i) = %s', (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});
