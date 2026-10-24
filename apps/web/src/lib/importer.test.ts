import { describe, expect, it } from 'vitest';
import { parseImport } from './importer';
import { aesDesign, aesSharedSum, hadesDesign, hadesSharedSum } from './presets';

describe('JSON import', () => {
  it('round-trips requests, designs and programs', () => {
    const req = { design: aesDesign(), program: aesSharedSum(), target: 'matrix' };
    expect(parseImport(JSON.stringify(req))).toEqual(req);
    expect(parseImport(JSON.stringify(hadesDesign()))).toEqual({ design: hadesDesign() });
    expect(parseImport(JSON.stringify(hadesSharedSum()))).toEqual({ program: hadesSharedSum() });
    expect(parseImport(JSON.stringify({ design: aesDesign() }))).toEqual({ design: aesDesign(), program: null });
  });

  it('reports the path of a malformed value', () => {
    const bad = aesDesign() as unknown as { matrix: unknown[] };
    bad.matrix[1] = [2, 3, 1, 1];
    expect(() => parseImport(JSON.stringify({ design: bad }))).toThrow('/design/matrix/1/0');
    expect(() => parseImport('{"field":"gf256","width":4,"instructions":[{"op":"sub","a":0,"b":1}],"outputs":[]}')).toThrow(
      '/instructions/0/op',
    );
    expect(() => parseImport('not json')).toThrow('not valid JSON');
  });
});
