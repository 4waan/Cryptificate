import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AnalysisRequest, Witness } from '@cryptificate/schema';
import type { ClaimVerdict, ExpectedTheorem } from '../src/acceptance.js';
import { buildAnalysisClaims, sboxQualityStatement } from '../src/claims.js';

const AES_TABLE_DESIGN = {
  model: 'aes-like/gf256/v1',
  field: 'gf256',
  width: 4,
  matrix: [
    ['02', '03', '01', '01'],
    ['01', '02', '03', '01'],
    ['01', '01', '02', '03'],
    ['03', '01', '01', '02'],
  ],
  offsets: [0, 1, 2, 3],
  rounds: 4,
  sbox: { kind: 'aes' },
} as AnalysisRequest['design'];

const DIFF: Witness = { kind: 'sbox-differential', uniformity: 4, inputDifference: '01', outputDifference: '1F' };
const LIN: Witness = { kind: 'sbox-linearity', linearity: 32, inputMask: '01', outputMask: '48' };
const AXIOMS = ['propext', 'Classical.choice', 'Quot.sound'];

function verdict(claim: 'sbox.differential' | 'sbox.linearity', type: string): ClaimVerdict {
  const theorem = claim === 'sbox.differential' ? 'CryptificateJob.sbox_differential' : 'CryptificateJob.sbox_linearity';
  return { claim, theorem, status: 'proved', accepted: true, detail: '', audit: { theorem, type, axioms: AXIOMS } };
}

function expected(claim: 'sbox.differential' | 'sbox.linearity', witness: Witness): ExpectedTheorem {
  const theorem = claim === 'sbox.differential' ? 'CryptificateJob.sbox_differential' : 'CryptificateJob.sbox_linearity';
  return { claim, theorem, status: 'proved', expectedType: sboxQualityStatement(witness)!, witness };
}

test('the S-box quality statements are the ones the templates prove', () => {
  assert.equal(
    sboxQualityStatement(DIFF),
    'Cryptificate.differentialUniformity CryptificateJob.candSboxTable = 4 ∧ Cryptificate.gf 1 ≠ 0 ∧ ' +
      'diffCount CryptificateJob.candSboxTable (Cryptificate.gf 1) (Cryptificate.gf 31) = 4',
  );
  assert.equal(
    sboxQualityStatement(LIN),
    'Cryptificate.linearity CryptificateJob.candSboxTable = 32 ∧ Cryptificate.gf 72 ≠ 0 ∧ ' +
      '(Cryptificate.walsh CryptificateJob.candSboxTable (Cryptificate.gf 1) (Cryptificate.gf 72)).natAbs = 32',
  );
  assert.equal(sboxQualityStatement({ kind: 'sbox-collision', x1: '00', x2: '01', y: '63' }), null);
});

test('a proved S-box quality claim shows its value and witness', () => {
  const claims = buildAnalysisClaims({
    request: { design: AES_TABLE_DESIGN },
    expect: [expected('sbox.differential', DIFF), expected('sbox.linearity', LIN)],
    verdicts: [verdict('sbox.differential', sboxQualityStatement(DIFF)!), verdict('sbox.linearity', sboxQualityStatement(LIN)!)],
    diagnostics: null,
  });
  const d = claims.find((c) => c.id === 'sbox.differential')!;
  assert.equal(d.status, 'proved');
  assert.equal(d.title, 'Differential uniformity of the S-box table is 4');
  assert.deepEqual(d.witness, DIFF);
  assert.match(d.note, /not a bound on any trail/);
  const l = claims.find((c) => c.id === 'sbox.linearity')!;
  assert.equal(l.title, 'Linearity of the S-box table is 32');
  assert.deepEqual(l.witness, LIN);
  assert.match(l.note, /nonlinearity 112/);
});

test('a witness that the accepted statement does not repeat is not shown', () => {
  const wrong: Witness = { ...DIFF, uniformity: 6 };
  const claims = buildAnalysisClaims({
    request: { design: AES_TABLE_DESIGN },
    expect: [expected('sbox.differential', wrong)],
    verdicts: [verdict('sbox.differential', sboxQualityStatement(DIFF)!)],
    diagnostics: null,
  });
  const d = claims.find((c) => c.id === 'sbox.differential')!;
  assert.equal(d.status, 'proved');
  assert.equal(d.title, 'Differential uniformity of the S-box table');
  assert.equal(d.witness, null);
});

test('S-box quality claims without a certificate are not established', () => {
  const claims = buildAnalysisClaims({ request: { design: AES_TABLE_DESIGN }, expect: [], verdicts: [], diagnostics: null });
  for (const id of ['sbox.differential', 'sbox.linearity']) {
    assert.equal(claims.find((c) => c.id === id)?.status, 'not_established', id);
  }
});
