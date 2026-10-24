import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aesLikeActivityBound,
  canonicalJson,
  isBnDecimal,
  isEvidenceLabel,
  nativeCorrectnessLabel,
  normalizeAnalysisRequest,
  validateAnalysisRequest,
  validateExperimentRequest,
  BN254_MODULUS,
} from '../src/index.js';
import type { AnalysisRequest } from '../src/index.js';

const AES = {
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
};

const HADES = {
  model: 'hades/bn254/v1',
  field: 'bn254',
  width: 3,
  external: [['2', '1', '1'], ['1', '2', '1'], ['1', '1', '2']],
  internal: [['2', '1', '1'], ['1', '2', '1'], ['1', '1', '3']],
  fullRounds: 8,
  partialRounds: 56,
  sbox: { kind: 'power', exponent: 5 },
  partialMask: [true, false, false],
  constants: { kind: 'reference' },
};

const SHARED_SUM_BN = {
  field: 'bn254',
  width: 3,
  name: 'shared-sum',
  instructions: [
    { op: 'add', a: 0, b: 1 },
    { op: 'add', a: 3, b: 2 },
    { op: 'add', a: 4, b: 0 },
    { op: 'add', a: 4, b: 1 },
    { op: 'add', a: 4, b: 2 },
  ],
  outputs: [5, 6, 7],
};

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function paths(result: ReturnType<typeof validateAnalysisRequest>): string[] {
  return result.ok ? [] : result.errors.map((e) => e.path);
}

test('accepts the reference AES-like and HADES designs', () => {
  assert.equal(validateAnalysisRequest({ design: AES }).ok, true);
  assert.equal(validateAnalysisRequest({ design: HADES, program: SHARED_SUM_BN, target: 'external' }).ok, true);
});

test('rejects numbers where field elements are expected', () => {
  const d = clone(AES) as Record<string, unknown>;
  (d['matrix'] as unknown[][])[0]![1] = 3;
  assert.deepEqual(paths(validateAnalysisRequest({ design: d })), ['/design/matrix/0/1']);
});

test('rejects malformed hex and non-canonical decimals', () => {
  const d = clone(AES);
  d.matrix[2]![2] = '0x2';
  assert.deepEqual(paths(validateAnalysisRequest({ design: d })), ['/design/matrix/2/2']);
  for (const bad of ['01', '+1', ' 1', '-1', BN254_MODULUS, '1.0', '']) {
    assert.equal(isBnDecimal(bad), false, bad);
  }
  assert.equal(isBnDecimal('0'), true);
});

test('rejects unknown fields, bad offsets, rounds and S-box tables', () => {
  assert.deepEqual(paths(validateAnalysisRequest({ design: { ...AES, extra: 1 } })), ['/design/extra']);
  assert.deepEqual(paths(validateAnalysisRequest({ design: { ...AES, offsets: [0, 1, 2, 4] } })), ['/design/offsets/3']);
  assert.deepEqual(paths(validateAnalysisRequest({ design: { ...AES, rounds: 3 } })), ['/design/rounds']);
  assert.deepEqual(paths(validateAnalysisRequest({ design: { ...AES, sbox: { kind: 'table', table: ['00'] } } })), [
    '/design/sbox/table',
  ]);
});

test('checks HADES round counts and explicit constants length', () => {
  assert.deepEqual(paths(validateAnalysisRequest({ design: { ...HADES, fullRounds: 7 } })), ['/design/fullRounds']);
  assert.deepEqual(paths(validateAnalysisRequest({ design: { ...HADES, partialRounds: 153 } })), ['/design/partialRounds']);
  const explicit = { ...HADES, fullRounds: 2, partialRounds: 1, constants: { kind: 'explicit', values: [['1', '2', '3']] } };
  assert.deepEqual(paths(validateAnalysisRequest({ design: explicit })), ['/design/constants/values']);
  assert.deepEqual(paths(validateAnalysisRequest({ design: { ...HADES, sbox: { kind: 'power', exponent: 0 } } })), [
    '/design/sbox/exponent',
  ]);
});

test('checks program register references, limits and field agreement', () => {
  const forward = clone(SHARED_SUM_BN);
  forward.instructions[0] = { op: 'add', a: 0, b: 3 };
  assert.deepEqual(paths(validateAnalysisRequest({ design: HADES, program: forward })), ['/program/instructions/0/b']);
  const outputs = { ...SHARED_SUM_BN, outputs: [5, 6, 8] };
  assert.deepEqual(paths(validateAnalysisRequest({ design: HADES, program: outputs })), ['/program/outputs/2']);
  const wrongField = { ...SHARED_SUM_BN, field: 'gf256' };
  assert.deepEqual(paths(validateAnalysisRequest({ design: HADES, program: wrongField })), ['/program/field']);
  const long = {
    field: 'gf256',
    width: 4,
    instructions: Array.from({ length: 257 }, () => ({ op: 'add', a: 0, b: 1 })),
    outputs: [0, 1, 2, 3],
  };
  assert.deepEqual(paths(validateAnalysisRequest({ design: AES, program: long })), ['/program/instructions']);
  assert.deepEqual(paths(validateAnalysisRequest({ design: AES, program: { ...SHARED_SUM_BN }, target: 'external' })).includes('/target'), true);
});

test('validates experiment requests', () => {
  assert.equal(validateExperimentRequest({ design: AES, profile: 'quick' }).ok, true);
  assert.equal(validateExperimentRequest({ design: AES, profile: 'quick', seed: 'c0ffee' }).ok, true);
  assert.equal(validateExperimentRequest({ design: AES, profile: 'slow' }).ok, false);
  assert.equal(validateExperimentRequest({ design: AES, profile: 'quick', seed: 'xyz' }).ok, false);
  assert.equal(validateExperimentRequest({ design: AES }).ok, false);
});

test('normalizes hex case and fills the default target', () => {
  const req = {
    design: { ...clone(AES), matrix: [['02', '03', '01', '01'], ['01', '02', '03', '01'], ['01', '01', '02', '03'], ['03', '01', '01', '0a']] },
    program: { field: 'gf256', width: 4, instructions: [{ op: 'mul', k: '1b', a: 0 }], outputs: [4, 1, 2, 3] },
  } as AnalysisRequest;
  const n = normalizeAnalysisRequest(req);
  assert.equal(n.target, 'matrix');
  assert.equal((n.design as { matrix: string[][] }).matrix[3]![3], '0A');
  assert.deepEqual(n.program!.instructions[0], { op: 'mul', k: '1B', a: 0 });
});

test('canonical JSON sorts keys and is stable', () => {
  assert.equal(canonicalJson({ b: 1, a: [true, null, 'x'] }), '{"a":[true,null,"x"],"b":1}');
});

test('activity bound and evidence labels', () => {
  assert.deepEqual([4, 6, 10, 32].map(aesLikeActivityBound), [25, 30, 55, 200]);
  assert.equal(isEvidenceLabel('Lean-checked proof'), true);
  assert.equal(isEvidenceLabel(nativeCorrectnessLabel(9214)), true);
  assert.equal(isEvidenceLabel('Verified'), false);
});
