/**
 * The story examples against the real engine and Lean checker. Opt-in
 * (CRYPTIFICATE_INTEGRATION=1) because it needs a built engine and the
 * trusted Lean library, and takes a few seconds per certificate.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AnalysisReport, AnalysisRequest, Claim } from '@cryptificate/schema';
import { ANALYSIS_STEPS, runAnalysis } from '../src/analysis.js';
import { JobContext } from '../src/context.js';
import { makeEnv } from '../src/env.js';

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
