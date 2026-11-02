import { describe, expect, it } from 'vitest';
import { inputsDigest } from './canonical';
import { nonInjectiveSbox } from './library';
import { aesDesign, aesSharedSum, hadesDesign, hadesSharedSum } from './presets';
import { MAX_TOKEN_LENGTH, decodeShare, encodeShare, shareUrl } from './share';
import type { Snapshot } from './snapshot';

const aes: Snapshot = { design: aesDesign(), program: aesSharedSum(), target: 'matrix' };

describe('share links', () => {
  it.each([true, false])('round-trip and keep the inputs digest (compressed: %s)', async (compress) => {
    for (const s of [
      aes,
      { design: hadesDesign(5), program: hadesSharedSum(), target: 'internal' as const },
      { design: { ...aesDesign(), sbox: { kind: 'table' as const, table: nonInjectiveSbox() } }, program: null, target: 'matrix' as const },
    ]) {
      const token = await encodeShare(s, compress);
      expect(token).toMatch(compress ? /^[zj][A-Za-z0-9_-]+$/ : /^j[A-Za-z0-9_-]+$/);
      const back = await decodeShare(token);
      expect(inputsDigest(back)).toBe(inputsDigest(s));
      expect(back.target).toBe(s.program ? s.target : back.target);
    }
  });

  it('normalizes cells on the way out', async () => {
    const d = aesDesign();
    d.matrix[0]![0] = '02';
    d.matrix[1]![1] = '02';
    const back = await decodeShare(await encodeShare({ ...aes, design: d }));
    expect(back.design.model === 'aes-like/gf256/v1' && back.design.matrix).toEqual(aesDesign().matrix);
  });

  it('compresses a full S-box table well below the raw size', async () => {
    const s = { design: { ...aesDesign(), sbox: { kind: 'table' as const, table: nonInjectiveSbox() } }, program: aesSharedSum(), target: 'matrix' as const };
    const z = await encodeShare(s, true);
    const j = await encodeShare(s, false);
    expect(z.startsWith('z')).toBe(true);
    expect(z.length).toBeLessThan(j.length * 0.8);
  });

  it('refuses to share inputs with problems', async () => {
    const d = aesDesign();
    d.matrix[0]![0] = 'zz';
    await expect(encodeShare({ ...aes, design: d })).rejects.toThrow(/Fix the inputs/);
  });

  it.each([
    ['an unknown prefix', 'xabc', /not a Cryptificate share link/],
    ['bad characters', 'j$$$', /characters/],
    ['damaged compressed data', 'zAAAA', /damaged/],
    ['not JSON', `j${btoa('hello').replace(/=+$/, '')}`, /valid request/],
    ['a request without a design', `j${btoa('{"program":{}}').replace(/=+$/, '')}`, /valid request|design/],
    ['an overly long token', `j${'A'.repeat(MAX_TOKEN_LENGTH)}`, /too long/],
  ])('rejects %s', async (_, token, message) => {
    await expect(decodeShare(token)).rejects.toThrow(message);
  });

  it('rejects a well-formed request whose design does not validate', async () => {
    const bad = JSON.stringify({ design: { ...aesDesign(), rounds: 99 } });
    const token = `j${btoa(bad).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
    await expect(decodeShare(token)).rejects.toThrow(/Rounds/);
  });

  it('builds a workspace URL', () => {
    expect(shareUrl('https://example.org/app/', 'jABC')).toBe('https://example.org/app/#/workspace?d=jABC');
  });
});
