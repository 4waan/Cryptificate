import { describe, expect, it } from 'vitest';
import { BUSY_MAX_DELAY_MS, busyRetryDelayMs, parseRetryAfter, queueRoom, secondsUntil } from './retry';

describe('parseRetryAfter', () => {
  const now = Date.parse('2026-11-02T12:00:00Z');
  it.each([
    ['30', 30],
    [' 5 ', 5],
    ['0', 0],
    ['Mon, 02 Nov 2026 12:00:10 GMT', 10],
    ['Mon, 02 Nov 2026 11:59:00 GMT', 0],
    ['soon', undefined],
    ['', undefined],
    [null, undefined],
    [undefined, undefined],
    ['-3', undefined],
  ])('%j -> %s', (v, want) => {
    expect(parseRetryAfter(v as string | null | undefined, now)).toBe(want);
  });
});

describe('busyRetryDelayMs', () => {
  it('uses Retry-After when the service sends it, within bounds', () => {
    expect(busyRetryDelayMs(1, 30)).toBe(30_000);
    expect(busyRetryDelayMs(3, 0)).toBe(1_000);
    expect(busyRetryDelayMs(1, 3600)).toBe(BUSY_MAX_DELAY_MS);
  });
  it('backs off exponentially without it', () => {
    expect([1, 2, 3, 4, 5].map((n) => busyRetryDelayMs(n))).toEqual([2000, 4000, 8000, 16000, 32000]);
    expect(busyRetryDelayMs(9)).toBe(BUSY_MAX_DELAY_MS);
    expect(busyRetryDelayMs(0)).toBe(2000);
  });
});

describe('queueRoom', () => {
  it('counts one running job plus the queue, minus this page’s own jobs', () => {
    expect(queueRoom(2, 0)).toBe(3);
    expect(queueRoom(2, 2)).toBe(1);
    expect(queueRoom(2, 3)).toBe(0);
    expect(queueRoom(2, 7)).toBe(0);
    expect(queueRoom(undefined, 0)).toBe(3);
    expect(queueRoom(0, 0)).toBe(1);
  });
});

describe('secondsUntil', () => {
  it('rounds up and never goes negative', () => {
    expect(secondsUntil(10_500, 10_000)).toBe(1);
    expect(secondsUntil(10_000, 10_000)).toBe(0);
    expect(secondsUntil(9_000, 10_000)).toBe(0);
    expect(secondsUntil(18_001, 10_000)).toBe(9);
  });
});
