import { describe, expect, it } from 'vitest';
import type { AnalysisReport, ExperimentReport } from './types';
import { completionMessage, finishedMark, titleWithMark } from './signals';

describe('completion signals', () => {
  it('marks the tab title', () => {
    expect(titleWithMark('Workspace · Cryptificate', null)).toBe('Workspace · Cryptificate');
    expect(titleWithMark('Workspace · Cryptificate', 'done')).toBe('✓ Done · Workspace · Cryptificate');
    expect(titleWithMark('W', 'running')).toMatch(/Running · W$/);
    expect(titleWithMark('W', 'failed')).toBe('✕ Failed · W');
    expect(titleWithMark('W', 'timeout')).toBe('✕ Timed out · W');
    expect(titleWithMark('W', 'cancelled')).toBe('✕ Stopped · W');
    expect(titleWithMark('W', 'invalid')).toBe('✕ Rejected · W');
  });

  it('only a completed run counts as done; other ends are named, and only a stop reads Stopped', () => {
    expect(finishedMark('completed')).toBe('done');
    expect(finishedMark('failed')).toBe('failed');
    expect(finishedMark('timeout')).toBe('timeout');
    expect(finishedMark('cancelled')).toBe('cancelled');
    expect(finishedMark('invalid')).toBe('invalid');
    expect(finishedMark('something-new')).toBe('failed');
  });

  it('counts claims for a finished check', () => {
    const report = {
      kind: 'analysis',
      claims: [{ status: 'proved' }, { status: 'proved' }, { status: 'refuted' }, { status: 'not_established' }],
    } as unknown as AnalysisReport;
    expect(completionMessage('analysis', 'completed', report)).toEqual({
      title: 'Check finished',
      body: 'Claims: 2 proved, 1 refuted, 1 not established.',
    });
    const exp = { kind: 'experiment', candidates: [{}, {}] } as unknown as ExperimentReport;
    expect(completionMessage('experiment', 'completed', exp).body).toMatch(/^2 candidates/);
  });

  it('calls an execution outcome an outcome, never a refutation', () => {
    const m = completionMessage('analysis', 'timeout', null);
    expect(m.title).toBe('Check hit its time limit');
    expect(m.body).toMatch(/not a mathematical result/);
    expect(m.body).not.toMatch(/refuted/i);
  });
});
