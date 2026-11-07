import { describe, expect, it } from 'vitest';
import { BN254_P, compactBn, NEAR_P } from './bn254';
import { displayElement } from './field';

describe('compactBn', () => {
  it('keeps short values', () => {
    expect(compactBn('0')).toEqual({ text: '0', spoken: '0', short: false });
    expect(compactBn('123456789012')).toEqual({ text: '123456789012', spoken: '123456789012', short: false });
  });

  it('writes values just below p as p−k', () => {
    expect(compactBn((BN254_P - 1n).toString()).text).toBe('p−1');
    expect(compactBn((BN254_P - NEAR_P).toString()).spoken).toBe(`p minus ${NEAR_P}`);
  });

  it('keeps 6 leading and 4 trailing digits of other long values', () => {
    const v = (BN254_P - NEAR_P - 1n).toString();
    expect(compactBn(v)).toEqual({ text: `${v.slice(0, 6)}…${v.slice(-4)}`, spoken: v, short: true });
  });

  it('leaves text that is not an element alone', () => {
    expect(compactBn('-5').text).toBe('-5');
    expect(compactBn(BN254_P.toString()).short).toBe(false);
  });

  it('displayElement canonicalizes GF(2^8) cells and shortens BN254 ones', () => {
    expect(displayElement('gf256', '1b')).toEqual({ text: '1B', full: '1B', spoken: '1B', short: false });
    const d = displayElement('bn254', (BN254_P - 2n).toString());
    expect(d.text).toBe('p−2');
    expect(d.full).toBe((BN254_P - 2n).toString());
  });
});
