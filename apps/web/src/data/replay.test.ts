import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aesDesign, aesSharedSum, identityDesign, identityProgram, miswiredSharedSum } from '../lib/presets';
import type { AnalysisReport } from '../lib/types';

function report(design = aesDesign(), program = aesSharedSum()): AnalysisReport {
  return {
    kind: 'analysis',
    id: 'r1',
    inputDigest: 'sha256:0',
    inputs: { design, program, target: 'matrix' },
    claims: [],
    execution: { state: 'completed', steps: [] },
    provenance: {
      origin: 'recorded',
      checker: 'cryptificate',
      toolchain: { lean: 'v4.33.1', mathlib: '', widetrail: '', rustc: '' },
    },
  };
}

describe('recorded runs', () => {
  beforeEach(() => {
    vi.resetModules();
    const files: Record<string, unknown> = {
      'recorded/index.json': {
        version: 1,
        entries: [
          { id: 'identity', kind: 'analysis', report: 'identity/report.json' },
          { id: 'wrong-wire', kind: 'analysis', report: 'wrong-wire/report.json', bundle: 'wrong-wire/bundle.tar.gz' },
        ],
      },
      'recorded/identity/report.json': report(identityDesign(), identityProgram()),
      'recorded/wrong-wire/report.json': report(aesDesign(), miswiredSharedSum()),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const key = Object.keys(files).find((k) => url.endsWith(k));
        return key ? { ok: true, json: async () => files[key] } : { ok: false, json: async () => ({}) };
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('finds the recording whose inputs equal the workspace, ignoring names and hex case', async () => {
    const { findRecording } = await import('./replay');
    const design = aesDesign();
    design.matrix = design.matrix.map((r) => r.map((x) => x.toLowerCase()));
    const match = await findRecording('analysis', { design, program: { ...miswiredSharedSum(), name: 'mine' } });
    expect(match?.entry.id).toBe('wrong-wire');
    expect(match?.entry.bundle).toBe('wrong-wire/bundle.tar.gz');
  });

  it('returns nothing for edited inputs or another kind', async () => {
    const { findRecording } = await import('./replay');
    expect(await findRecording('analysis', { design: aesDesign(), program: aesSharedSum() })).toBeNull();
    expect(await findRecording('experiment', { design: identityDesign(), program: identityProgram() })).toBeNull();
  });

  it('treats a missing index as no recordings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => ({}) })),
    );
    const { loadIndex } = await import('./replay');
    expect(await loadIndex()).toEqual({ version: 1, entries: [] });
  });
});

describe('job responses', () => {
  it('reads steps and report from the job document', async () => {
    const { parseJob } = await import('./api');
    const job = parseJob({
      id: 'a'.repeat(32),
      kind: 'analysis',
      state: 'running',
      origin: 'live',
      steps: [{ name: 'lean', state: 'running' }],
      report: null,
      bundle: false,
      queuePosition: 2,
    });
    expect(job.steps).toEqual([{ name: 'lean', state: 'running' }]);
    expect(job.queuePosition).toBe(2);
    expect(job.bundle).toBe(false);
  });
});
