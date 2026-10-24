import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { ExperimentReport, ExperimentRequest } from '@cryptificate/schema';
import { JobContext } from '../src/context.js';
import type { PipelineEnv } from '../src/context.js';
import { aesSharedSumProgram, decideVerdict, directProgram, EXPERIMENT_STEPS, runExperiment } from '../src/experiment.js';
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
