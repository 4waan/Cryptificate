import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { renderReportHtml } from '@cryptificate/schema';
import { ExportReportButton } from '../components/ResultsPanel';
import type { Run } from '../state/store';
import type { AnalysisReport, ExperimentReport } from './types';
import { reportHtml, reportHtmlOptions } from './report';
import { aesDesign } from './presets';

function recorded<T>(name: string): T {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`../../public/recorded/${name}/report.json`, import.meta.url)), 'utf8')) as T;
}

function run(over: Partial<Run>): Run {
  return { key: 'k', kind: 'analysis', inputs: { design: aesDesign(), program: null, target: 'matrix' }, source: 'live', state: 'completed', steps: [], report: null, ...over };
}

describe('Export report', () => {
  it('uses the shared renderer: the same page as --format html and report.html', () => {
    const report = recorded<AnalysisReport>('aes-wrong-wire');
    const live = run({ jobId: 'f'.repeat(32) });
    expect(reportHtmlOptions(live, report)).toEqual({ bundleName: `cryptificate-${'f'.repeat(32)}.tar.gz` });
    expect(reportHtml(report, live)).toBe(renderReportHtml(report, { bundleName: `cryptificate-${'f'.repeat(32)}.tar.gz` }));
    const replay = run({ source: 'replay', recordingId: 'aes-wrong-wire' });
    const html = reportHtml(report, replay);
    expect(html).toContain('Cryptificate evidence report · recorded run aes-wrong-wire');
    expect(html).toContain('npx cryptificate verify aes-wrong-wire.tar.gz');
    expect(html).toContain(report.inputDigest);
    expect(html).not.toMatch(/<script|src=/i);
  });

  it('renders experiment reports too', () => {
    const report = recorded<ExperimentReport>('beat-the-reference');
    const html = reportHtml(report, run({ kind: 'experiment', source: 'replay', recordingId: 'beat-the-reference' }));
    expect(html).toContain('<title>Cryptificate evidence report: experiment');
    expect(html).toContain('95% interval');
  });

  it('offers the button only for a finished run', () => {
    const report = recorded<AnalysisReport>('identity');
    expect(renderToStaticMarkup(<ExportReportButton report={report} run={run({})} />)).toContain('Export report');
    for (const state of ['running', 'queued', 'submitting', 'unavailable'] as const) {
      expect(renderToStaticMarkup(<ExportReportButton report={report} run={run({ state })} />)).toBe('');
    }
    expect(renderToStaticMarkup(<ExportReportButton report={report} run={run({ state: 'timeout' })} />)).toContain('Export report');
  });
});
