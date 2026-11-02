import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Claim, ClaimId } from '@cryptificate/schema';
import { compareClaims } from '../src/verify.js';

function claim(id: ClaimId, status: Claim['status']): Claim {
  return { id, chain: 'design', title: id, status, evidence: { kind: 'lean', label: 'Lean-checked proof' }, witness: null, note: '' };
}

test('a bundle recorded before the S-box quality claims still verifies', () => {
  const recorded = [claim('matrix.mds', 'proved')];
  const now = [claim('matrix.mds', 'proved'), claim('sbox.differential', 'proved'), claim('sbox.linearity', 'proved')];
  const rows = compareClaims('design', recorded, now, false);
  assert.deepEqual(
    rows.map((r) => [r.claim, r.recorded, r.recomputed, r.result]),
    [
      ['matrix.mds', 'proved', 'proved', 'match'],
      ['sbox.differential', 'missing', 'proved', 'not recorded'],
      ['sbox.linearity', 'missing', 'proved', 'not recorded'],
    ],
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
