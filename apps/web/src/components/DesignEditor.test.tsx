import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { primeDesign, primeDesign3, primeDesignWide } from '../lib/presets';
import { DesignEditor } from './DesignEditor';

describe('DesignEditor over a prime field', () => {
  it('offers the named fields, a custom prime and the Poseidon2 widths', () => {
    const html = renderToStaticMarkup(<DesignEditor design={primeDesign('koalabear')} target="external" />);
    for (const label of ['HADES, 64-bit prime', 'BabyBear', 'KoalaBear', 'Mersenne31', 'Goldilocks', 'Custom prime', 't = 2', 't = 3', 't = 4', 't = 8', 't = 12', 't = 16', 't = 24']) {
      expect(html).toContain(label);
    }
    expect(html).toContain('p = 2130706433');
    expect(html).toContain('p − 1 = 2^24 · 127');
    // No circuit target over this field.
    expect(html).not.toContain('The circuit implements');
    expect(html).toContain('unspecified (every claim holds for all round constants)');
  });

  it('offers the Plonky3 instances of the field and says what a wide design checks', () => {
    const html = renderToStaticMarkup(<DesignEditor design={primeDesignWide('babybear', 16)} target="external" />);
    expect(html).toContain('Plonky3 instances');
    expect(html).toContain('BabyBear t = 16');
    expect(html).toContain('BabyBear t = 24');
    expect(html).toContain('0d803737b681');
    expect(html).toContain('does not state the full-round activity bounds');
    const custom = renderToStaticMarkup(<DesignEditor design={primeDesign3('prime', '18446744073709551557')} target="external" />);
    expect(custom).not.toContain('Plonky3 instances');
  });

  it('reports a composite custom modulus while typing', () => {
    const html = renderToStaticMarkup(<DesignEditor design={primeDesign3('prime', '2013265923')} target="external" />);
    expect(html).toContain('2013265923 is not prime.');
    expect(html).toContain('aria-invalid="true"');
  });
});
