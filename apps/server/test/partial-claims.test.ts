/**
 * The partial-round claims of a HADES report: titles, preconditions and
 * bundle comparison, from synthetic Lean verdicts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AnalysisRequest, Claim, ClaimId } from '@cryptificate/schema';
import type { ClaimVerdict, ExpectedTheorem } from '../src/acceptance.js';
import { buildAnalysisClaims } from '../src/claims.js';
import { compareClaims, predatesAddedClaims, recordedRevision } from '../src/verify.js';

const root = fileURLToPath(new URL('../../../../', import.meta.url));

function design(name: string): AnalysisRequest['design'] {
  return JSON.parse(readFileSync(`${root}examples/designs/${name}.json`, 'utf8')) as AnalysisRequest['design'];
}

const AXIOMS = ['propext', 'Classical.choice', 'Quot.sound'];

function verdict(claim: ClaimId, theorem: string, status: 'proved' | 'refuted'): ClaimVerdict {
  return { claim, theorem: `CryptificateJob.${theorem}`, status, accepted: true, detail: 'accepted', audit: { theorem: `CryptificateJob.${theorem}`, type: 'T', axioms: AXIOMS } };
}

function expectation(claim: ClaimId, theorem: string, status: 'proved' | 'refuted', witness: ExpectedTheorem['witness'] = null): ExpectedTheorem {
  return { claim, theorem: `CryptificateJob.${theorem}`, status, expectedType: 'T', witness };
}

function byId(claims: Claim[], id: string): Claim {
  const c = claims.find((x) => x.id === id);
  assert.ok(c, id);
  return c;
}

const FULL_ROUNDS: Array<[ClaimId, string]> = [
  ['external.mds', 'external_mds'],
  ['internal.invertible', 'internal_invertible'],
  ['sbox.bijective', 'power_bijective'],
  ['activity.outer', 'hades_activity'],
];

test('reference parameters: charged windows and 34 active S-boxes over all rounds', () => {
  const pairs: Array<[ClaimId, string]> = [...FULL_ROUNDS, ['activity.partial', 'partial_active'], ['activity.total', 'hades_total_activity']];
  const claims = buildAnalysisClaims({
    request: { design: design('poseidon2-bn254') },
    expect: pairs.map(([c, t]) => expectation(c, t, 'proved')),
    verdicts: pairs.map(([c, t]) => verdict(c, t, 'proved')),
    diagnostics: { partial: { window: 3 } },
  });
  const ids = claims.filter((c) => c.chain === 'design').map((c) => c.id);
  assert.deepEqual(ids, ['external.mds', 'internal.invertible', 'sbox.bijective', 'activity.outer', 'activity.partial', 'activity.total']);
  assert.equal(byId(claims, 'activity.partial').status, 'proved');
  assert.equal(byId(claims, 'activity.partial').title, 'No difference passes the partial rounds without an active S-box');
  const total = byId(claims, 'activity.total');
  assert.equal(total.status, 'proved');
  assert.equal(total.title, 'At least 34 active S-boxes over all 64 rounds');
});

test('a bypass refutes activity.partial with its witness and leaves the total bound unestablished', () => {
  const witness = { kind: 'partial-bypass' as const, difference: ['0', '1', '21888242871839275222246405745257275088548364400416034343698204186575808495616'], positions: [0], partialRounds: 56 };
  const pairs: Array<[ClaimId, string]> = [...FULL_ROUNDS];
  const claims = buildAnalysisClaims({
    request: { design: design('poseidon2-bypass') },
    expect: [...pairs.map(([c, t]) => expectation(c, t, 'proved')), expectation('activity.partial', 'partial_bypass', 'refuted', witness)],
    verdicts: [...pairs.map(([c, t]) => verdict(c, t, 'proved')), verdict('activity.partial', 'partial_bypass', 'refuted')],
    diagnostics: { partial: { window: null } },
  });
  assert.equal(byId(claims, 'activity.outer').status, 'proved');
  const partial = byId(claims, 'activity.partial');
  assert.equal(partial.status, 'refuted');
  assert.equal(partial.evidence.label, 'Lean-checked counterexample');
  assert.deepEqual(partial.witness, witness);
  const total = byId(claims, 'activity.total');
  assert.equal(total.status, 'not_established');
  assert.equal(total.reason, 'precondition-failed');
  assert.match(total.note, /needs a charged window of partial rounds to be proved first/);
  assert.equal(total.title, 'Active S-box bound over the whole permutation');
});

test('no partial rounds: activity.partial and activity.total are out of scope, not refuted', () => {
  const d = { ...design('poseidon2-bn254'), partialRounds: 0 } as AnalysisRequest['design'];
  const pairs: Array<[ClaimId, string]> = [...FULL_ROUNDS];
  const claims = buildAnalysisClaims({
    request: { design: d },
    expect: pairs.map(([c, t]) => expectation(c, t, 'proved')),
    verdicts: pairs.map(([c, t]) => verdict(c, t, 'proved')),
    diagnostics: { partial: { window: null, bypass: null }, claims: [{ claim: 'activity.partial', holds: null, witness: null }] },
    skipped: [
      { claim: 'activity.partial', reason: 'not applicable: the design has no partial rounds, so there is no partial-round S-box to activate or to bypass' },
      { claim: 'activity.total', reason: 'not established by this method: the design has no partial rounds, so every S-box is in the full rounds and activity.outer gives the bound; no certificate is emitted for this claim' },
    ],
  });
  assert.equal(byId(claims, 'activity.outer').status, 'proved');
  const partial = byId(claims, 'activity.partial');
  assert.equal(partial.status, 'not_established');
  assert.equal(partial.reason, 'out-of-scope');
  assert.equal(partial.witness, null);
  assert.match(partial.note, /no partial rounds/);
  const total = byId(claims, 'activity.total');
  assert.equal(total.status, 'not_established');
  assert.equal(total.reason, 'out-of-scope');
  assert.match(total.note, /activity\.outer gives the bound/);
});

test('verify: partial-round claims missing from an older bundle are not mismatches', () => {
  const claim = (id: ClaimId, status: Claim['status']): Claim => ({ id, chain: 'design', title: id, status, evidence: { kind: 'lean', label: 'Lean-checked proof' }, witness: null, note: '' });
  const recorded = [claim('external.mds', 'proved'), claim('activity.outer', 'proved')];
  const now = [...recorded, claim('activity.partial', 'proved'), claim('activity.total', 'proved')];
  // A bundle shown to predate the claims, lacking both of them.
  const rows = compareClaims('design', recorded, now, false, true);
  assert.deepEqual(
    rows.map((r) => [r.claim, r.result]),
    [
      ['external.mds', 'match'],
      ['activity.outer', 'match'],
      ['activity.partial', 'not recorded'],
      ['activity.total', 'not recorded'],
    ],
  );
  // A recorded status is compared as usual.
  const forged = compareClaims('design', [...recorded, claim('activity.partial', 'refuted')], now, false, true);
  assert.equal(forged.find((r) => r.claim === 'activity.partial')?.result, 'mismatch');
  // Older claims missing from a bundle still count as a mismatch.
  const dropped = compareClaims('design', [claim('activity.outer', 'proved')], now, false, true);
  assert.equal(dropped.find((r) => r.claim === 'external.mds')?.result, 'mismatch');
});

test('verify: a bundle that cannot be shown to predate the claims may not drop them', () => {
  const claim = (id: ClaimId, status: Claim['status']): Claim => ({ id, chain: 'design', title: id, status, evidence: { kind: 'lean', label: 'Lean-checked proof' }, witness: null, note: '' });
  const full = [claim('external.mds', 'proved'), claim('activity.outer', 'proved'), claim('activity.partial', 'refuted'), claim('activity.total', 'not_established')];
  // Recorded by the current version, with the refuted bypass removed from report.json.
  const hidden = full.filter((c) => c.id !== 'activity.partial');
  const rows = compareClaims('design', hidden, full, false, false);
  assert.equal(rows.find((r) => r.claim === 'activity.partial')?.result, 'mismatch');
  // Even an older checker may not drop one of the claims while recording the other.
  const partly = compareClaims('design', hidden, full, false, true);
  assert.equal(partly.find((r) => r.claim === 'activity.partial')?.result, 'mismatch');
  // Without the predating proof, dropping both is a mismatch too.
  const both = compareClaims('design', full.slice(0, 2), full, false, false);
  assert.deepEqual(
    both.filter((r) => r.claim.startsWith('activity.p') || r.claim === 'activity.total').map((r) => r.result),
    ['mismatch', 'mismatch'],
  );
});

test('verify: the recorded checker revision decides whether a bundle predates the claims', async () => {
  assert.equal(recordedRevision('cryptificate 0.1.0 (e74b8e6)'), 'e74b8e6');
  assert.equal(recordedRevision('cryptificate 0.1.0 (v0.1-12-g0123abcd)'), '0123abcd');
  assert.equal(recordedRevision('cryptificate 0.1.0 (e74b8e6-dirty)'), null);
  assert.equal(recordedRevision('cryptificate 0.1.0'), null);
  assert.equal(recordedRevision('cryptificate 0.1.0 (--output=x)'), null);
  assert.equal(recordedRevision(undefined), null);
  // A revision unknown to the checkout, or none, proves nothing.
  assert.equal(await predatesAddedClaims(root, 'cryptificate 0.1.0 (0000000)'), false);
  assert.equal(await predatesAddedClaims(root, 'cryptificate 0.1.0'), false);
  const git = (args: string[]) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  if (git(['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']).status !== 0) return;
  // The current checkout names the claims.
  const head = git(['rev-parse', '--short', 'HEAD']).stdout.trim();
  assert.equal(await predatesAddedClaims(root, `cryptificate 0.1.0 (${head})`), false);
  // The revision that recorded the example HADES bundles predates them,
  // when the checkout has its history.
  if (git(['cat-file', '-e', 'e74b8e6^{commit}']).status === 0) {
    assert.equal(await predatesAddedClaims(root, 'cryptificate 0.1.0 (e74b8e6)'), true);
  }
});
