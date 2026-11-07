import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { aesDesign } from '../lib/presets';
import type { Capabilities } from '../lib/types';
import { initialState, setState, type Run } from '../state/store';
import { RunDetails, RunProgress, runStateText, runTiming } from './RunProgress';

const caps = { limits: { analysisBudgetSeconds: 90, maxQueued: 2 }, profiles: [] } as unknown as Capabilities;

function run(patch: Partial<Run> = {}): Run {
  return {
    key: 'run-1',
    kind: 'analysis',
    inputs: { design: aesDesign() },
    source: 'live',
    state: 'running',
    steps: [],
    report: null,
    startedAt: 10_000,
    ...patch,
  };
}

describe('RunProgress', () => {
  beforeEach(() => setState(initialState()));

  it('shows elapsed time, a typical-duration estimate and the service budget', () => {
    setState({ connection: { status: 'connected', capabilities: caps }, timings: { analysis: [3000, 4000, 5000] } });
    const html = renderToStaticMarkup(
      <RunProgress
        now={12_500}
        run={run({ steps: [{ name: 'lean', state: 'running' }], stepStarts: { lean: 11_000 } })}
      />,
    );
    expect(html).toContain('2.5 s · about 1.5 s left · at most 1 min 30 s');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="63"');
    // The running step shows its own elapsed time.
    expect(html).toMatch(/Lean check<\/span><span class="muted">1\.5 s/);
  });

  it('says how long a finished run took and offers no stop', () => {
    const html = renderToStaticMarkup(<RunProgress now={99_000} run={run({ state: 'completed', finishedAt: 13_200 })} />);
    expect(html).toContain('took 3.2 s');
    expect(html).not.toContain('Stop');
  });

  it('counts down to the next attempt while the service is busy', () => {
    const r = run({ state: 'retrying', retryAt: 20_000, attempts: 1 });
    expect(runStateText(r, 12_100)).toBe('Service busy, retrying in 8 s');
    const html = renderToStaticMarkup(<RunProgress now={12_100} run={r} />);
    expect(html).toContain('retry in 8 s');
    expect(html).toContain('Retry now');
    expect(html).toContain('Stop');
    expect(html).toContain('attempt 2 of 6');
  });

  it('leaves the error of an ended run to the execution banner', () => {
    const ended = run({ state: 'failed', finishedAt: 20_000, attempts: 6, error: 'The service stayed busy for all 6 attempts.' });
    expect(renderToStaticMarkup(<RunProgress now={30_000} run={ended} />)).not.toContain('stayed busy');
    const stopFailed = run({ error: 'Stop request failed.' });
    expect(renderToStaticMarkup(<RunProgress now={12_000} run={stopFailed} />)).toContain('Stop request failed.');
  });

  it('names auto-checks, and has no timing for replayed runs', () => {
    expect(renderToStaticMarkup(<RunProgress now={11_000} run={run({ auto: true })} />)).toContain('Auto-check:');
    expect(runTiming(run({ source: 'replay' }), 11_000, caps, {})).toBeNull();
  });
});

describe('RunDetails', () => {
  beforeEach(() => setState(initialState()));

  it('shows the steps and retry explanation without a live region or buttons', () => {
    const steps = run({ steps: [{ name: 'lean', state: 'running' }], stepStarts: { lean: 11_000 } });
    const html = renderToStaticMarkup(<RunDetails now={12_500} run={steps} />);
    expect(html).toContain('Lean check');
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain('<button');
    const busy = renderToStaticMarkup(<RunDetails now={12_100} run={run({ state: 'retrying', retryAt: 20_000, attempts: 1 })} />);
    expect(busy).toContain('attempt 2 of 6');
    expect(busy).not.toContain('<button');
  });

  it('renders nothing once the run has ended or while there is nothing to show', () => {
    expect(renderToStaticMarkup(<RunDetails now={99_000} run={run({ state: 'completed', finishedAt: 13_200, steps: [{ name: 'lean', state: 'completed', ms: 900 }] })} />)).toBe('');
    expect(renderToStaticMarkup(<RunDetails now={11_000} run={run({ state: 'submitting' })} />)).toBe('');
  });
});
