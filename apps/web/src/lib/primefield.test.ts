import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inputsDigest, normalizeDesign } from './canonical';
import { validateDesign } from './design';
import { displayFieldOf, fieldOps } from './field';
import { parseImport } from './importer';
import {
  diagonalEntry,
  PLONKY3_PRESETS,
  plonky3Design,
  poseidon2External,
  primeDesign,
  primeDesign3,
  primeDesignWide,
} from './presets';
import { previewDesign } from './preview';
import { isPrime64, modulusOf, modulusProblem } from './primefield';
import type { CandidateDesign, HadesPrimeDesign } from './types';
import { describeWitness, signedDecimal } from './witness';

const root = new URL('../../../../', import.meta.url);

function example(name: string): CandidateDesign {
  return JSON.parse(readFileSync(new URL(`examples/designs/${name}.json`, root), 'utf8')) as CandidateDesign;
}

describe('prime-field profile', () => {
  it('tests primality below 2^64 as the engine does', () => {
    for (const p of [2n, 3n, 2013265921n, 2130706433n, 2147483647n, 18446744069414584321n, 18446744073709551557n]) {
      expect(isPrime64(p), p.toString()).toBe(true);
    }
    for (const n of [0n, 1n, 4n, 3215031751n, 3825123056546413051n, 2013265923n, 18446744073709551615n, 2n ** 64n]) {
      expect(isPrime64(n), n.toString()).toBe(false);
    }
    expect(modulusProblem('2013265923')).toBe('2013265923 is not prime.');
    expect(modulusProblem('18446744073709551616')).toBe('The modulus must be below 2^64.');
    expect(modulusProblem('07')).toMatch(/leading zeros/);
    expect(modulusProblem('101')).toBeNull();
  });

  it('computes modulo the design modulus', () => {
    const d = primeDesign('babybear');
    expect(modulusOf(d)).toBe(2013265921n);
    expect(displayFieldOf(d)).toBe('prime:2013265921');
    const f = fieldOps(displayFieldOf(d));
    expect(f.neg('1')).toBe('2013265920');
    expect(f.mul('2013265920', '2013265920')).toBe('1');
    expect(f.isValid('2013265921')).toBe(false);
    expect(f.inv('2')).toBe('1006632961');
    expect(signedDecimal('2013265920', 'prime:2013265921')).toBe('-1');
    expect(signedDecimal('5', 'prime:2013265921')).toBe('5');
  });

  it('normalizes like the engine', () => {
    const d = example('koalabear-t4');
    expect(normalizeDesign(d)).toMatchObject({ modulus: '2130706433', constants: { kind: 'unspecified' } });
    // The digest of {"design": D}, with D the design that `cryptificate-engine validate`
    // returns for examples/designs/koalabear-t4.json (the engine's own digest also
    // covers the normalized target).
    expect(inputsDigest({ design: d })).toBe('sha256:5cd327568bbdc1e725c74e35ee9e93732531eea59babacf640071854f6cc0513');
  });

  it('validates the field, the custom modulus and the width', () => {
    expect(validateDesign(example('koalabear-t4'))).toEqual([]);
    expect(validateDesign(primeDesign3('goldilocks'))).toEqual([]);
    const custom: HadesPrimeDesign = { ...primeDesign('prime', '2013265923') };
    expect(validateDesign(custom).map((i) => i.path)).toEqual(['/modulus']);
    const small: HadesPrimeDesign = { ...primeDesign('prime', '7') };
    expect(validateDesign(small).map((i) => i.path)).toContain('/external/0/1');
    const mask: HadesPrimeDesign = { ...primeDesign('mersenne31'), partialMask: [false, false, false, false] };
    expect(validateDesign(mask).map((i) => i.path)).toEqual(['/partialMask']);
  });

  it('previews the claims in the browser, unchecked', () => {
    const bad = previewDesign(example('babybear-t4-bad'));
    expect(bad.map((i) => [i.id, i.outcome])).toEqual([
      ['field.prime', 'holds'],
      ['external.mds', 'holds'],
      ['internal.invertible', 'holds'],
      ['sbox.bijective', 'fails'],
    ]);
    expect(bad[0]!.title).toBe('Modulus is prime');
    expect(previewDesign(example('koalabear-t4')).find((i) => i.id === 'external.mds')?.title).toBe(
      'External matrix is MDS (branch number 5)',
    );
  });

  it('imports a bare prime-field design', () => {
    const imported = parseImport(readFileSync(new URL('examples/designs/babybear-t4.json', root), 'utf8'));
    expect(imported.design?.model).toBe('hades/prime/v1');
    expect(imported.design && 'partialMask' in imported.design ? imported.design.partialMask : null).toEqual([
      true,
      false,
      false,
      false,
    ]);
  });

  it('describes a bypass with signed coordinates modulo p', () => {
    const text = describeWitness(
      { kind: 'partial-bypass', difference: ['0', '1', '2013265920', '0'], positions: [0], partialRounds: 13 },
      'prime:2013265921',
    );
    expect(text).toContain('[0, 1, -1, 0]');
  });
});

describe('Poseidon2 widths 2, 8, 12, 16 and 24', () => {
  it('builds the Plonky3 instances exactly as the repository examples state them', () => {
    expect(PLONKY3_PRESETS).toHaveLength(8);
    for (const preset of PLONKY3_PRESETS) {
      const p = modulusOf({ ...primeDesign(preset.field) })!;
      const name = `${preset.field}-t${preset.width}`;
      expect(plonky3Design(preset, p), name).toEqual(example(name));
      expect(validateDesign(plonky3Design(preset, p)), name).toEqual([]);
    }
  });

  it('reads diagonal entries as Plonky3 writes them', () => {
    const p = 2013265921n;
    expect(diagonalEntry('-2', p)).toBe('2013265919');
    expect(diagonalEntry('1/2', p)).toBe(((p + 1n) / 2n).toString());
    // 2^27 * (1/2^27) = 1 and -1/16 + 1/16 = 0 modulo p.
    expect((BigInt(diagonalEntry('1/2^27', p)) * 2n ** 27n) % p).toBe(1n);
    expect((BigInt(diagonalEntry('-1/16', p)) + BigInt(diagonalEntry('1/16', p))) % p).toBe(0n);
    expect(diagonalEntry('2^7', 2147483647n)).toBe('128');
  });

  it('builds circ(2 M4, M4, …, M4)', () => {
    const e = poseidon2External(8);
    expect(e[0]).toEqual(['4', '6', '2', '2', '2', '3', '1', '1']);
    expect(e[5]).toEqual(['1', '2', '3', '1', '2', '4', '6', '2']);
    expect(poseidon2External(2)).toEqual([
      ['2', '1'],
      ['1', '2'],
    ]);
  });

  it('previews the wide external claims without enumerating minors', () => {
    const d = plonky3Design(PLONKY3_PRESETS.find((x) => x.field === 'babybear' && x.width === 24)!, 2013265921n);
    const items = previewDesign(d);
    const by = (id: string) => items.find((i) => i.id === id)!;
    expect(items.map((i) => i.id)).toEqual([
      'field.prime',
      'external.mds',
      'external.m4_mds',
      'external.invertible',
      'internal.invertible',
      'sbox.bijective',
    ]);
    // A singular 2 x 2 submatrix: weight 2 in, at most t - 2 out.
    expect(by('external.mds').outcome).toBe('fails');
    expect(by('external.mds').witness).toMatchObject({ kind: 'branch', inputWeight: 2, bound: 25 });
    expect(by('external.m4_mds').outcome).toBe('holds');
    expect(by('external.invertible').outcome).toBe('holds');
    expect(by('internal.invertible').outcome).toBe('holds');
    // Width two keeps the minors.
    const w2 = previewDesign(primeDesignWide('mersenne31', 2));
    expect(w2.find((i) => i.id === 'external.mds')!.outcome).toBe('holds');
    expect(w2.some((i) => i.id === 'external.m4_mds')).toBe(false);
  });

  it('accepts the wide widths and rejects the others', () => {
    for (const w of [2, 8, 12, 16, 24] as const) {
      expect(validateDesign(primeDesignWide('goldilocks', w)), `width ${w}`).toEqual([]);
    }
    const bad = { ...primeDesignWide('goldilocks', 8), width: 6 } as unknown as HadesPrimeDesign;
    expect(validateDesign(bad).map((i) => i.path)).toEqual(['/width']);
    expect(parseImport(JSON.stringify(example('goldilocks-t12'))).design).toMatchObject({ width: 12 });
    expect(() => parseImport(JSON.stringify(bad))).toThrow(/expected one of 2, 3, 4, 8, 12, 16, 24/);
  });
});
