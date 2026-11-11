import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BN254_P } from '../lib/bn254';
import { aesDesign, primeDesign } from '../lib/presets';
import { circuitFromDesign, describeCells } from './ComputedMatrix';
import { MatrixView, pastedCells, planCellPaste } from './MatrixEditor';

const P_MINUS = (k: bigint) => (BN254_P - k).toString();

describe('pastedCells', () => {
  it('reads tab-separated spreadsheet rows', () => {
    expect(pastedCells('02\t03\t01\t01\r\n01\t02\t03\t01\r\n', 'gf256')).toEqual(['02', '03', '01', '01', '01', '02', '03', '01']);
  });

  it('strips quotes and normalizes each value', () => {
    expect(pastedCells(`"02", "0x1b", '3'`, 'gf256')).toEqual(['02', '1B', '03']);
    expect(pastedCells('[0x02; 0x03]', 'gf256')).toEqual(['02', '03']);
  });

  it('reduces BN254 negatives modulo p', () => {
    expect(pastedCells('-1 5 -2', 'bn254')).toEqual([P_MINUS(1n), '5', P_MINUS(2n)]);
  });

  it('refuses text with a value that is not an element', () => {
    expect(pastedCells('02 zz', 'gf256')).toBeNull();
    expect(pastedCells('100', 'gf256')).toBeNull();
    expect(pastedCells('1 2.5', 'bn254')).toBeNull();
    expect(pastedCells(' \n\t', 'gf256')).toBeNull();
  });
});

describe('planCellPaste', () => {
  it('fills from the focused cell when the run fits', () => {
    expect(planCellPaste(['01', '02', '03'], 0, 4)).toBe('fits');
    expect(planCellPaste(['01', '02', '03'], 13, 4)).toBe('fits'); // row 4, column 2: ends on the last cell
  });

  it('reports a run that would pass the last cell', () => {
    // "01 02 03" pasted into row 4, column 3 of a 4×4 matrix.
    expect(planCellPaste(['01', '02', '03'], 14, 4)).toBe('overflows');
  });

  it('leaves full-matrix-sized text and unreadable text to the matrix parser', () => {
    expect(planCellPaste(Array(16).fill('01'), 5, 4)).toBe('none');
    expect(planCellPaste(Array(20).fill('01'), 0, 4)).toBe('none');
    expect(planCellPaste(null, 0, 4)).toBe('none');
  });
});

describe('BN254 values in read-only matrices', () => {
  const big = '12345678901234567890123456789';

  it('shows p−1 for -1 and keeps the full value for tooltips and screen readers', () => {
    const html = renderToStaticMarkup(
      <MatrixView values={[[P_MINUS(1n), '2'], [big, '0']]} label="Target" field="bn254" emphasis={['0,0']} />,
    );
    expect(html).toContain(`title="${P_MINUS(1n)}"`);
    expect(html).toContain('<span aria-hidden="true">p−1</span><span class="visually-hidden">p minus 1</span>');
    expect(html).toContain('<span aria-hidden="true">123456…6789</span>');
    expect(html).toContain(`<span class="visually-hidden">${big}</span>`);
    // Short values are printed as they are; no 77-digit run is visible.
    expect(html).toMatch(/role="cell"[^>]*>2</);
    const visible = html.replace(/<span class="visually-hidden">[^<]*<\/span>/g, '').replace(/title="[^"]*"/g, '');
    expect(visible).not.toMatch(/\d{13,}/);
  });

  it('shortens values in the diff summary', () => {
    const text = describeCells([{ row: 0, col: 0, want: P_MINUS(1n), got: '2' }, { row: 1, col: 0, want: big, got: P_MINUS(5n) }], 'bn254');
    expect(text).toBe('(1, 1) needs p−1, gets 2; (2, 1) needs 123456…6789, gets p−5');
  });

  it('leaves GF(2^8) cells unchanged', () => {
    expect(describeCells([{ row: 0, col: 1, want: '03', got: '01' }], 'gf256')).toBe('(1, 2) needs 03, gets 01');
  });
});

describe('circuit from matrix', () => {
  it('generates a circuit over GF(2^8) and offers none over the 64-bit prime fields', () => {
    expect(circuitFromDesign(aesDesign(), 'matrix')?.field).toBe('gf256');
    expect(circuitFromDesign(primeDesign('koalabear'), 'external')).toBeNull();
  });
  it('shows prime-field values whole', () => {
    expect(describeCells([{ row: 0, col: 0, want: '2130706432', got: '1' }], 'prime:2130706433')).toBe('(1, 1) needs 2130706432, gets 1');
  });
});
