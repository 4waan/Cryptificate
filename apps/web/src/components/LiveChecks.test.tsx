import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { aesDesign, aesSharedSum } from '../lib/presets';
import type { AnalysisReport } from '../lib/types';
import { initialState, setState, type Run } from '../state/store';
import { LiveChecks, PREVIEW_LABEL, checkRows, currentReport, previewItems } from './LiveChecks';
import { ResultsPanel } from './ResultsPanel';

const recorded = JSON.parse(
  readFileSync(new URL('../../public/recorded/aes-shared-sum/report.json', import.meta.url), 'utf8'),
) as AnalysisReport;

const inputs = { design: aesDesign(), program: aesSharedSum(), target: 'matrix' as const };

function run(patch: Partial<Run> = {}): Run {
  return { key: 'run-1', kind: 'analysis', inputs, source: 'live', state: 'completed', steps: [], report: recorded, ...patch };
}

describe('instant checks', () => {
  beforeEach(() => setState(initialState()));

  it('labels browser diagnostics as a preview, never with a proof status', () => {
    const html = renderToStaticMarkup(<LiveChecks items={previewItems(inputs)} report={null} problems={0} />);
    expect(html).toContain(PREVIEW_LABEL);
    expect(html).toContain('status-preview');
    expect(html).not.toMatch(/status-(proved|refuted|not_established)/);
    expect(html).toContain('MDS');
    expect(html).toContain('Circuit = matrix');
    expect((html.match(/data-source="preview"/g) ?? []).length).toBe(5);
  });

  it('shows the Lean result instead, once one exists for exactly these inputs', () => {
    const report = currentReport(run(), inputs);
    expect(report).not.toBeNull();
    const html = renderToStaticMarkup(<LiveChecks items={previewItems(inputs)} report={report} problems={0} />);
    expect(html).toContain('Checked by Lean');
    expect(html).not.toContain(PREVIEW_LABEL);
    expect(html).toContain('status-proved');
    expect(html).not.toContain('data-source="preview"');
  });

  it('ignores a report for other inputs (stale by digest), and recordings that were not found', () => {
    const other = { ...inputs, design: { ...aesDesign(), rounds: 6 } };
    expect(currentReport(run(), other)).toBeNull();
    expect(currentReport(run({ state: 'unavailable' }), inputs)).toBeNull();
    expect(currentReport(undefined, inputs)).toBeNull();
    const rows = checkRows(previewItems(other), currentReport(run(), other));
    expect(rows.every((r) => r.preview && !r.claim)).toBe(true);
  });

  it('asks for fixes instead of showing checks while the inputs have problems', () => {
    const html = renderToStaticMarkup(<LiveChecks items={[]} report={null} problems={2} />);
    expect(html).toContain('Fix the input problems');
    expect(html).not.toContain('status-');
  });
});

describe('ResultsPanel live preview', () => {
  beforeEach(() => setState(initialState()));

  it('shows the labelled preview and a check button before any run', () => {
    const html = renderToStaticMarkup(<ResultsPanel run={undefined} inputs={inputs} source="live" />);
    expect(html).toContain(`${PREVIEW_LABEL}.`);
    expect(html).toContain('Check with Lean');
    expect(html).toContain('Unchecked diagnostic');
    expect(html).not.toMatch(/status-(proved|refuted)/);
  });

  it('keeps the preview while Lean runs and replaces it with the Lean result', () => {
    const running = renderToStaticMarkup(
      <ResultsPanel run={run({ state: 'running', report: null, startedAt: 0 })} inputs={inputs} source="live" />,
    );
    expect(running).toContain('data-live-preview');
    expect(running).toContain('replaces it when it arrives');
    const done = renderToStaticMarkup(<ResultsPanel run={run()} inputs={inputs} source="live" />);
    expect(done).not.toContain('data-live-preview');
    expect(done).toContain('status-proved');
  });

  it('shows the preview for edited inputs above results from an earlier version', () => {
    const edited = { ...inputs, design: { ...aesDesign(), rounds: 6 } };
    const html = renderToStaticMarkup(<ResultsPanel run={run()} inputs={edited} source="live" />);
    expect(html).toContain('earlier version');
    expect(html).toContain('data-live-preview');
    expect(html.indexOf('data-live-preview')).toBeLessThan(html.indexOf('From an earlier version'));
  });
});
