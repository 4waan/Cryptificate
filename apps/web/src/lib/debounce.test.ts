import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce } from './debounce';

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('calls once after a burst, with the latest arguments', () => {
    const fn = vi.fn();
    const d = debounce(fn, 300);
    d.call(1);
    vi.advanceTimersByTime(200);
    d.call(2);
    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();
    expect(d.pending()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(2);
    expect(d.pending()).toBe(false);
  });

  it('flushes immediately and cancels', () => {
    const fn = vi.fn();
    const d = debounce(fn, 300);
    d.call('a');
    d.flush();
    expect(fn).toHaveBeenCalledWith('a');
    d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    d.call('b');
    d.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('uses injected timers', () => {
    const queued: (() => void)[] = [];
    const fn = vi.fn();
    const d = debounce(fn, 50, { set: (f) => queued.push(f), clear: () => queued.splice(0) });
    d.call(1);
    d.call(2);
    expect(queued).toHaveLength(1);
    queued[0]!();
    expect(fn).toHaveBeenCalledWith(2);
  });
});
