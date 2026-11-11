import { describe, expect, it } from 'vitest';
import { COALESCE_MS, HISTORY_LIMIT, emptyHistory, record, redo, undo } from './history';

describe('history', () => {
  it('undoes and redoes in order', () => {
    let h = emptyHistory<number>();
    h = record(h, 0, 1000); // 0 -> 1
    h = record(h, 1, 2000); // 1 -> 2
    const u1 = undo(h, 2)!;
    expect(u1.value).toBe(1);
    const u2 = undo(u1.history, 1)!;
    expect(u2.value).toBe(0);
    expect(undo(u2.history, 0)).toBeNull();
    const r1 = redo(u2.history, 0)!;
    expect(r1.value).toBe(1);
    const r2 = redo(r1.history, 1)!;
    expect(r2.value).toBe(2);
    expect(redo(r2.history, 2)).toBeNull();
  });

  it('coalesces a burst of edits in the same group into one step', () => {
    let h = emptyHistory<string>();
    h = record(h, 'a', 1000, 'design');
    h = record(h, 'ab', 1000 + COALESCE_MS - 1, 'design');
    h = record(h, 'abc', 1000 + 2 * (COALESCE_MS - 1), 'design'); // window slides with each edit
    expect(h.past).toEqual(['a']);
    h = record(h, 'abcd', 1000 + 3 * COALESCE_MS, 'design'); // after a pause: new step
    expect(h.past).toEqual(['a', 'abcd']);
  });

  it('never coalesces across groups or ungrouped loads', () => {
    let h = emptyHistory<number>();
    h = record(h, 0, 1000, 'design');
    h = record(h, 1, 1001, 'program');
    h = record(h, 2, 1002, null);
    h = record(h, 3, 1003, null);
    expect(h.past).toEqual([0, 1, 2, 3]);
  });

  it('a new edit clears the redo stack and breaks coalescing after undo', () => {
    let h = emptyHistory<number>();
    h = record(h, 0, 1000, 'design');
    const u = undo(h, 1)!;
    expect(u.history.future).toEqual([1]);
    const h2 = record(u.history, 0, 1001, 'design');
    expect(h2.future).toEqual([]);
    expect(h2.past).toEqual([0]);
  });

  it('is bounded', () => {
    let h = emptyHistory<number>();
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) h = record(h, i, i * 10_000);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]).toBe(20);
  });
});
