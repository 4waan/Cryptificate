/**
 * The claims of a HADES report over a prime field below 2^64: the primality
 * claim, titles that depend on the width, the extra precondition of the
 * activity bounds, and the echoed modulus, from synthetic Lean verdicts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AnalysisRequest, Claim, ClaimId } from '@cryptificate/schema';
import { normalizeDesign } from '@cryptificate/schema';
import type { ClaimVerdict, ExpectedTheorem } from '../src/acceptance.js';
import { derivedEcho } from '../src/certificate.js';
import { buildAnalysisClaims } from '../src/claims.js';

const root = fileURLToPath(new URL('../../../../', import.meta.url));

function design(name: string): AnalysisRequest['design'] {
  return JSON.parse(readFileSync(`${root}examples/designs/${name}.json`, 'utf8')) as AnalysisRequest['design'];
}

const AXIOMS = ['propext', 'Classical.choice', 'Quot.sound'];

function verdict(claim: ClaimId, theorem: string, status: 'proved' | 'refuted', type = 'T'): ClaimVerdict {
  return { claim, theorem: `CryptificateJob.${theorem}`, status, accepted: true, detail: 'accepted', audit: { theorem: `CryptificateJob.${theorem}`, type, axioms: AXIOMS } };
}

function expectation(claim: ClaimId, theorem: string, status: 'proved' | 'refuted'): ExpectedTheorem {
  return { claim, theorem: `CryptificateJob.${theorem}`, status, expectedType: 'T', witness: null };
}

function byId(claims: Claim[], id: string): Claim {
  const c = claims.find((x) => x.id === id);
  assert.ok(c, id);
  return c;
}

/** The statement of `hades_total_activity` at width four for window length `l`. */
function totalType(l: number): string {
  const t = JSON.parse(readFileSync(`${root}lean/templates/hades_total_activity_prime4.json`, 'utf8')) as { expectedType: string };
  return t.expectedType.replace('{{OBS_LENGTH}}', String(l));
}

const PROVED: Array<[ClaimId, string]> = [
  ['field.prime', 'field_prime'],
  ['external.mds', 'external_mds'],
  ['internal.invertible', 'internal_invertible'],
  ['sbox.bijective', 'power_bijective'],
  ['activity.outer', 'hades_activity'],
  ['activity.partial', 'partial_active'],
];

function koalaClaims(pairs: Array<[ClaimId, string]>): Claim[] {
  const total = verdict('activity.total', 'hades_total_activity', 'proved', totalType(4));
  return buildAnalysisClaims({
    request: { design: design('koalabear-t4') },
    expect: [...pairs.map(([c, t]) => expectation(c, t, 'proved')), expectation('activity.total', 'hades_total_activity', 'proved')],
    verdicts: [...pairs.map(([c, t]) => verdict(c, t, 'proved')), total],
    diagnostics: { partial: { window: 4 } },
  });
}

test('KoalaBear width four: the modulus claim first, bounds for branch number five', () => {
  const claims = koalaClaims(PROVED);
  const ids = claims.filter((c) => c.chain === 'design').map((c) => c.id);
  assert.deepEqual(ids, ['field.prime', 'external.mds', 'internal.invertible', 'sbox.bijective', 'activity.outer', 'activity.partial', 'activity.total']);
  assert.equal(byId(claims, 'field.prime').title, 'Modulus is prime');
  assert.equal(byId(claims, 'field.prime').status, 'proved');
  assert.equal(byId(claims, 'external.mds').title, 'External matrix is MDS (branch number 5)');
  assert.equal(byId(claims, 'activity.outer').title, 'At least 20 active S-boxes in the 8 full rounds');
  const total = byId(claims, 'activity.total');
  assert.equal(total.status, 'proved');
  assert.equal(total.title, 'At least 25 active S-boxes over all 28 rounds');
});

test('the activity bounds need the modulus proved prime', () => {
  const claims = koalaClaims(PROVED.filter(([c]) => c !== 'field.prime'));
  const outer = byId(claims, 'activity.outer');
  assert.equal(outer.status, 'not_established');
  assert.equal(outer.reason, 'precondition-failed');
  assert.match(outer.note, /a prime modulus/);
  assert.equal(byId(claims, 'activity.total').status, 'not_established');
  // The other claims are reported from their own verdicts.
  assert.equal(byId(claims, 'external.mds').status, 'proved');
});

test('the echoed inputs of a prime-field design include its modulus', () => {
  const d = normalizeDesign(design('babybear-t4'));
  const echo = derivedEcho({ design: d });
  assert.equal(echo['candModulus'], '2013265921');
  assert.deepEqual(echo['candPartialMask'], [true, false, false, false]);
  assert.equal(echo['candExponent'], 7);
  // BN254 designs have no modulus member and echo none.
  assert.equal(derivedEcho({ design: design('poseidon2-bn254') })['candModulus'], undefined);
});
