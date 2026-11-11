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

const { handleAppKey } = await import('./keys');
const { getState, initialState, setState } = await import('./store');
type Run = import('./store').Run;

const caps = { version: '0.4.0', limits: { maxQueued: 2 }, profiles: [] } as unknown as Capabilities;

function liveRun(key: string, kind: Run['kind'], jobId: string): Run {
  return { key, kind, inputs: { design: getState().design }, source: 'live', state: 'running', steps: [], report: null, jobId };
}

function press(key: string, focused: { tagName: string; type?: string } | null = null) {
  const e = { key, code: '', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, preventDefault: vi.fn() };
  handleAppKey(e, focused, () => {});
  return e;
}

describe('Escape', () => {
  beforeEach(() => {
    vi.stubGlobal('window', globalThis);
    setState({
      ...initialState(),
      view: 'workspace',
      connection: { status: 'connected', capabilities: caps },
      runs: { a: liveRun('a', 'analysis', 'job1') },
      current: { analysis: 'a' },
    });
    for (const f of Object.values(api)) f.mockReset();
    api.stopJob.mockResolvedValue(undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('closes the Alerts popover and never stops the running check, wherever focus is', () => {
    for (const focused of [null, { tagName: 'BUTTON' }, { tagName: 'INPUT', type: 'checkbox' }]) {
      setState({ overlay: 'alerts' });
      const e = press('Escape', focused);
      expect(e.preventDefault).toHaveBeenCalled();
      expect(getState().overlay).toBeNull();
    }
    expect(api.stopJob).not.toHaveBeenCalled();
    expect(getState().runs.a!.state).toBe('running');
  });

  it('leaves Escape to an open dialog', () => {
    for (const overlay of ['help', 'palette'] as const) {
      setState({ overlay });
      press('Escape');
      expect(getState().overlay).toBe(overlay);
    }
    expect(api.stopJob).not.toHaveBeenCalled();
  });

  it('stops the running check when nothing is open', () => {
    const e = press('Escape');
    expect(e.preventDefault).toHaveBeenCalled();
    expect(api.stopJob).toHaveBeenCalledWith('job1');
  });

  it('does nothing from a text field', () => {
    press('Escape', { tagName: 'INPUT', type: 'text' });
    expect(api.stopJob).not.toHaveBeenCalled();
  });
});
