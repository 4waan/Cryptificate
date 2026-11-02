import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Capabilities } from '../lib/types';

const api = vi.hoisted(() => ({
  createJob: vi.fn(),
  getJob: vi.fn(),
  stopJob: vi.fn(),
  getCapabilities: vi.fn(),
}));

vi.mock('../data/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../data/api')>();
  return { ...real, ...api };
});

const { ApiError } = await import('../data/api');
const { autoView, checkNow, reconnectDelayMs, startRun, stopRun, retryNow, setDesign } = await import('./actions');
const { getState, initialState, setState } = await import('./store');

const caps = { version: '0.4.0', limits: { maxQueued: 2, analysisBudgetSeconds: 90 }, profiles: [] } as unknown as Capabilities;
const busy = (retryAfter?: number) => new ApiError('busy', 429, 'queue-full', undefined, retryAfter);

describe('live runs against a busy service', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', globalThis);
    setState({ ...initialState(), view: 'workspace', connection: { status: 'connected', capabilities: caps } });
    for (const f of Object.values(api)) f.mockReset();
    api.getJob.mockResolvedValue({ id: 'j1', kind: 'analysis', state: 'running', origin: 'live', steps: [], report: null });
    api.stopJob.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('waits out a 429 for Retry-After seconds, then submits again', async () => {
    api.createJob.mockRejectedValueOnce(busy(7)).mockResolvedValueOnce({ id: 'j1', state: 'queued' });
    const key = startRun('analysis')!;
    await vi.advanceTimersByTimeAsync(0);
    let run = getState().runs[key]!;
    expect(run.state).toBe('retrying');
    expect(run.attempts).toBe(1);
    expect(run.retryAt! - Date.now()).toBe(7000);
    await vi.advanceTimersByTimeAsync(6999);
    expect(api.createJob).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(api.createJob).toHaveBeenCalledTimes(2);
    run = getState().runs[key]!;
    expect(run.jobId).toBe('j1');
    expect(run.state).toBe('queued');
    expect(run.retryAt).toBeUndefined();
  });

  it('gives up after the last attempt, with an execution failure (not a refutation)', async () => {
    api.createJob.mockRejectedValue(busy());
    const key = startRun('analysis')!;
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    const run = getState().runs[key]!;
    expect(api.createJob).toHaveBeenCalledTimes(6);
    expect(run.state).toBe('failed');
    expect(run.error).toMatch(/stayed busy/);
    expect(run.finishedAt).toBeDefined();
  });

  it('Stop while waiting cancels the resubmission; Retry now skips the wait', async () => {
    api.createJob.mockRejectedValueOnce(busy(30));
    const key = startRun('analysis')!;
    await vi.advanceTimersByTimeAsync(0);
    await stopRun(key);
    expect(getState().runs[key]!.state).toBe('cancelled');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.createJob).toHaveBeenCalledTimes(1);

    api.createJob.mockRejectedValueOnce(busy(30)).mockResolvedValueOnce({ id: 'j2', state: 'queued' });
    const second = startRun('analysis')!;
    await vi.advanceTimersByTimeAsync(0);
    retryNow(second);
    await vi.advanceTimersByTimeAsync(0);
    expect(getState().runs[second]!.jobId).toBe('j2');
  });

  it('a job created by a request that was in flight when Stop was pressed is stopped too', async () => {
    let resolve!: (v: unknown) => void;
    api.createJob.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const key = startRun('analysis')!;
    await stopRun(key);
    resolve({ id: 'late', state: 'queued' });
    await vi.advanceTimersByTimeAsync(0);
    expect(api.stopJob).toHaveBeenCalledWith('late');
    expect(getState().runs[key]!.state).toBe('cancelled');
  });

  it('Check supersedes a running check of earlier inputs, and not one of these inputs', async () => {
    api.createJob.mockResolvedValue({ id: 'j1', state: 'running' });
    const first = checkNow()!;
    await vi.advanceTimersByTimeAsync(0);
    expect(checkNow()).toBeNull();
    const d = getState().design;
    if (d.model !== 'aes-like/gf256/v1') throw new Error('expected AES-like');
    setDesign({ ...d, rounds: 6 });
    const second = checkNow();
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    await vi.advanceTimersByTimeAsync(0);
    expect(api.stopJob).toHaveBeenCalledWith('j1');
    expect(getState().current.analysis).toBe(second);
  });
});

describe('auto-check view of the store', () => {
  beforeEach(() => setState({ ...initialState(), view: 'workspace', connection: { status: 'connected', capabilities: caps } }));

  it('has no digest while the inputs are invalid', () => {
    setState({ prefs: { autoCheck: true, notify: false, sound: false } });
    expect(autoView().digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    const d = getState().design;
    if (d.model !== 'aes-like/gf256/v1') throw new Error('expected AES-like');
    setState({ design: { ...d, rounds: 99 } });
    expect(autoView().digest).toBeNull();
  });

  it('counts room in the service queue from this page’s own live jobs', () => {
    const run = (key: string, state: 'running' | 'queued' | 'completed') => ({
      key,
      kind: 'analysis' as const,
      inputs: { design: getState().design },
      source: 'live' as const,
      state,
      steps: [],
      report: null,
    });
    setState({ runs: { a: run('a', 'running'), b: run('b', 'queued'), c: run('c', 'completed') } });
    expect(autoView().room).toBe(1);
  });
});

describe('reconnect', () => {
  it('tries quickly at first, then every 15 s', () => {
    expect([1, 2, 3, 4, 10].map(reconnectDelayMs)).toEqual([3000, 5000, 10000, 15000, 15000]);
  });
});
