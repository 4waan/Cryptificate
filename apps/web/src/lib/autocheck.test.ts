import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTO_DELAY_MS,
  AUTO_MIN_INTERVAL_MS,
  UNAVAILABLE_REASON,
  createAutoChecker,
  decideAutoCheck,
  type AutoReport,
  type AutoView,
} from './autocheck';

const base: AutoView = {
  enabled: true,
  inWorkspace: true,
  connecting: false,
  digest: 'd1',
  experimentActive: false,
  room: 3,
};

describe('decideAutoCheck', () => {
  it('is off unless switched on', () => {
    expect(decideAutoCheck({ ...base, enabled: false })).toEqual({ kind: 'off' });
  });

  it('never runs while the inputs are invalid, outside the workspace or while connecting', () => {
    expect(decideAutoCheck({ ...base, digest: null })).toMatchObject({ kind: 'idle', reason: 'Waiting for valid inputs.' });
    expect(decideAutoCheck({ ...base, inWorkspace: false }).kind).toBe('idle');
    expect(decideAutoCheck({ ...base, connecting: true }).kind).toBe('idle');
  });

  it('runs new inputs, and does nothing for inputs already checked or being checked', () => {
    expect(decideAutoCheck(base)).toEqual({ kind: 'run', digest: 'd1' });
    const last = { key: 'run-1', digest: 'd1', active: false, auto: true, failed: false };
    expect(decideAutoCheck({ ...base, last })).toEqual({ kind: 'idle', reason: 'Up to date.' });
    expect(decideAutoCheck({ ...base, last: { ...last, active: true } })).toEqual({ kind: 'checking' });
    expect(decideAutoCheck({ ...base, last: { ...last, failed: true } })).toMatchObject({ kind: 'idle' });
  });

  it('never says "Up to date" when no recorded check matched', () => {
    const last = { key: 'run-1', digest: 'd1', active: false, auto: true, failed: false, unavailable: true };
    const d = decideAutoCheck({ ...base, last });
    expect(d).toEqual({ kind: 'idle', reason: UNAVAILABLE_REASON });
    expect(UNAVAILABLE_REASON).toMatch(/No recorded check.*start the service/);
    // New inputs are still looked up.
    expect(decideAutoCheck({ ...base, last: { ...last, digest: 'd0' } })).toEqual({ kind: 'run', digest: 'd1' });
  });

  it('supersedes an unfinished auto-check of other inputs, but never a check the user started', () => {
    const last = { key: 'run-1', digest: 'd0', active: true, auto: true, failed: false };
    expect(decideAutoCheck({ ...base, last })).toEqual({ kind: 'run', digest: 'd1', supersede: 'run-1' });
    expect(decideAutoCheck({ ...base, last: { ...last, auto: false } })).toMatchObject({ kind: 'idle' });
    // Superseding frees a slot, so a full queue does not block it.
    expect(decideAutoCheck({ ...base, last, room: 0 })).toEqual({ kind: 'run', digest: 'd1', supersede: 'run-1' });
  });

  it('waits for room in the service queue and for experiments to finish', () => {
    expect(decideAutoCheck({ ...base, room: 0 })).toMatchObject({ kind: 'idle', reason: 'Waiting for room in the service queue.' });
    expect(decideAutoCheck({ ...base, experimentActive: true })).toMatchObject({ kind: 'idle', reason: 'Paused while an experiment runs.' });
  });
});

describe('auto-check driver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(initial: Partial<AutoView> = {}) {
    let view: AutoView = { ...base, ...initial };
    const started: string[] = [];
    const stopped: string[] = [];
    const reports: AutoReport[] = [];
    let n = 0;
    const driver = createAutoChecker({
      read: () => view,
      start: () => {
        const key = `run-${++n}`;
        started.push(view.digest!);
        view = { ...view, last: { key, digest: view.digest, active: true, auto: true, failed: false } };
      },
      stop: async (key) => {
        stopped.push(key);
        if (view.last?.key === key) view = { ...view, last: { ...view.last, active: false, failed: true } };
      },
      report: (s) => reports.push(s),
    });
    return {
      driver,
      started,
      stopped,
      reports,
      set(patch: Partial<AutoView>) {
        view = { ...view, ...patch };
        driver.update();
      },
      finish() {
        if (view.last) view = { ...view, last: { ...view.last, active: false } };
        driver.update();
      },
    };
  }

  it('checks once, 1.2 s after the last edit', async () => {
    const t = setup();
    t.driver.update();
    expect(t.reports.at(-1)).toMatchObject({ kind: 'scheduled' });
    await vi.advanceTimersByTimeAsync(800);
    t.set({ digest: 'd2' });
    await vi.advanceTimersByTimeAsync(800);
    t.set({ digest: 'd3' });
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS - 1);
    expect(t.started).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.started).toEqual(['d3']);
    expect(t.reports.at(-1)).toEqual({ kind: 'checking' });
    // Repeated updates with the same inputs start nothing more.
    t.driver.update();
    t.finish();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(t.started).toEqual(['d3']);
    expect(t.reports.at(-1)).toEqual({ kind: 'idle', reason: 'Up to date.' });
  });

  it('never starts while the inputs are invalid', async () => {
    const t = setup();
    t.driver.update();
    await vi.advanceTimersByTimeAsync(500);
    t.set({ digest: null });
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.started).toEqual([]);
    t.set({ digest: 'd4' });
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS);
    expect(t.started).toEqual(['d4']);
  });

  it('stops a superseded auto-check before starting the next', async () => {
    const t = setup();
    t.driver.update();
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS);
    expect(t.started).toEqual(['d1']);
    t.set({ digest: 'd2' });
    await vi.advanceTimersByTimeAsync(AUTO_MIN_INTERVAL_MS + AUTO_DELAY_MS);
    expect(t.stopped).toEqual(['run-1']);
    expect(t.started).toEqual(['d1', 'd2']);
  });

  it('keeps a minimum interval between submissions', async () => {
    const t = setup();
    t.driver.update();
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS);
    t.finish();
    t.set({ digest: 'd2' });
    await vi.advanceTimersByTimeAsync(AUTO_DELAY_MS);
    // 1.2 s after the first submission: too soon, so it waits for the rest of the interval.
    expect(t.started).toEqual(['d1']);
    await vi.advanceTimersByTimeAsync(AUTO_MIN_INTERVAL_MS - AUTO_DELAY_MS);
    expect(t.started).toEqual(['d1', 'd2']);
  });

  it('turning it off cancels a scheduled check', async () => {
    const t = setup();
    t.driver.update();
    await vi.advanceTimersByTimeAsync(600);
    t.set({ enabled: false });
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.started).toEqual([]);
    expect(t.reports.at(-1)).toEqual({ kind: 'off' });
  });

  it('reports only changes', () => {
    const t = setup({ digest: null });
    t.driver.update();
    t.driver.update();
    t.driver.update();
    expect(t.reports).toEqual([{ kind: 'idle', reason: 'Waiting for valid inputs.' }]);
  });
});
