import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptCertificate, parseLeanOutput } from '../src/acceptance.js';
import type { ExpectedTheorem, LeanOutcome } from '../src/acceptance.js';

const MDS_TYPE = 'Cryptificate.IsMDS4 CryptificateJob.candMatrix';
const EQ_TYPE = 'Cryptificate.Circuit.eval CryptificateJob.candProgram = Cryptificate.matVec CryptificateJob.candMatrix';

const expect: ExpectedTheorem[] = [
  { claim: 'matrix.mds', theorem: 'CryptificateJob.matrix_mds', status: 'proved', expectedType: MDS_TYPE },
  { claim: 'circuit.equivalence', theorem: 'CryptificateJob.circuit_equivalence', status: 'proved', expectedType: EQ_TYPE },
];

const MATRIX = [
  ['02', '03', '01', '01'],
  ['01', '02', '03', '01'],
  ['01', '01', '02', '03'],
  ['03', '01', '01', '02'],
];
const inputs = { candMatrix: MATRIX, candRounds: 4 };

function audit(theorem: string, type: string, axioms: string[] = ['propext', 'Classical.choice', 'Quot.sound']): string {
  return `CRYPTIFICATE_AUDIT ${JSON.stringify({ theorem, type, axioms })}`;
}

function outcome(stdout: string, extra: Partial<LeanOutcome> = {}): LeanOutcome {
  return { exitCode: 0, timedOut: false, cancelled: false, stdout, stderr: '', ms: 1200, ...extra };
}

const GOOD = [
  `CRYPTIFICATE_INPUT candMatrix ${JSON.stringify(MATRIX)}`,
  'CRYPTIFICATE_INPUT candRounds 4',
  audit('CryptificateJob.matrix_mds', MDS_TYPE),
  audit('CryptificateJob.circuit_equivalence', EQ_TYPE, ['propext']),
].join('\n');

test('accepts a complete, clean run', () => {
  const r = acceptCertificate(expect, inputs, outcome(GOOD));
  assert.equal(r.inputsMatch, true);
  assert.deepEqual(
    r.verdicts.map((v) => [v.claim, v.status, v.accepted]),
    [
      ['matrix.mds', 'proved', true],
      ['circuit.equivalence', 'proved', true],
    ],
  );
});

test('a refutation theorem yields refuted only when accepted', () => {
  const refute: ExpectedTheorem[] = [{ claim: 'matrix.mds', theorem: 'CryptificateJob.matrix_not_mds', status: 'refuted', expectedType: '¬Cryptificate.IsMDS4 CryptificateJob.candMatrix' }];
  const ok = acceptCertificate(refute, {}, outcome(audit('CryptificateJob.matrix_not_mds', '¬Cryptificate.IsMDS4 CryptificateJob.candMatrix')));
  assert.equal(ok.verdicts[0]!.status, 'refuted');
  const timeout = acceptCertificate(refute, {}, outcome('', { exitCode: null, timedOut: true, ms: 180000 }));
  assert.equal(timeout.verdicts[0]!.status, 'not_established');
  assert.equal(timeout.verdicts[0]!.reason, 'lean-timeout');
});

test('exit status 0 is not enough: a missing theorem is rejected', () => {
  const stdout = GOOD.split('\n').filter((l) => !l.includes('circuit_equivalence')).join('\n');
  const r = acceptCertificate(expect, inputs, outcome(stdout));
  assert.equal(r.verdicts[0]!.status, 'proved');
  assert.equal(r.verdicts[1]!.status, 'not_established');
  assert.equal(r.verdicts[1]!.reason, 'audit-missing-theorem');
});

test('sorryAx and native_decide are rejected', () => {
  for (const ax of ['sorryAx', 'Lean.ofReduceBool', 'Lean.trustCompiler', 'MyAxiom']) {
    const stdout = GOOD.replace(audit('CryptificateJob.matrix_mds', MDS_TYPE), audit('CryptificateJob.matrix_mds', MDS_TYPE, ['propext', ax]));
    const r = acceptCertificate(expect, inputs, outcome(stdout));
    assert.equal(r.verdicts[0]!.status, 'not_established', ax);
    assert.equal(r.verdicts[0]!.reason, 'audit-forbidden-axiom', ax);
    assert.equal(r.verdicts[1]!.status, 'proved');
  }
});

test('a theorem with the wrong type is rejected', () => {
  const stdout = GOOD.replace(MDS_TYPE, 'True');
  const r = acceptCertificate(expect, inputs, outcome(stdout));
  assert.equal(r.verdicts[0]!.reason, 'audit-type-mismatch');
  assert.equal(r.verdicts[0]!.status, 'not_established');
  // whitespace differences alone do not matter
  const spaced = GOOD.replace(MDS_TYPE, MDS_TYPE.replace(' ', '  '));
  assert.equal(acceptCertificate(expect, inputs, outcome(spaced)).verdicts[0]!.status, 'proved');
});

test('echoed inputs must equal the submitted values', () => {
  const wrongMatrix = MATRIX.map((r) => [...r]);
  wrongMatrix[0]![0] = '04';
  const stdout = GOOD.replace(JSON.stringify(MATRIX), JSON.stringify(wrongMatrix));
  const r = acceptCertificate(expect, inputs, outcome(stdout));
  assert.equal(r.inputsMatch, false);
  assert.ok(r.verdicts.every((v) => v.status === 'not_established' && v.reason === 'audit-input-mismatch'));
  const missing = acceptCertificate(expect, inputs, outcome(GOOD.replace('CRYPTIFICATE_INPUT candRounds 4', '')));
  assert.ok(missing.verdicts.every((v) => v.reason === 'audit-input-mismatch'));
  // canonical comparison: lowercase hex and 0x prefixes are the same element
  const lower = GOOD.replace(JSON.stringify(MATRIX), JSON.stringify(MATRIX.map((r) => r.map((e) => `0x${e.toLowerCase()}`))));
  assert.equal(acceptCertificate(expect, inputs, outcome(lower)).inputsMatch, true);
});

test('timeout, cancellation, failure and missing Lean never refute', () => {
  const cases: Array<[Partial<LeanOutcome>, string]> = [
    [{ timedOut: true, exitCode: null }, 'lean-timeout'],
    [{ cancelled: true, exitCode: null }, 'cancelled'],
    [{ exitCode: 1 }, 'lean-failed'],
    [{ unavailable: true, exitCode: null }, 'lean-unavailable'],
  ];
  for (const [extra, reason] of cases) {
    const r = acceptCertificate(expect, inputs, outcome(GOOD, extra));
    assert.ok(r.verdicts.every((v) => v.status === 'not_established' && v.reason === reason), reason);
  }
});

test('conflicting duplicate audit lines are rejected', () => {
  const stdout = `${GOOD}\n${audit('CryptificateJob.matrix_mds', MDS_TYPE, ['sorryAx'])}`;
  const r = acceptCertificate(expect, inputs, outcome(stdout));
  assert.equal(r.verdicts[0]!.status, 'not_established');
  assert.equal(r.verdicts[1]!.status, 'proved');
});

test('parses Lean info prefixes only for the certificate file', () => {
  const file = '/work/jobs/abc/lean/Cert.lean';
  const prefixed = GOOD.split('\n').map((l) => `${file}:40:0: info: ${l}`).join('\n');
  const r = acceptCertificate(expect, inputs, outcome(prefixed), [file]);
  assert.ok(r.verdicts.every((v) => v.status === 'proved'));
  // the same lines inside another message are ignored
  const foreign = GOOD.split('\n').map((l) => `/elsewhere.lean:1:0: info: ${l}`).join('\n');
  const f = acceptCertificate(expect, inputs, outcome(foreign), [file]);
  assert.ok(f.verdicts.every((v) => v.status === 'not_established'));
  const embedded = parseLeanOutput(`error: unexpected token ${audit('CryptificateJob.matrix_mds', MDS_TYPE)}`, [file]);
  assert.equal(embedded.audits.size, 0);
});

test('accepts CRYPTIFICATE_INPUTS objects as well as single input lines', () => {
  const stdout = [`CRYPTIFICATE_INPUTS ${JSON.stringify(inputs)}`, audit('CryptificateJob.matrix_mds', MDS_TYPE), audit('CryptificateJob.circuit_equivalence', EQ_TYPE)].join('\n');
  const r = acceptCertificate(expect, inputs, outcome(stdout));
  assert.equal(r.inputsMatch, true);
});
