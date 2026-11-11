import { describe, expect, it } from 'vitest';
import { aesSbox } from './gf256';
import { differentialUniformity, linearity } from './sboxQuality';

describe('S-box quality', () => {
  it('gives the AES values and the witnesses the Lean library states', () => {
    expect(differentialUniformity(aesSbox())).toEqual({
      kind: 'sbox-differential',
      uniformity: 4,
      inputDifference: '01',
      outputDifference: '1F',
    });
    expect(linearity(aesSbox())).toEqual({ kind: 'sbox-linearity', linearity: 32, inputMask: '01', outputMask: '48' });
  });

  it('sees an edited AES table lose its differential uniformity', () => {
    const t = [...aesSbox()];
    [t[0], t[1]] = [t[1]!, t[0]!];
    expect(differentialUniformity(t)).toMatchObject({ uniformity: 6, inputDifference: 'BC', outputDifference: '19' });
    expect(linearity(t).linearity).toBe(32);
  });

  it('gives 256 for a linear map', () => {
    const rotl = Array.from({ length: 256 }, (_, x) => ((x << 1) | (x >> 7)) & 0xff);
    expect(differentialUniformity(rotl).uniformity).toBe(256);
    expect(linearity(rotl).linearity).toBe(256);
  });
});
