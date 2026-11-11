import { describe, expect, it } from 'vitest';
import { inputsDigest } from './canonical';
import { nonInjectiveSbox } from './library';
import { aesDesign, aesSharedSum, hadesDesign, hadesSharedSum, primeDesign } from './presets';
import { MAX_DECODED_BYTES, MAX_TOKEN_LENGTH, decodeShare, encodeShare, shareUrl } from './share';
import type { Snapshot } from './snapshot';

const b64url = (text: string) => btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return b64url(bin);
}

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
    ['not JSON', `j${btoa('hello').replace(/=+$/, '')}`, /^The link is damaged: its contents are not valid JSON\.$/],
    ['a request without a design', `j${btoa('{"program":{}}').replace(/=+$/, '')}`, /^The link does not contain a design\.$/],
    ['a bare circuit', `j${b64url(JSON.stringify(aesSharedSum()))}`, /^The link does not contain a design\.$/],
    ['a JSON array', `j${b64url('[1, 2]')}`, /does not contain a design/],
    ['an overly long token', `j${'A'.repeat(MAX_TOKEN_LENGTH)}`, /too long/],
  ])('rejects %s', async (_, token, message) => {
    await expect(decodeShare(token)).rejects.toThrow(message);
  });

  it('rejects a well-formed request whose design does not validate', async () => {
    const bad = JSON.stringify({ design: { ...aesDesign(), rounds: 99 } });
    const token = `j${btoa(bad).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
    await expect(decodeShare(token)).rejects.toThrow(/Rounds/);
  });

  it('ends a wrapped import error with a single period', async () => {
    const token = `j${b64url(JSON.stringify({ design: { model: 'nope' } }))}`;
    const err = await decodeShare(token).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/^The link does not hold a valid request: /);
    expect((err as Error).message).not.toMatch(/\.\.$|\.\)\.$/);
  });

  it('rejects a compressed token that inflates past the size limit', async () => {
    // A small token (a "deflate bomb") that would decompress to several megabytes.
    const huge = new TextEncoder().encode(' '.repeat(MAX_DECODED_BYTES * 40));
    const token = `z${bytesToB64url(await deflate(huge))}`;
    expect(token.length).toBeLessThan(MAX_TOKEN_LENGTH);
    await expect(decodeShare(token)).rejects.toThrow(/too large/);
  });

  it('accepts a compressed token just under the size limit when it holds a request', async () => {
    const text = JSON.stringify({ design: aesDesign(), program: aesSharedSum(), target: 'matrix' });
    const padded = text + ' '.repeat(MAX_DECODED_BYTES - text.length - 1);
    const token = `z${bytesToB64url(await deflate(new TextEncoder().encode(padded)))}`;
    const back = await decodeShare(token);
    expect(inputsDigest(back)).toBe(inputsDigest(aes));
  });

  it('builds a workspace URL', () => {
    expect(shareUrl('https://example.org/app/', 'jABC')).toBe('https://example.org/app/#/workspace?d=jABC');
  });
});

describe('share links for the prime-field profile', () => {
  it('round-trips a custom-prime design without a circuit', async () => {
    const s: Snapshot = { design: primeDesign('prime', '18446744073709551557'), program: null, target: 'external' };
    for (const compress of [true, false]) {
      const back = await decodeShare(await encodeShare(s, compress));
      // The link carries the normalized request: unstated round constants read as unspecified.
      expect(back.design).toEqual({ constants: { kind: 'unspecified' }, ...s.design });
      expect(back.program).toBeNull();
    }
  });
});
