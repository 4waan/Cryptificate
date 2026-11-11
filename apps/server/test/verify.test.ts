import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Claim, ClaimId, Witness } from '@cryptificate/schema';
import { compareClaims } from '../src/verify.js';

function claim(id: ClaimId, status: Claim['status'], witness: Witness | null = null): Claim {
  return { id, chain: 'design', title: id, status, evidence: { kind: 'lean', label: 'Lean-checked proof' }, witness, note: '' };
}

const DIFF: Witness = { kind: 'sbox-differential', uniformity: 4, inputDifference: '01', outputDifference: '1F' };
const LIN: Witness = { kind: 'sbox-linearity', linearity: 32, inputMask: '01', outputMask: '48' };

test('a bundle recorded before the S-box quality claims still verifies', () => {
  const recorded = [claim('matrix.mds', 'proved')];
  const now = [claim('matrix.mds', 'proved'), claim('sbox.differential', 'proved', DIFF), claim('sbox.linearity', 'proved', LIN)];
  const rows = compareClaims('design', recorded, now, false, { olderCertificate: true });
  assert.deepEqual(
    rows.map((r) => [r.claim, r.recorded, r.recomputed, r.result]),
    [
      ['matrix.mds', 'proved', 'proved', 'match'],
      ['sbox.differential', 'missing', 'proved (uniformity 4 at 01/1F)', 'not recorded'],
      ['sbox.linearity', 'missing', 'proved (linearity 32 at 01/48)', 'not recorded'],
    ],
  );
});

test('S-box quality claims missing from a bundle with the current certificate are mismatches', () => {
  const recorded = [claim('matrix.mds', 'proved')];
  const now = [claim('matrix.mds', 'proved'), claim('sbox.differential', 'proved', DIFF), claim('sbox.linearity', 'proved', LIN)];
  for (const opts of [undefined, { olderCertificate: false }]) {
    const rows = compareClaims('design', recorded, now, false, opts);
    assert.deepEqual(
      rows.map((r) => [r.claim, r.result]),
      [
        ['matrix.mds', 'match'],
        ['sbox.differential', 'mismatch'],
        ['sbox.linearity', 'mismatch'],
      ],
    );
  }
});

test('a bundle with one S-box quality claim but not the other is a mismatch', () => {
  const recorded = [claim('sbox.differential', 'proved', DIFF)];
  const now = [claim('sbox.differential', 'proved', DIFF), claim('sbox.linearity', 'proved', LIN)];
  const rows = compareClaims('design', recorded, now, false, { olderCertificate: true });
  assert.deepEqual(
    rows.map((r) => [r.claim, r.result]),
    [
      ['sbox.differential', 'match'],
      ['sbox.linearity', 'mismatch'],
    ],
  );
});

test('S-box quality claims match only when the recorded value is the recomputed one', () => {
  const now = [claim('sbox.differential', 'proved', DIFF), claim('sbox.linearity', 'proved', LIN)];
  const forged = [
    claim('sbox.differential', 'proved', { ...DIFF, uniformity: 2 }),
    claim('sbox.linearity', 'proved', { ...LIN, outputMask: '49' }),
  ];
  assert.deepEqual(
    compareClaims('design', forged, now, false).map((r) => [r.claim, r.recorded, r.recomputed, r.result]),
    [
      ['sbox.differential', 'proved (uniformity 2 at 01/1F)', 'proved (uniformity 4 at 01/1F)', 'mismatch'],
      ['sbox.linearity', 'proved (linearity 32 at 01/49)', 'proved (linearity 32 at 01/48)', 'mismatch'],
    ],
  );
  // a value without a recomputed witness to compare with is not confirmed
  const generic = [claim('sbox.differential', 'proved'), claim('sbox.linearity', 'proved', LIN)];
  assert.deepEqual(
    compareClaims('design', [claim('sbox.differential', 'proved', DIFF)], generic, false).map((r) => [r.claim, r.result]),
    [
      ['sbox.differential', 'mismatch'],
      ['sbox.linearity', 'mismatch'],
    ],
  );
  // hex case is not significant
  const lower = [claim('sbox.differential', 'proved', { ...DIFF, outputDifference: '1f' }), claim('sbox.linearity', 'proved', LIN)];
  assert.deepEqual(
    compareClaims('design', lower, now, false).map((r) => r.result),
    ['match', 'match'],
  );
});

test('other re-checked claims missing from a bundle are still mismatches', () => {
  const rows = compareClaims('design', [claim('sbox.differential', 'proved')], [claim('matrix.mds', 'proved'), claim('sbox.differential', 'proved')], false);
  assert.deepEqual(
    rows.map((r) => [r.claim, r.result]),
    [
      ['sbox.differential', 'match'],
      ['matrix.mds', 'mismatch'],
    ],
  );
});

test('each group of later claims needs its own evidence that the bundle predates it', () => {
  const recorded = [claim('matrix.mds', 'proved')];
  const now = [
    claim('matrix.mds', 'proved'),
    claim('sbox.differential', 'proved', DIFF),
    claim('sbox.linearity', 'proved', LIN),
    claim('activity.partial', 'proved'),
    claim('activity.total', 'proved'),
  ];
  const results = (opts: Parameters<typeof compareClaims>[4]) => compareClaims('design', recorded, now, false, opts).map((r) => [r.claim, r.result]);
  // An older certificate excuses the S-box quality claims only.
  assert.deepEqual(results({ olderCertificate: true }), [
    ['matrix.mds', 'match'],
    ['sbox.differential', 'not recorded'],
    ['sbox.linearity', 'not recorded'],
    ['activity.partial', 'mismatch'],
    ['activity.total', 'mismatch'],
  ]);
  // A checker revision that predates the partial-round claims excuses those only.
  assert.deepEqual(results({ predatesRevision: true }), [
    ['matrix.mds', 'match'],
    ['sbox.differential', 'mismatch'],
    ['sbox.linearity', 'mismatch'],
    ['activity.partial', 'not recorded'],
    ['activity.total', 'not recorded'],
  ]);
  // Both kinds of evidence together excuse both groups.
  assert.deepEqual(
    results({ predatesRevision: true, olderCertificate: true }).map(([, r]) => r),
    ['match', 'not recorded', 'not recorded', 'not recorded', 'not recorded'],
  );
});
