import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aesLikeActivityBound,
  canonicalJson,
  designClaimsFor,
  hadesOuterActivityBound,
  hadesOuterActivityBoundWidth,
  hadesTotalActivityBoundWidth,
  isBnDecimal,
  isEvidenceLabel,
  nativeCorrectnessFailedLabel,
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
  assert.deepEqual([2, 4, 6, 8, 160].map(hadesOuterActivityBound), [2, 8, 10, 16, 320]);
  assert.equal(isEvidenceLabel('Lean-checked proof'), true);
  assert.equal(isEvidenceLabel(nativeCorrectnessLabel(9214)), true);
  assert.equal(nativeCorrectnessFailedLabel(8666, 9215), 'Generated Rust failed 8666 of 9215 correctness cases');
  assert.equal(isEvidenceLabel(nativeCorrectnessFailedLabel(8666, 9215)), true);
  assert.equal(isEvidenceLabel('Verified'), false);
});

test('accepts experimental widths only when marked', () => {
  const small = {
    model: 'aes-like/gf256/v1',
    field: 'gf256',
    width: 2,
    matrix: [['03', '02'], ['02', '03']],
    offsets: [0, 1],
    rounds: 4,
    sbox: { kind: 'aes' },
  };
  assert.deepEqual(paths(validateAnalysisRequest({ design: small })), ['/design/width']);
  assert.equal(validateAnalysisRequest({ design: { ...small, experimental: true } }).ok, true);
  const prog = { field: 'gf256', width: 2, instructions: [{ op: 'add', a: 0, b: 1 }], outputs: [2, 1] };
  assert.equal(validateAnalysisRequest({ design: { ...small, experimental: true }, program: prog }).ok, true);
});

const KOALA = {
  model: 'hades/prime/v1',
  field: 'koalabear',
  width: 4,
  external: [
    ['5', '7', '1', '3'],
    ['4', '6', '1', '1'],
    ['1', '3', '5', '7'],
    ['1', '1', '4', '6'],
  ],
  internal: [
    ['2', '1', '1', '1'],
    ['1', '3', '1', '1'],
    ['1', '1', '5', '1'],
    ['1', '1', '1', '9'],
  ],
  fullRounds: 8,
  partialRounds: 20,
  sbox: { kind: 'power', exponent: 3 },
};

function designErrors(design: unknown): string[] {
  const r = validateAnalysisRequest({ design });
  return r.ok ? [] : r.errors.map((e) => `${e.path} ${e.code}`);
}

test('accepts prime-field designs and checks residues against the modulus', () => {
  assert.deepEqual(designErrors(KOALA), []);
  assert.deepEqual(designErrors({ ...KOALA, modulus: '2130706433' }), []);
  assert.deepEqual(designErrors({ ...KOALA, field: 'goldilocks', width: 4 }), []);
  // p - 1 is a residue, p is not.
  const big = structuredClone(KOALA) as typeof KOALA;
  big.external[0]![0] = '2130706432';
  assert.deepEqual(designErrors(big), []);
  big.external[0]![0] = '2130706433';
  assert.deepEqual(designErrors(big), ['/design/external/0/0 prime']);
  // A custom prime needs its modulus; a named field's modulus must match.
  assert.deepEqual(designErrors({ ...KOALA, field: 'prime' }), ['/design/modulus required']);
  assert.deepEqual(designErrors({ ...KOALA, field: 'prime', modulus: '18446744073709551557' }), []);
  assert.deepEqual(designErrors({ ...KOALA, field: 'prime', modulus: '18446744073709551616' }), ['/design/modulus modulus']);
  assert.deepEqual(designErrors({ ...KOALA, modulus: '2013265921' }), ['/design/modulus modulus']);
  assert.deepEqual(designErrors({ ...KOALA, field: 'bn254' }), ['/design/field enum']);
  assert.deepEqual(designErrors({ ...KOALA, width: 5 }), ['/design/width enum']);
  assert.deepEqual(designErrors({ ...KOALA, constants: { kind: 'reference' } }), ['/design/constants/kind enum']);
  assert.deepEqual(designErrors({ ...HADES, constants: { kind: 'unspecified' } }), ['/design/constants/kind enum']);
});

test('prime-field designs take no circuits and no experiments', () => {
  const r = validateAnalysisRequest({ design: KOALA, program: { ...SHARED_SUM_BN, width: 4 } });
  assert.equal(r.ok, false);
  assert.deepEqual(r.ok ? [] : r.errors.map((e) => e.path), ['/program']);
  const t = validateAnalysisRequest({ design: KOALA, target: 'internal' });
  assert.equal(t.ok, true);
  const x = validateExperimentRequest({ design: KOALA, profile: 'quick' });
  assert.deepEqual(x.ok ? [] : x.errors.map((e) => `${e.path} ${e.code}`), ['/design/model unsupported']);
});

test('normalizes prime-field designs as the engine does', () => {
  const n = normalizeAnalysisRequest({ design: KOALA } as unknown as AnalysisRequest);
  assert.equal(
    canonicalJson(n),
    canonicalJson({
      design: {
        ...KOALA,
        modulus: '2130706433',
        partialMask: [true, false, false, false],
        constants: { kind: 'unspecified' },
      },
    }),
  );
  assert.equal(hadesOuterActivityBoundWidth(8, 4), 20);
  assert.equal(hadesOuterActivityBoundWidth(8, 3), hadesOuterActivityBound(8));
  assert.equal(hadesTotalActivityBoundWidth(8, 20, 4, 4), 25);
});

/** A width-`t` design over KoalaBear: J + I as both matrices. */
function koalaWidth(t: number): Record<string, unknown> {
  const m = () => Array.from({ length: t }, (_, i) => Array.from({ length: t }, (_, j) => (i === j ? '2' : '1')));
  return { ...KOALA, width: t, external: m(), internal: m(), partialMask: Array.from({ length: t }, (_, i) => i === 0) };
}

test('accepts the Poseidon2 widths 2, 8, 12, 16 and 24 over a prime field', () => {
  for (const t of [2, 3, 4, 8, 12, 16, 24]) assert.deepEqual(designErrors(koalaWidth(t)), [], `width ${t}`);
  for (const t of [1, 5, 6, 20, 32]) assert.ok(designErrors(koalaWidth(t)).includes('/design/width enum'), `width ${t}`);
  // Rows are checked against the declared width.
  const short = koalaWidth(16);
  (short['internal'] as string[][])[15] = Array(12).fill('1');
  assert.deepEqual(designErrors(short), ['/design/internal/15 length']);
});

test('the wide external claims exist only above width four', () => {
  const ids = (t?: number) => designClaimsFor('hades/prime/v1', t).map((c) => c.id);
  for (const t of [undefined, 2, 3, 4]) {
    assert.ok(!ids(t).includes('external.m4_mds') && !ids(t).includes('external.invertible'), `width ${t}`);
  }
  for (const t of [8, 12, 16, 24]) {
    assert.deepEqual(ids(t).slice(0, 4), ['field.prime', 'external.mds', 'external.m4_mds', 'external.invertible'], `width ${t}`);
  }
  assert.ok(!designClaimsFor('hades/bn254/v1').some((c) => c.id === 'external.invertible'));
});
