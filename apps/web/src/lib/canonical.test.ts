import { describe, expect, it } from 'vitest';
import { canonicalJson, digestOf, inputsDigest, isStale, normalizeAnalysisRequest } from './canonical';
import { aesDesign, aesSharedSum, hadesDesign, hadesSharedSum, miswiredSharedSum } from './presets';
import { sha256Hex } from './sha256';

describe('sha256', () => {
  it('matches the standard test vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });
});

describe('canonicalJson', () => {
  it('sorts keys at every level and drops undefined members', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: undefined } })).toBe(
      '{"a":{"d":[3,{"x":2,"y":1}]},"b":1}',
    );
  });
  it('gives equal digests for equal meaning', () => {
    expect(digestOf({ a: 1, b: 2 })).toBe(digestOf({ b: 2, a: 1 }));
    expect(digestOf({ a: 1 })).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe('normalization', () => {
  it('uppercases GF(2^8) elements and fills in the default target', () => {
    const design = aesDesign();
    design.matrix[0] = ['02', '03', '01', '0a'];
    const req = normalizeAnalysisRequest({ design, program: aesSharedSum() });
    expect(req.design.model === 'aes-like/gf256/v1' && req.design.matrix[0]).toEqual(['02', '03', '01', '0A']);
    expect(req.target).toBe('matrix');
    expect(normalizeAnalysisRequest({ design: hadesDesign(), program: hadesSharedSum() }).target).toBe('external');
  });
  it('keeps the program name for requests but not for the semantic digest', () => {
    const named = normalizeAnalysisRequest({ design: aesDesign(), program: aesSharedSum() });
    expect(named.program?.name).toBe('aes-shared-sum');
    const semantic = normalizeAnalysisRequest({ design: aesDesign(), program: aesSharedSum() }, true);
    expect(semantic.program?.name).toBeUndefined();
  });
});

describe('staleness', () => {
  const base = { design: aesDesign(), program: aesSharedSum() };

  it('is fresh for the same inputs, including case and name differences', () => {
    const lower = aesDesign();
    lower.matrix = lower.matrix.map((r) => r.map((x) => x.toLowerCase()));
    expect(isStale({ design: lower, program: { ...aesSharedSum(), name: 'renamed' } }, base)).toBe(false);
    expect(isStale(base, { ...base, target: 'matrix' })).toBe(false);
  });

  it('turns stale when any matrix entry changes', () => {
    const edited = aesDesign();
    edited.matrix[2]![3] = '04';
    expect(isStale({ ...base, design: edited }, base)).toBe(true);
  });

  it('turns stale when a wire changes', () => {
    expect(isStale({ ...base, program: miswiredSharedSum() }, base)).toBe(true);
  });

  it('turns stale for rounds, offsets and S-box changes', () => {
    expect(isStale({ ...base, design: aesDesign(10) }, base)).toBe(true);
    expect(isStale({ ...base, design: { ...aesDesign(), offsets: [0, 1, 1, 3] } }, base)).toBe(true);
    const table = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
    expect(isStale({ ...base, design: { ...aesDesign(), sbox: { kind: 'table', table } } }, base)).toBe(true);
  });

  it('turns stale when the program is removed or the target changes', () => {
    expect(isStale({ design: base.design }, base)).toBe(true);
    const h = { design: hadesDesign(), program: hadesSharedSum() };
    expect(isStale({ ...h, target: 'internal' }, h)).toBe(true);
  });

  it('treats unparsable inputs and missing results as stale', () => {
    const bad = aesDesign();
    bad.matrix[0]![0] = 'zz';
    expect(inputsDigest({ design: bad })).toBeNull();
    expect(isStale({ design: bad }, { design: bad })).toBe(true);
    expect(isStale(base, null)).toBe(true);
  });
});
