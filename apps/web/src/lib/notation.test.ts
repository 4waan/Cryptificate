import { describe, expect, it } from 'vitest';
import { BN254_P } from './bn254';
import { MATRIX_FORMATS, formatMatrix, normalizeCell, parseMatrixText } from './notation';
import { AES_MIXCOLUMNS } from './presets';

const INV = [
  ['0E', '0B', '0D', '09'],
  ['09', '0E', '0B', '0D'],
  ['0D', '09', '0E', '0B'],
  ['0B', '0D', '09', '0E'],
];

function ok(text: string, field: 'gf256' | 'bn254' = 'gf256', size?: number, radix?: 'auto' | 'hex' | 'dec') {
  const r = parseMatrixText(text, field, { size, radix });
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe('parseMatrixText, GF(2^8)', () => {
  it.each([
    ['whitespace grid', '02 03 01 01\n01 02 03 01\n01 01 02 03\n03 01 01 02'],
    ['comma grid with trailing commas', '02, 03, 01, 01,\n01, 02, 03, 01,\n01, 01, 02, 03,\n03, 01, 01, 02'],
    ['semicolon rows on one line', '02 03 01 01; 01 02 03 01; 01 01 02 03; 03 01 01 02'],
    ['flat line of 16', '02 03 01 01 01 02 03 01 01 01 02 03 03 01 01 02'],
    ['single digits', '2 3 1 1\n1 2 3 1\n1 1 2 3\n3 1 1 2'],
    ['C nested braces', '{{0x02,0x03,0x01,0x01},{0x01,0x02,0x03,0x01},{0x01,0x01,0x02,0x03},{0x03,0x01,0x01,0x02}}'],
    ['C declaration', 'static const uint8_t M[4][4] = {\n {0x02, 0x03, 0x01, 0x01},\n {0x01, 0x02, 0x03, 0x01},\n {0x01, 0x01, 0x02, 0x03},\n {0x03, 0x01, 0x01, 0x02}\n};'],
    ['C flat braces', '{0x02,0x03,0x01,0x01,0x01,0x02,0x03,0x01,0x01,0x01,0x02,0x03,0x03,0x01,0x01,0x02}'],
    ['Rust declaration with suffixes', 'const M: [[u8; 4]; 4] = [\n [0x02u8, 0x03, 0x01, 0x01],\n [0x01, 0x02, 0x03, 0x01],\n [1, 1, 2, 3],\n [3_u8, 1, 1, 2],\n];'],
    ['Python nested list', 'M = [[2, 3, 1, 1], [1, 2, 3, 1], [1, 1, 2, 3], [3, 1, 1, 2]]'],
    ['NumPy', 'np.array([[2,3,1,1],[1,2,3,1],[1,1,2,3],[3,1,1,2]], dtype=np.uint8)'],
    ['Sage with wrappers', 'F.<a> = GF(2^8)\nM = matrix(F, [[F.fetch_int(2), F.fetch_int(3), F(1), F(1)], [F(1), F(2), F(3), F(1)], [F(1), F(1), F(2), F(3)], [F(3), F(1), F(1), F(2)]])'],
    ['Sage flat list', 'matrix(GF(2^8), 4, 4, [2,3,1,1, 1,2,3,1, 1,1,2,3, 3,1,1,2])'],
    ['quoted JSON strings', '[["02","03","01","01"],["01","02","03","01"],["01","01","02","03"],["03","01","01","02"]]'],
    ['LaTeX pmatrix', '\\begin{pmatrix} 02 & 03 & 01 & 01 \\\\ 01 & 02 & 03 & 01 \\\\ 01 & 01 & 02 & 03 \\\\ 03 & 01 & 01 & 02 \\end{pmatrix}'],
  ])('reads %s', (_, text) => {
    expect(ok(text, 'gf256', 4).matrix).toEqual(AES_MIXCOLUMNS);
  });

  it('reads hex with letters in any case and normalizes to uppercase', () => {
    expect(ok('0e 0B 0d 09\n09 0e 0b 0d\n0d 09 0e 0b\n0b 0d 09 0e').matrix).toEqual(INV);
  });

  it('reads bare numbers in code as decimal and says so when it matters', () => {
    const r = ok('[[14, 11, 13, 9], [9, 14, 11, 13], [13, 9, 14, 11], [11, 13, 9, 14]]');
    expect(r.matrix).toEqual(INV);
    expect(r.radix).toBe('dec');
    expect(r.ambiguous).toBe(true);
    expect(r.notes.join(' ')).toMatch(/decimal/);
  });

  it('reads bare numbers in a plain grid as hex and lets the caller override', () => {
    const r = ok('10 20\n30 40');
    expect(r.matrix).toEqual([
      ['10', '20'],
      ['30', '40'],
    ]);
    expect(r.ambiguous).toBe(true);
    expect(ok('10 20\n30 40', 'gf256', 2, 'dec').matrix).toEqual([
      ['0A', '14'],
      ['1E', '28'],
    ]);
    expect(ok('[[16, 32], [48, 64]]', 'gf256', 2, 'hex').matrix[0]).toEqual(['16', '32']);
  });

  it('treats hex letters anywhere as a hex matrix even inside code', () => {
    expect(ok('[[0e, 0b], [0d, 09]]').matrix).toEqual([
      ['0E', '0B'],
      ['0D', '09'],
    ]);
  });

  it('round-trips every export format', () => {
    for (const { id } of MATRIX_FORMATS) {
      for (const m of [AES_MIXCOLUMNS, INV]) {
        const text = formatMatrix(m, 'gf256', id);
        expect(ok(text, 'gf256', 4).matrix, `${id}\n${text}`).toEqual(m);
      }
    }
  });

  it.each([
    ['', /Nothing/],
    ['02 03\n01', /Row 2 has 1 entry/],
    ['02 03 01\n01 02 03\n01 01', /Row 3 has 2 entries/],
    ['02 GG\n01 02', /Row 1, column 2: “GG” is not a hex byte/],
    ['0x100 01\n01 02', /larger than FF/],
    ['[[256, 1], [1, 2]]', /larger than FF/],
    ['[[2, 3, 1], [1, 2]]', /Row 2 has 2 entries/],
    ['{{0x02, 0x03}, {0x01, 0x02}', /not closed/],
    ['[0x02, 0x03, 0x01]', /Found a list of 3 values/],
    ['-1 0\n0 1', /negative|not a hex/],
  ])('rejects %j with a clear message', (text, message) => {
    const r = parseMatrixText(text, 'gf256');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(message);
  });

  it('points at the offending cell', () => {
    const r = parseMatrixText('02 03\n01 zz', 'gf256');
    expect(r.ok === false && r.at).toEqual({ row: 1, col: 1 });
  });

  it('checks the expected size', () => {
    const r = parseMatrixText('02 03\n01 02', 'gf256', { size: 4 });
    expect(r.ok === false && r.error).toMatch(/Found 2 rows; expected 4/);
  });
});

describe('parseMatrixText, BN254', () => {
  it('reads decimals, hex and negatives modulo p', () => {
    const r = ok('[[2, 1, 1], [1, 0x02, 1], [1, 1, -1]]', 'bn254', 3);
    expect(r.matrix).toEqual([
      ['2', '1', '1'],
      ['1', '2', '1'],
      ['1', '1', (BN254_P - 1n).toString()],
    ]);
    expect(r.notes.join(' ')).toMatch(/modulo p/);
  });
  it('rejects values at or above p', () => {
    const r = parseMatrixText(`${BN254_P} 1\n1 1`, 'bn254');
    expect(r.ok === false && r.error).toMatch(/modulus/);
  });
  it('round-trips every export format', () => {
    const m = [
      ['2', '1', '1'],
      ['1', '2', '1'],
      ['1', '1', (BN254_P - 5n).toString()],
    ];
    for (const { id } of MATRIX_FORMATS) expect(ok(formatMatrix(m, 'bn254', id), 'bn254', 3).matrix, id).toEqual(m);
  });
});

describe('normalizeCell', () => {
  it.each([
    ['1', '01'],
    ['a', '0A'],
    ['0x1b', '1B'],
    ['1b', '1B'],
    [' ff ', 'FF'],
    ['0X0', '00'],
  ])('GF(2^8) %j -> %j', (input, out) => expect(normalizeCell(input, 'gf256')).toBe(out));
  it.each(['', '100', 'g', '0x100', '-1'])('GF(2^8) rejects %j', (input) => expect(normalizeCell(input, 'gf256')).toBeNull());
  it('BN254 strips leading zeros, reads hex and reduces negatives', () => {
    expect(normalizeCell('007', 'bn254')).toBe('7');
    expect(normalizeCell('0x10', 'bn254')).toBe('16');
    expect(normalizeCell('-1', 'bn254')).toBe((BN254_P - 1n).toString());
    expect(normalizeCell('1.5', 'bn254')).toBeNull();
  });
});

describe('formatMatrix', () => {
  it('writes C, Rust and Sage literals', () => {
    expect(formatMatrix([['02', '03'], ['01', '02']], 'gf256', 'c')).toBe(
      'static const uint8_t M[2][2] = {\n    {0x02, 0x03},\n    {0x01, 0x02}\n};',
    );
    expect(formatMatrix([['02', '03'], ['01', '02']], 'gf256', 'rust')).toBe(
      'const M: [[u8; 2]; 2] = [\n    [0x02, 0x03],\n    [0x01, 0x02],\n];',
    );
    const sage = formatMatrix([['02', '03'], ['01', '02']], 'gf256', 'sage');
    expect(sage).toContain('modulus=x^8 + x^4 + x^3 + x + 1');
    expect(sage).toContain('[e(0x02), e(0x03)]');
    expect(JSON.parse(formatMatrix([['02', '03'], ['01', '02']], 'gf256', 'json'))).toEqual([
      ['02', '03'],
      ['01', '02'],
    ]);
  });
});

describe('the 64-bit prime fields', () => {
  const KB = 'prime:2130706433' as const; // KoalaBear, 2^31 - 2^24 + 1
  it('reads decimals below p and reduces negative entries modulo p', () => {
    const r = parseMatrixText('[[2, 1, 1], [1, 2, 1], [1, 1, -1]]', KB, { size: 3 });
    expect(r.ok && r.matrix).toEqual([
      ['2', '1', '1'],
      ['1', '2', '1'],
      ['1', '1', '2130706432'],
    ]);
    expect(r.ok && r.notes).toContain('Negative entries were reduced modulo p.');
    const big = parseMatrixText('2130706433 0\n0 1', KB, { size: 2 });
    expect(big.ok ? null : big.error).toBe('Row 1, column 1: “2130706433” is not below the field modulus p.');
  });
  it('normalizes cells modulo p', () => {
    expect(normalizeCell('-1', KB)).toBe('2130706432');
    expect(normalizeCell('0x10', KB)).toBe('16');
    expect(normalizeCell('2130706433', KB)).toBeNull();
  });
  it('writes u64 literals for C and Rust, GF(p) for Sage, and reads every format back', () => {
    const m = [
      ['5', '7'],
      ['2130706432', '1'],
    ];
    expect(formatMatrix(m, KB, 'c', 'M')).toContain('static const uint64_t M[2][2] = {\n    {5ULL, 7ULL},');
    expect(formatMatrix(m, KB, 'rust', 'M')).toContain('const M: [[u64; 2]; 2] = [\n    [5, 7],');
    expect(formatMatrix(m, KB, 'sage', 'M')).toContain('p = 2130706433\nF = GF(p)');
    for (const f of MATRIX_FORMATS) {
      const back = parseMatrixText(formatMatrix(m, KB, f.id, 'M'), KB, { size: 2 });
      expect(back.ok && back.matrix, f.id).toEqual(m);
    }
  });
});
