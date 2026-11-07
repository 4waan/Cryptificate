/**
 * Claim constants.grain in the service: the explicit constants Lean must echo,
 * the refutation witness carried into the report, the claim's place in the
 * HADES claim lists, and bundles recorded before the claim existed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AnalysisRequest, Claim, ClaimId } from '@cryptificate/schema';
import { HADES_DESIGN_CLAIMS, HADES_PRIME_DESIGN_CLAIMS } from '@cryptificate/schema';
import type { ClaimVerdict, ExpectedTheorem } from '../src/acceptance.js';
import { derivedEcho } from '../src/certificate.js';
import { buildAnalysisClaims } from '../src/claims.js';
import { compareClaims } from '../src/verify.js';

const root = fileURLToPath(new URL('../../../../', import.meta.url));

function design(name: string): AnalysisRequest['design'] {
  return JSON.parse(readFileSync(`${root}examples/designs/${name}.json`, 'utf8')) as AnalysisRequest['design'];
}

const AXIOMS = ['propext'];

function byId(claims: Claim[], id: string): Claim {
  const c = claims.find((x) => x.id === id);
  assert.ok(c, id);
  return c;
}

test('constants.grain is the last design claim of both HADES profiles', () => {
  assert.equal(HADES_DESIGN_CLAIMS.at(-1)?.id, 'constants.grain');
  assert.equal(HADES_PRIME_DESIGN_CLAIMS.at(-1)?.id, 'constants.grain');
});

test('explicit constants are echoed row by row; reference and unspecified constants are not', () => {
  const echo = derivedEcho({ design: design('koalabear-t4-grain') });
  const rows = echo['candConstants'] as string[][];
  assert.equal(rows.length, 28);
  assert.deepEqual(rows[4], ['245687908', '0', '0', '0']);
  assert.equal(derivedEcho({ design: design('poseidon2-bn254') })['candConstants'], undefined);
  assert.equal(derivedEcho({ design: design('koalabear-t4') })['candConstants'], undefined);
});

test('a refuted constants.grain carries the first differing position', () => {
  const witness = { kind: 'constant-mismatch' as const, index: 16, round: 4, position: 0, expected: '245687908', actual: '245687909' };
  const theorem = 'CryptificateJob.constants_not_grain';
  const type =
    'Cryptificate.Grain.constantAt CryptificateJob.candModulus 4 CryptificateJob.candFullRounds CryptificateJob.candPartialRounds 16 = some 245687908 ∧ CryptificateJob.candConstants[16]? ≠ some 245687908';
  const expect: ExpectedTheorem[] = [{ claim: 'constants.grain', theorem, status: 'refuted', expectedType: type, witness: null }];
  const verdicts: ClaimVerdict[] = [{ claim: 'constants.grain', theorem, status: 'refuted', accepted: true, detail: 'accepted', audit: { theorem, type, axioms: AXIOMS } }];
  const claims = buildAnalysisClaims({
    request: { design: design('koalabear-t4-grain-edited') },
    expect,
    verdicts,
    diagnostics: { claims: [{ claim: 'constants.grain', predicted: 'refuted', holds: false, witness }] },
  });
  const c = byId(claims, 'constants.grain');
  assert.equal(c.status, 'refuted');
  assert.equal(c.evidence.kind, 'lean');
  assert.deepEqual(c.witness, witness);
  // Not an activity bound: no precondition applies, so the other claims do not matter here.
  assert.equal(byId(claims, 'field.prime').status, 'not_established');
});

test('a constant-mismatch witness is kept only when the checked statement and the request bind it', () => {
  const theorem = 'CryptificateJob.constants_not_grain';
  const type =
    'Cryptificate.Grain.constantAt CryptificateJob.candModulus 4 CryptificateJob.candFullRounds CryptificateJob.candPartialRounds 16 = some 245687908 ∧ CryptificateJob.candConstants[16]? ≠ some 245687908';
  const good = { kind: 'constant-mismatch' as const, index: 16, round: 4, position: 0, expected: '245687908', actual: '245687909' };
  const run = (witness: unknown, checkedType = type): Claim['witness'] => {
    const verdicts: ClaimVerdict[] = [{ claim: 'constants.grain', theorem, status: 'refuted', accepted: true, detail: 'accepted', audit: { theorem, type: checkedType, axioms: AXIOMS } }];
    const claims = buildAnalysisClaims({
      request: { design: design('koalabear-t4-grain-edited') },
      expect: [{ claim: 'constants.grain', theorem, status: 'refuted', expectedType: checkedType, witness: null }],
      verdicts,
      diagnostics: { claims: [{ claim: 'constants.grain', witness }] },
    });
    const c = byId(claims, 'constants.grain');
    assert.equal(c.status, 'refuted');
    return c.witness;
  };
  assert.deepEqual(run(good), good);
  // The submitted value it names is not the request's.
  assert.equal(run({ ...good, actual: '1' }), null);
  // Index or generated value other than the ones in the accepted statement.
  assert.equal(run({ ...good, index: 20, round: 5 }), null);
  assert.equal(run({ ...good, expected: '245687907' }), null);
  // Round and position that do not address the index.
  assert.equal(run({ ...good, round: 3, position: 4 }), null);
  assert.equal(run({ ...good, round: 0, position: 16 }), null);
  // A statement for another width.
  assert.equal(run(good, type.replace('candModulus 4', 'candModulus 3')), null);
  // Another kind of witness.
  assert.equal(run({ kind: 'sbox-collision', x1: '00', x2: '01', y: '00' }), null);
});

test('constants.grain is not established when the design gives no constants', () => {
  const claims = buildAnalysisClaims({
    request: { design: design('koalabear-t4') },
    expect: [],
    verdicts: [],
    diagnostics: {},
    skipped: [{ claim: 'constants.grain', reason: 'not established: the design gives no round constants' }],
  });
  const c = byId(claims, 'constants.grain');
  assert.equal(c.status, 'not_established');
  assert.equal(c.reason, 'out-of-scope');
  assert.equal(c.note, 'Not established: the design gives no round constants.');
});

test('verify: a bundle that predates constants.grain only may omit it, and nothing else', () => {
  const claim = (id: ClaimId, status: Claim['status']): Claim => ({ id, chain: 'design', title: id, status, evidence: { kind: 'lean', label: 'Lean-checked proof' }, witness: null, note: '' });
  const recorded = [claim('external.mds', 'proved'), claim('activity.partial', 'proved'), claim('activity.total', 'proved')];
  const now = [...recorded, claim('constants.grain', 'proved')];
  const rows = compareClaims('design', recorded, now, false, ['constants.grain']);
  assert.equal(rows.find((r) => r.claim === 'constants.grain')?.result, 'not recorded');
  // Without the predating proof, the omission is a mismatch.
  assert.equal(compareClaims('design', recorded, now, false, []).find((r) => r.claim === 'constants.grain')?.result, 'mismatch');
  // Predating constants.grain does not excuse dropping the partial-round claims.
  const dropped = compareClaims('design', [claim('external.mds', 'proved')], now, false, ['constants.grain']);
  assert.deepEqual(
    dropped.filter((r) => r.recorded === 'missing').map((r) => [r.claim, r.result]),
    [
      ['activity.partial', 'mismatch'],
      ['activity.total', 'mismatch'],
      ['constants.grain', 'not recorded'],
    ],
  );
  // A recorded status is compared as usual.
  const forged = compareClaims('design', [...recorded, claim('constants.grain', 'refuted')], now, false, ['constants.grain']);
  assert.equal(forged.find((r) => r.claim === 'constants.grain')?.result, 'mismatch');
});
