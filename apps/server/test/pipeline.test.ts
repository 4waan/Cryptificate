import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AnalysisReport, AnalysisRequest, Claim } from '@cryptificate/schema';
import { ANALYSIS_STEPS, runAnalysis } from '../src/analysis.js';
import { buildBundle } from '../src/bundle.js';
import { JobContext } from '../src/context.js';
import type { PipelineEnv } from '../src/context.js';
import { readTarGz } from '../src/tar.js';
import { verifyBundle } from '../src/verify.js';
import { AES_DESIGN, IDENTITY_DESIGN, IDENTITY_PROGRAM, makeFixture } from './helpers.js';

/** A killed process may linger as a zombie when nothing reaps orphans (containers). */
function alive(pid: number): boolean {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2, stat.lastIndexOf(')') + 3) !== 'Z';
  } catch {
    try {
      process.kill(pid, 0);
      return process.platform !== 'linux';
    } catch {
      return false;
    }
  }
}

let counter = 0;
async function analyze(env: PipelineEnv, request: AnalysisRequest, budgetMs = 60_000, signal?: AbortSignal) {
  const id = `${(++counter).toString(16).padStart(32, '0')}`;
  const ctx = new JobContext(id, join(env.paths.jobsDir, id), signal ?? new AbortController().signal, budgetMs, ANALYSIS_STEPS);
  const result = await runAnalysis(env, ctx, request);
  return { result, ctx, report: result.report as AnalysisReport };
}

function claim(report: AnalysisReport, id: string): Claim {
  const c = report.claims.find((x) => x.id === id);
  assert.ok(c, `missing claim ${id}`);
  return c;
}

test('AES design: Lean-accepted claims are proved, with provenance', async () => {
  const { root, env } = makeFixture();
  try {
    const { result, report } = await analyze(env, { design: AES_DESIGN });
    assert.equal(result.state, 'completed');
    assert.equal(report.provenance.origin, 'live');
    assert.match(report.provenance.leanSourceSha256 ?? '', /^[0-9a-f]{64}$/);
    assert.equal(claim(report, 'matrix.mds').status, 'proved');
    assert.equal(claim(report, 'matrix.mds').evidence.label, 'Lean-checked proof');
    assert.deepEqual(claim(report, 'matrix.mds').evidence.axioms, ['propext', 'Quot.sound']);
    assert.equal(claim(report, 'activity.bound').status, 'proved');
    assert.equal(claim(report, 'activity.bound').title, 'At least 25 active S-boxes over 4 rounds');
    assert.equal(claim(report, 'circuit.equivalence').status, 'not_established');
    assert.equal(claim(report, 'native.timing').status, 'not_established');
    assert.equal(claim(report, 'rust.refinement').status, 'unsupported');
    assert.ok(report.execution.steps.some((s) => s.name === 'lean' && s.state === 'completed'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('identity matrix: MDS refuted with a witness, activity not established, circuit proved', async () => {
  const { root, env } = makeFixture();
  try {
    const { report } = await analyze(env, { design: IDENTITY_DESIGN, program: IDENTITY_PROGRAM });
    const mds = claim(report, 'matrix.mds');
    assert.equal(mds.status, 'refuted');
    assert.equal(mds.evidence.label, 'Lean-checked counterexample');
    assert.equal(mds.witness?.kind, 'branch');
    const act = claim(report, 'activity.bound');
    assert.equal(act.status, 'not_established');
    assert.equal(act.reason, 'precondition-failed');
    assert.equal(claim(report, 'circuit.equivalence').status, 'proved');
    assert.equal(claim(report, 'circuit.equivalence').evidence.label, 'Lean-checked circuit equivalence');
    assert.equal(claim(report, 'native.correctness').reason, 'native-unavailable');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('sorryAx in the audit leaves the claim not established', async () => {
  const { root, env } = makeFixture();
  try {
    const { report } = await analyze(env, { design: { ...AES_DESIGN, rounds: 30 } });
    const mds = claim(report, 'matrix.mds');
    assert.equal(mds.status, 'not_established');
    assert.equal(mds.reason, 'audit-forbidden-axiom');
    // the bound depends on MDS, so it is not established either (never refuted)
    assert.equal(claim(report, 'activity.bound').status, 'not_established');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a Lean timeout is not a refutation and kills the process group', async () => {
  const { root, env } = makeFixture({ leanTimeoutMs: 1500 });
  try {
    const t0 = Date.now();
    const { result, report } = await analyze(env, { design: { ...IDENTITY_DESIGN, rounds: 31 } });
    assert.ok(Date.now() - t0 < 15_000);
    assert.equal(result.state, 'timeout');
    for (const c of report.claims.filter((x) => x.chain === 'design')) {
      assert.notEqual(c.status, 'refuted', c.id);
      assert.notEqual(c.status, 'proved', c.id);
    }
    assert.equal(claim(report, 'matrix.mds').reason, 'lean-timeout');
    assert.match(readFileSync(join(env.paths.jobsDir, report.id, 'lean', 'audit.txt'), 'utf8'), /wall-clock limit/);
    // the grandchild started by the fake Lean is gone too
    const pid = Number(readFileSync(join(env.paths.jobsDir, report.id, 'lean', 'Cert.lean.child-pid'), 'utf8'));
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(alive(pid), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('invalid input reported by the engine ends the job as invalid', async () => {
  const { root, env } = makeFixture();
  try {
    const { result } = await analyze(env, { design: { ...AES_DESIGN, rounds: 5 } });
    assert.equal(result.state, 'invalid');
    assert.equal(result.error?.path, '/design/rounds');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('without Lean or the engine nothing is claimed', async () => {
  const noLake = makeFixture({ noLake: true });
  const noEngine = makeFixture({ noEngine: true });
  try {
    const a = await analyze(noLake.env, { design: AES_DESIGN });
    assert.equal(a.result.state, 'failed');
    assert.ok(a.report.claims.every((c) => c.status === 'not_established' || c.status === 'unsupported'));
    assert.equal(claim(a.report, 'matrix.mds').reason, 'lean-unavailable');
    const b = await analyze(noEngine.env, { design: AES_DESIGN });
    assert.equal(b.result.state, 'failed');
    assert.ok(b.report.claims.every((c) => c.status === 'not_established'));
    assert.equal(claim(b.report, 'matrix.mds').reason, 'engine-unavailable');
  } finally {
    rmSync(noLake.root, { recursive: true, force: true });
    rmSync(noEngine.root, { recursive: true, force: true });
  }
});

test('proof cache: a repeated analysis is served as cached and says so', async () => {
  const { root, env } = makeFixture();
  try {
    const first = await analyze(env, { design: AES_DESIGN });
    const second = await analyze(env, { design: AES_DESIGN });
    assert.equal(second.report.provenance.origin, 'cached');
    assert.equal(second.report.provenance.cachedFrom, first.report.id);
    assert.equal(second.report.provenance.cacheKey, first.report.provenance.cacheKey);
    assert.ok(second.report.execution.steps.some((s) => s.name === 'lean' && s.state === 'skipped' && /cache/.test(s.detail ?? '')));
    assert.deepEqual(
      second.report.claims.map((c) => [c.id, c.status]),
      first.report.claims.map((c) => [c.id, c.status]),
    );
    // a changed template invalidates the cache
    writeFileSync(join(env.paths.templatesDir, 'header.lean'), 'import Cryptificate\n-- changed\n');
    const third = await analyze(env, { design: AES_DESIGN });
    assert.equal(third.report.provenance.origin, 'live');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('verify re-derives the claims of a bundle and detects tampering', async () => {
  const { root, env } = makeFixture();
  try {
    const { report } = await analyze(env, { design: IDENTITY_DESIGN, program: IDENTITY_PROGRAM });
    const tc = await env.toolchain();
    const dir = join(env.paths.jobsDir, report.id);
    const bundlePath = join(root, 'bundle.tar.gz');
    writeFileSync(bundlePath, buildBundle({ jobDir: dir, report, toolchain: tc, paths: env.paths }));
    const files = readTarGz(readFileSync(bundlePath));
    assert.ok(files.has('lean/Cert.lean') && files.has('VERIFY.md') && files.has('toolchain.json'));
    const ok = await verifyBundle(env, bundlePath);
    assert.equal(ok.ok, true, JSON.stringify(ok.rows));
    assert.ok(ok.rows.some((r) => r.claim === 'matrix.mds' && r.result === 'match'));

    // a bundle that claims MDS was proved for the identity matrix does not verify
    const forged: AnalysisReport = JSON.parse(JSON.stringify(report));
    forged.claims.find((c) => c.id === 'matrix.mds')!.status = 'proved';
    const forgedPath = join(root, 'forged.tar.gz');
    writeFileSync(forgedPath, buildBundle({ jobDir: dir, report: forged, toolchain: tc, paths: env.paths }));
    const bad = await verifyBundle(env, forgedPath);
    assert.equal(bad.ok, false);
    assert.ok(bad.rows.some((r) => r.claim === 'matrix.mds' && r.result === 'mismatch'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
