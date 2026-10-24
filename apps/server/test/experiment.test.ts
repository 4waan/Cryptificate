import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { ExperimentReport, ExperimentRequest } from '@cryptificate/schema';
import { JobContext } from '../src/context.js';
import type { PipelineEnv } from '../src/context.js';
import { aesSharedSumProgram, decideVerdict as decide, directProgram, EXPERIMENT_STEPS, runExperiment } from '../src/experiment.js';
import { AES_DESIGN, IDENTITY_PROGRAM, makeFixture } from './helpers.js';

let n = 0;
async function experiment(env: PipelineEnv, request: ExperimentRequest, budgetMs = 60_000) {
  const id = `e${(++n).toString(16).padStart(31, '0')}`;
  const ctx = new JobContext(id, join(env.paths.jobsDir, id), new AbortController().signal, budgetMs, EXPERIMENT_STEPS);
  const result = await runExperiment(env, ctx, request);
  return { result, report: result.report as ExperimentReport, dir: ctx.dir };
}

test('experiment: search, shortlist, baselines and user circuit are each checked by Lean', async () => {
  const { root, env } = makeFixture();
  try {
    const { result, report, dir } = await experiment(env, { design: AES_DESIGN, program: IDENTITY_PROGRAM, profile: 'quick', seed: 'c0ffee' });
    assert.equal(result.state, 'completed');
    assert.deepEqual(report.candidates.map((c) => [c.id, c.origin]), [
      ['c1', 'search'],
      ['baseline-direct', 'baseline-direct'],
      ['user', 'user'],
    ]);
    assert.ok(report.candidates.every((c) => c.equivalence.status === 'proved'));
    assert.equal(report.search?.seed, 'c0ffee');
    assert.deepEqual(report.search?.shortlist, ['c1']);
    assert.equal(report.search?.history.length, 2);
    assert.equal(report.measurements, null);
    const names = report.checkpoints.map((c) => `${c.name}:${c.state}`);
    assert.ok(names.includes('search:completed') && names.includes('equivalence:completed'));
    assert.ok(names.includes('native-correctness:skipped'));
    assert.ok(existsSync(join(dir, 'lean', 'c1', 'Cert.lean')) && existsSync(join(dir, 'search', 'history.json')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('experiment: budget expiry keeps completed checkpoints and marks the rest not run', async () => {
  const { root, env } = makeFixture();
  try {
    const t0 = Date.now();
    const { result, report } = await experiment(env, { design: { ...AES_DESIGN, rounds: 31 }, profile: 'quick' }, 2500);
    assert.ok(Date.now() - t0 < 20_000);
    assert.equal(result.state, 'timeout');
    const state = (name: string) => report.checkpoints.find((c) => c.name === name)?.state;
    assert.equal(state('validate'), 'completed');
    assert.equal(state('search'), 'completed');
    assert.equal(state('native-correctness'), 'not_run');
    assert.equal(state('benchmark-1'), 'not_run');
    assert.ok(report.candidates.every((c) => c.equivalence.status === 'not_established'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('baseline circuits compute their matrices', () => {
  const xt = (a: number): number => ((a << 1) ^ (a & 0x80 ? 0x11b : 0)) & 0xff;
  const mul = (k: number, a: number): number => {
    let r = 0;
    for (let i = 0; i < 8; i++) if ((k >> i) & 1) r ^= [...Array(i)].reduce((x: number) => xt(x), a);
    return r;
  };
  const evalGf = (p: ReturnType<typeof directProgram>, x: number[]): number[] => {
    const regs = [...x];
    for (const ins of p.instructions) regs.push(ins.op === 'add' ? regs[ins.a]! ^ regs[ins.b]! : mul(parseInt(ins.k, 16), regs[ins.a]!));
    return p.outputs.map((o) => regs[o]!);
  };
  const known = aesSharedSumProgram();
  assert.equal(known.instructions.filter((i) => i.op === 'add').length, 15);
  assert.equal(known.instructions.filter((i) => i.op === 'mul').length, 4);
  assert.deepEqual(evalGf(known, [0x01, 0, 0, 0]), [0x02, 0x01, 0x01, 0x03]);
  assert.deepEqual(evalGf(known, [0x80, 0, 0, 0]), [0x1b, 0x80, 0x80, 0x9b]);
  const direct = directProgram('gf256', AES_DESIGN.matrix);
  for (const v of [[1, 0, 0, 0], [0x80, 0, 0, 0], [0x12, 0x34, 0x56, 0x78]]) assert.deepEqual(evalGf(direct, v), evalGf(known, v));
});

test('verdict: confirmed only when both confirmation sessions clear the threshold', () => {
  const cmp = (session: number, lo: number, ratio = 1.1) => ({ candidate: 'c1', baseline: 'baseline-known', ratio, ci95: [lo, ratio + 0.05] as [number, number], session });
  const eligible = new Set(['c1']);
  const ok = [1, 2, 3].map((session) => ({ session, checksumsAgree: true, samplesConsistent: true }));
  const decideVerdict = (c: Parameters<typeof decide>[0], e: Parameters<typeof decide>[1], s = ok) => decide(c, e, s);
  assert.equal(decideVerdict([cmp(1, 1.05), cmp(2, 1.05), cmp(3, 1.03)], eligible), 'locally confirmed');
  assert.equal(decideVerdict([cmp(1, 1.05), cmp(2, 1.05), cmp(3, 1.01)], eligible), 'inconclusive');
  assert.equal(decideVerdict([cmp(1, 1.05), cmp(2, 1.05)], eligible), 'inconclusive');
  assert.equal(decideVerdict([cmp(1, 0.9, 0.95), cmp(2, 0.9, 0.97), cmp(3, 0.9, 0.99)], eligible), 'no improvement');
  assert.equal(decideVerdict([cmp(2, 1.5), cmp(3, 1.5)], new Set()), 'inconclusive');
  // every baseline counts
  const vsDirect = (session: number, lo: number) => ({ ...cmp(session, lo), baseline: 'baseline-direct' });
  assert.equal(decideVerdict([cmp(2, 1.05), cmp(3, 1.05), vsDirect(2, 1.5), vsDirect(3, 1.01)], eligible), 'inconclusive');
  assert.equal(decideVerdict([cmp(2, 1.05), cmp(3, 1.05), vsDirect(2, 1.5), vsDirect(3, 1.5)], eligible), 'locally confirmed');
});

test('verdict: no speed-up is confirmed unless every session reports matching outputs', () => {
  const cmp = (session: number) => ({ candidate: 'c1', baseline: 'baseline-known', ratio: 1.5, ci95: [1.4, 1.6] as [number, number], session });
  const all = [cmp(1), cmp(2), cmp(3)];
  const eligible = new Set(['c1']);
  const sessions = (patch: Partial<{ session: number; checksumsAgree: boolean | null; samplesConsistent: boolean | null }>) =>
    [1, 2, 3].map((session) => ({ session, checksumsAgree: true as boolean | null, samplesConsistent: true as boolean | null, ...(session === (patch.session ?? 3) ? patch : {}) }));
  assert.equal(decide(all, eligible, sessions({})), 'locally confirmed');
  assert.equal(decide(all, eligible, sessions({ checksumsAgree: false })), 'inconclusive');
  assert.equal(decide(all, eligible, sessions({ session: 1, samplesConsistent: false })), 'inconclusive');
  assert.equal(decide(all, eligible, sessions({ checksumsAgree: null })), 'inconclusive');
  assert.equal(decide(all, eligible, sessions({}).slice(0, 2)), 'inconclusive');
  const slower = all.map((c) => ({ ...c, ratio: 0.8, ci95: [0.7, 0.9] as [number, number] }));
  assert.equal(decide(slower, eligible, sessions({ checksumsAgree: false })), 'inconclusive');
});

test('experiment with a native backend: correctness, three sessions, frozen contender, verdict', async () => {
  const { readTarGz } = await import('../src/tar.js');
  const { buildBundle } = await import('../src/bundle.js');
  const { root, env } = makeFixture({ native: true });
  try {
    const { result, report, dir } = await experiment(env, { design: AES_DESIGN, profile: 'quick', seed: 'c0ffee' });
    assert.equal(result.state, 'completed');
    assert.ok(report.candidates.every((c) => c.native?.passed && c.native.cases === 9214));
    const m = report.measurements!;
    assert.equal(m.machine.rustc, 'rustc 1.97.0 (2d8144b78)');
    assert.deepEqual([...new Set(m.comparisons.map((c) => c.session))], [1, 2, 3]);
    assert.ok(m.comparisons.filter((c) => c.session > 1).every((c) => c.candidate === 'c1'));
    assert.equal(m.verdict, 'locally confirmed');
    assert.deepEqual(m.sessions, [1, 2, 3].map((session) => ({ session, checksumsAgree: true, samplesConsistent: true })));
    const steps = report.checkpoints.map((c) => `${c.name}:${c.state}`);
    for (const n of [1, 2, 3]) assert.ok(steps.includes(`benchmark-${n}:completed`), steps.join(' '));
    const tc = await env.toolchain();
    const files = readTarGz(buildBundle({ jobDir: dir, report, toolchain: tc, paths: env.paths }));
    assert.ok(files.has('native/variants/c1/src/lib.rs') && files.has('native/correctness.json') && files.has('native/measurements/benchmark-3.json'));
    for (const [name, data] of files) assert.ok(!/\d{4}-\d{2}-\d{2}/.test(data.toString('utf8')), `${name} has a date`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('analysis with a native backend reports native correctness as tested, not proved by Lean', async () => {
  const { runAnalysis, ANALYSIS_STEPS } = await import('../src/analysis.js');
  const { root, env } = makeFixture({ native: true });
  try {
    const ctx = new JobContext('a'.repeat(32), join(env.paths.jobsDir, 'a'.repeat(32)), new AbortController().signal, 60_000, ANALYSIS_STEPS);
    const r = await runAnalysis(env, ctx, { design: AES_DESIGN, program: IDENTITY_PROGRAM });
    const native = (r.report as import('@cryptificate/schema').AnalysisReport).claims.find((c) => c.id === 'native.correctness')!;
    assert.equal(native.status, 'proved');
    assert.equal(native.evidence.kind, 'native');
    assert.equal(native.evidence.label, 'Generated Rust passed 9214 correctness cases');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
