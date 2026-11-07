import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { aesDesign } from '../lib/presets';
import { initialState, setState, type Run } from '../state/store';
import { ExperimentsView } from './ExperimentsView';
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
});
