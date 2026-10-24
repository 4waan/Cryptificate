import { describe, expect, it } from 'vitest';
import { median, niceTicks, samplesPerColumn, summarize } from './stats';

describe('measurement helpers', () => {
  it('computes medians and quartiles', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(summarize([1, 2, 3, 4, 5])).toEqual({ median: 3, q1: 2, q3: 4, min: 1, max: 5 });
  });

  it('keeps per-column samples and rescales per-sample totals', () => {
    const perColumn = {
      bytes: 65536,
      columns: 16384,
      samples: [1.1, 1.0, 1.2],
      medianNsPerColumn: 1.1,
      iqr: 0.1,
      mibPerSec: 1,
    };
    expect(samplesPerColumn(perColumn)).toEqual([1.1, 1.0, 1.2]);
    const totals = { ...perColumn, samples: [5.5e7, 5e7, 6e7] };
    expect(samplesPerColumn(totals).map((x) => +x.toFixed(6))).toEqual([1.1, 1.0, 1.2]);
  });

  it('produces round ticks', () => {
    expect(niceTicks(0.95, 1.1, 4)).toEqual([0.95, 1, 1.05, 1.1]);
    expect(niceTicks(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
  });
});
