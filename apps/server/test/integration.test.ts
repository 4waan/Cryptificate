/**
 * The story examples against the real engine and Lean checker. Opt-in
 * (CRYPTIFICATE_INTEGRATION=1) because it needs a built engine and the
 * trusted Lean library, and takes a few seconds per certificate.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AnalysisReport, AnalysisRequest, Claim } from '@cryptificate/schema';
import { ANALYSIS_STEPS, runAnalysis } from '../src/analysis.js';
import { buildBundle } from '../src/bundle.js';
import { JobContext } from '../src/context.js';
import { makeEnv } from '../src/env.js';
import { verifyBundle } from '../src/verify.js';

const enabled = process.env['CRYPTIFICATE_INTEGRATION'] === '1';
const env = makeEnv();
const skip = !enabled ? 'set CRYPTIFICATE_INTEGRATION=1' : !env.engine.available ? 'engine not built' : !env.lake ? 'lake not found' : false;

function example(kind: 'designs' | 'programs', name: string): unknown {
  return JSON.parse(readFileSync(join(env.paths.root, 'examples', kind, `${name}.json`), 'utf8')) as unknown;
}

async function analyze(design: string, program?: string): Promise<AnalysisReport> {
  const home = mkdtempSync(join(tmpdir(), 'cryptificate-it-'));
  try {
    const req = { design: example('designs', design), ...(program ? { program: example('programs', program) } : {}) } as AnalysisRequest;
    const ctx = new JobContext('0'.repeat(32), join(home, 'job'), new AbortController().signal, 300_000, ANALYSIS_STEPS);
    const result = await runAnalysis({ ...env, noCache: true }, ctx, req);
    assert.equal(result.state, 'completed', JSON.stringify(result.error ?? ctx.steps));
    return result.report as AnalysisReport;
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

function status(r: AnalysisReport, id: string): Claim {
  const c = r.claims.find((x) => x.id === id);
  assert.ok(c, id);
  return c;
}

test('story 1: AES with the known shared-sum circuit', { skip }, async () => {
  const r = await analyze('aes', 'aes-known-shared-sum');
  for (const id of ['matrix.mds', 'offsets.dispersion', 'sbox.bijective', 'activity.bound', 'circuit.equivalence']) {
    assert.equal(status(r, id).status, 'proved', id);
  }
  assert.equal(status(r, 'sbox.differential').title, 'Differential uniformity of the S-box table is 4');
  assert.equal(status(r, 'sbox.linearity').title, 'Linearity of the S-box table is 32');
});

test('story 2: one wire goes wrong', { skip }, async () => {
  const r = await analyze('aes', 'aes-wrong-wire');
  const eq = status(r, 'circuit.equivalence');
  assert.equal(eq.status, 'refuted');
  assert.equal(eq.evidence.label, 'Lean-checked counterexample');
  assert.deepEqual(eq.witness && eq.witness.kind === 'distinguishing-input' ? [eq.witness.input, eq.witness.expected, eq.witness.actual] : null, [
    ['00', '01', '00', '00'],
    ['03', '02', '01', '01'],
    ['01', '02', '01', '01'],
  ]);
});

test('story 3: perfect implementation, weak diffusion', { skip }, async () => {
  const r = await analyze('identity', 'identity');
  assert.equal(status(r, 'circuit.equivalence').status, 'proved');
  const mds = status(r, 'matrix.mds');
  assert.equal(mds.status, 'refuted');
  assert.deepEqual(mds.witness && mds.witness.kind === 'branch' ? mds.witness.input : null, ['01', '00', '00', '00']);
  assert.equal(status(r, 'activity.bound').status, 'not_established');
});

test('story 4: prime field, exponent 5 accepted and 3 rejected', { skip }, async () => {
  const ok = await analyze('poseidon2-bn254', 'poseidon2-external-shared-sum');
  assert.equal(status(ok, 'circuit.equivalence').status, 'proved');
  assert.equal(status(ok, 'sbox.bijective').status, 'proved');
  const bad = await analyze('poseidon2-exponent3');
  assert.equal(status(bad, 'sbox.bijective').status, 'refuted');
  assert.equal(status(bad, 'sbox.bijective').witness?.kind, 'power-collision');
});

test('fresh input: row-scaled AES is certified MDS', { skip }, async () => {
  const r = await analyze('aes-row-scaled');
  assert.equal(status(r, 'matrix.mds').status, 'proved');
});

test('partial rounds: 34 for the reference, a checked bypass for the external matrix reused inside', { skip }, async () => {
  const ref = await analyze('poseidon2-bn254');
  assert.equal(status(ref, 'activity.partial').status, 'proved');
  const total = status(ref, 'activity.total');
  assert.equal(total.status, 'proved');
  assert.equal(total.title, 'At least 34 active S-boxes over all 64 rounds');
  const bad = await analyze('poseidon2-bypass');
  assert.equal(status(bad, 'activity.outer').status, 'proved');
  const partial = status(bad, 'activity.partial');
  assert.equal(partial.status, 'refuted');
  assert.equal(partial.evidence.label, 'Lean-checked counterexample');
  assert.deepEqual(partial.witness?.kind === 'partial-bypass' ? partial.witness.difference : null, [
    '0',
    '1',
    '21888242871839275222246405745257275088548364400416034343698204186575808495616',
  ]);
  assert.equal(status(bad, 'activity.total').status, 'not_established');
});

test('prime fields: KoalaBear and BabyBear at width four, and a deliberately bad design', { skip }, async () => {
  for (const [name, total] of [
    ['koalabear-t4', 'At least 25 active S-boxes over all 28 rounds'],
    ['babybear-t4', 'At least 23 active S-boxes over all 21 rounds'],
  ] as const) {
    const r = await analyze(name);
    for (const id of ['field.prime', 'external.mds', 'internal.invertible', 'sbox.bijective', 'activity.outer', 'activity.partial', 'activity.total']) {
      assert.equal(status(r, id).status, 'proved', `${name} ${id}`);
    }
    assert.equal(status(r, 'field.prime').evidence.theorem, 'CryptificateJob.field_prime');
    assert.equal(status(r, 'external.mds').title, 'External matrix is MDS (branch number 5)');
    assert.equal(status(r, 'activity.outer').title, 'At least 20 active S-boxes in the 8 full rounds');
    assert.equal(status(r, 'activity.total').title, total);
  }
  const bad = await analyze('babybear-t4-bad');
  assert.equal(status(bad, 'field.prime').status, 'proved');
  const sbox = status(bad, 'sbox.bijective');
  assert.equal(sbox.status, 'refuted');
  assert.equal(sbox.witness?.kind === 'power-collision' ? sbox.witness.x2 : null, '1314723123');
  const partial = status(bad, 'activity.partial');
  assert.equal(partial.status, 'refuted');
  assert.deepEqual(partial.witness?.kind === 'partial-bypass' ? partial.witness.difference : null, ['0', '1', '2013265920', '0']);
  assert.equal(status(bad, 'activity.outer').reason, 'precondition-failed');
});

test('prime fields: Poseidon2 widths 16 and 8 and the wide refutations', { skip }, async () => {
  const kb = await analyze('koalabear-t16');
  for (const id of ['field.prime', 'external.m4_mds', 'external.invertible', 'internal.invertible', 'sbox.bijective', 'activity.partial']) {
    assert.equal(status(kb, id).status, 'proved', `koalabear-t16 ${id}`);
  }
  const mds = status(kb, 'external.mds');
  assert.equal(mds.status, 'refuted');
  assert.equal(mds.title, 'External matrix is MDS (branch number 17)');
  assert.equal(mds.witness?.kind === 'branch' ? mds.witness.inputWeight : null, 2);
  for (const id of ['activity.outer', 'activity.total']) assert.equal(status(kb, id).status, 'not_established', id);
  const bb = await analyze('babybear-t16');
  assert.equal(status(bb, 'activity.partial').status, 'refuted');
  const bad = await analyze('babybear-t8-bad');
  for (const id of ['external.mds', 'external.m4_mds', 'external.invertible', 'internal.invertible', 'activity.partial']) {
    assert.equal(status(bad, id).status, 'refuted', `babybear-t8-bad ${id}`);
  }
});

test('verify: a KoalaBear bundle re-checks claim by claim', { skip }, async () => {
  const home = mkdtempSync(join(tmpdir(), 'cryptificate-it-'));
  try {
    const req = { design: example('designs', 'koalabear-t4') } as AnalysisRequest;
    const jobDir = join(home, 'job');
    const ctx = new JobContext('2'.repeat(32), jobDir, new AbortController().signal, 300_000, ANALYSIS_STEPS);
    const result = await runAnalysis({ ...env, noCache: true }, ctx, req);
    assert.equal(result.state, 'completed', JSON.stringify(result.error ?? ctx.steps));
    const report = result.report as AnalysisReport;
    const bundlePath = join(home, 'koalabear.tar.gz');
    writeFileSync(bundlePath, buildBundle({ jobDir, report, toolchain: await env.toolchain(), paths: env.paths }));
    const v = await verifyBundle({ ...env, paths: { ...env.paths, home: join(home, 'verify') } }, bundlePath);
    assert.equal(v.ok, true, JSON.stringify(v.rows));
    assert.ok(v.rows.some((r) => r.claim === 'field.prime' && r.result === 'match'), JSON.stringify(v.rows));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('partial rounds: none at all is out of scope, not a bypass', { skip }, async () => {
  const home = mkdtempSync(join(tmpdir(), 'cryptificate-it-'));
  try {
    const design = { ...(example('designs', 'poseidon2-bn254') as Record<string, unknown>), partialRounds: 0 };
    const ctx = new JobContext('0'.repeat(32), join(home, 'job'), new AbortController().signal, 300_000, ANALYSIS_STEPS);
    const result = await runAnalysis({ ...env, noCache: true }, ctx, { design } as AnalysisRequest);
    assert.equal(result.state, 'completed', JSON.stringify(result.error ?? ctx.steps));
    const r = result.report as AnalysisReport;
    assert.equal(status(r, 'activity.outer').status, 'proved');
    const partial = status(r, 'activity.partial');
    assert.equal(partial.status, 'not_established');
    assert.equal(partial.reason, 'out-of-scope');
    assert.equal(partial.witness, null);
    assert.equal(status(r, 'activity.total').status, 'not_established');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('verify: a current bundle that drops the refuted bypass does not verify', { skip }, async () => {
  const home = mkdtempSync(join(tmpdir(), 'cryptificate-it-'));
  try {
    const req = { design: example('designs', 'poseidon2-bypass') } as AnalysisRequest;
    const jobDir = join(home, 'job');
    const ctx = new JobContext('1'.repeat(32), jobDir, new AbortController().signal, 300_000, ANALYSIS_STEPS);
    const result = await runAnalysis({ ...env, noCache: true }, ctx, req);
    assert.equal(result.state, 'completed', JSON.stringify(result.error ?? ctx.steps));
    const report = result.report as AnalysisReport;
    assert.equal(status(report, 'activity.partial').status, 'refuted');
    const tc = await env.toolchain();
    const forged: AnalysisReport = { ...report, claims: report.claims.filter((c) => c.id !== 'activity.partial') };
    const bundlePath = join(home, 'forged.tar.gz');
    writeFileSync(bundlePath, buildBundle({ jobDir, report: forged, toolchain: tc, paths: env.paths }));
    const v = await verifyBundle({ ...env, paths: { ...env.paths, home: join(home, 'verify') } }, bundlePath);
    assert.equal(v.ok, false, JSON.stringify(v.rows));
    const row = v.rows.find((x) => x.claim === 'activity.partial');
    assert.equal(row?.recorded, 'missing');
    assert.equal(row?.result, 'mismatch');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
