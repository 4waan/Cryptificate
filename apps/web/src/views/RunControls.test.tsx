import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { aesDesign } from '../lib/presets';
import { initialState, setState, type Run } from '../state/store';
import { ExperimentsView } from './ExperimentsView';
import { StoryView } from './StoryView';
import { WorkspaceView } from './WorkspaceView';

function active(kind: Run['kind']): Run {
  return {
    key: `${kind}-1`,
    kind,
    profile: kind === 'experiment' ? 'quick' : undefined,
    inputs: { design: aesDesign() },
    source: 'live',
    state: 'running',
    steps: [{ name: kind === 'analysis' ? 'lean' : 'search', state: 'running' }],
    report: null,
    startedAt: Date.now(),
  };
}

const count = (html: string, re: RegExp) => html.match(re)?.length ?? 0;
const stopButtons = /<button[^>]*title="Stop \(Esc\)"/g;

describe('one Stop button and one status region per running job', () => {
  beforeEach(() => setState({ ...initialState(), design: aesDesign(), program: null }));

  it('on the Experiments view', () => {
    const r = active('experiment');
    setState({ runs: { [r.key]: r }, current: { experiment: r.key } });
    const html = renderToStaticMarkup(<ExperimentsView />);
    expect(count(html, stopButtons)).toBe(1);
    expect(count(html, /<strong>Experiment \(quick\):<\/strong>/g)).toBe(1);
    // The steps still appear, in the panel below the action bar.
    expect(html).toContain('aria-label="Steps"');
  });

  it('on the Workspace view, for a running check', () => {
    const r = active('analysis');
    setState({ runs: { [r.key]: r }, current: { analysis: r.key } });
    const html = renderToStaticMarkup(<WorkspaceView />);
    expect(count(html, stopButtons)).toBe(1);
    expect(count(html, /<strong>Analysis:<\/strong>/g)).toBe(1);
    expect(html).toContain('aria-label="Steps"');
  });

  it('on the Workspace view, for a running check while the inputs have a problem', () => {
    const r = active('analysis');
    const d = aesDesign();
    // Editing is allowed during a check: a matrix that lost a row is an input problem.
    setState({ design: { ...d, matrix: d.matrix.slice(0, 3) }, runs: { [r.key]: r }, current: { analysis: r.key } });
    const html = renderToStaticMarkup(<WorkspaceView />);
    expect(html).toMatch(/input problems? to fix before checking/);
    expect(count(html, stopButtons)).toBe(1);
    expect(count(html, /<strong>Analysis:<\/strong>/g)).toBe(1);
    expect(html).toContain('Stop in the run bar at the top of the workspace');
  });
});

describe('the story', () => {
  beforeEach(() => setState({ ...initialState(), design: aesDesign(), program: null }));

  it('step 1 shows a running search once, with no polite region around its ticking step times', () => {
    const r = active('experiment');
    setState({ runs: { [r.key]: r }, view: 'story', storyStep: 1, story: { ...initialState().story, runs: { step1: r.key } } });
    const html = renderToStaticMarkup(<StoryView />);
    expect(count(html, stopButtons)).toBe(1);
    expect(html).toContain('aria-label="Steps"');
    // The compact RunProgress's role="status" is the one live region for the run.
    expect(count(html, /aria-live="polite"/g)).toBe(count(html, /role="status"[^>]*aria-live="polite"/g));
  });
});

describe('the workspace run bar after a job ends', () => {
  beforeEach(() => setState({ ...initialState(), design: aesDesign(), program: null }));

  it('keeps the status of an experiment that ended without a report, and points to why', () => {
    const r: Run = { ...active('experiment'), state: 'failed', finishedAt: Date.now(), error: 'The local service could not be reached.' };
    setState({ runs: { [r.key]: r }, current: { experiment: r.key } });
    const html = renderToStaticMarkup(<WorkspaceView />);
    expect(html).toMatch(/<strong>Experiment \(quick\):<\/strong> Failed/);
    expect(html).toContain('href="#/experiments"');
    expect(count(html, stopButtons)).toBe(0);
  });

  it('offers the way to the result area for a check that ended without a report', () => {
    const r: Run = { ...active('analysis'), state: 'failed', finishedAt: Date.now(), error: 'Invalid request' };
    setState({ runs: { [r.key]: r }, current: { analysis: r.key } });
    const html = renderToStaticMarkup(<WorkspaceView />);
    expect(html).toMatch(/<strong>Analysis:<\/strong> Failed/);
    expect(html).toContain('Jump to results');
    expect(html).toContain('Invalid request');
  });

  it('drops an older failed experiment once a later check has reported', () => {
    const failed: Run = { ...active('experiment'), state: 'failed', startedAt: 1_000, finishedAt: 2_000, error: 'The local service could not be reached.' };
    const done: Run = {
      ...active('analysis'),
      state: 'completed',
      startedAt: 3_000,
      finishedAt: 4_000,
      report: { kind: 'analysis', claims: [], provenance: { checker: 'lean' } } as unknown as Run['report'],
    };
    setState({ runs: { [failed.key]: failed, [done.key]: done }, current: { experiment: failed.key, analysis: done.key } });
    const html = renderToStaticMarkup(<WorkspaceView />);
    expect(html).not.toContain('<strong>Experiment (quick):</strong>');
    expect(html).not.toContain('See why on Experiments');
  });

  it('drops a job that ended without a report once the inputs have changed', () => {
    const r: Run = { ...active('experiment'), state: 'failed', finishedAt: Date.now(), error: 'The local service could not be reached.' };
    setState({ design: aesDesign(6), runs: { [r.key]: r }, current: { experiment: r.key } });
    expect(renderToStaticMarkup(<WorkspaceView />)).not.toContain('<strong>Experiment (quick):</strong>');
  });

  it('shows no run status once a job has completed', () => {
    const r: Run = { ...active('experiment'), state: 'completed', finishedAt: Date.now() };
    setState({ runs: { [r.key]: r }, current: { experiment: r.key } });
    expect(renderToStaticMarkup(<WorkspaceView />)).not.toContain('<strong>Experiment (quick):</strong>');
  });
});
