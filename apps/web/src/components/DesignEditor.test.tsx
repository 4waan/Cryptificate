import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { primeDesign, primeDesign3 } from '../lib/presets';
import { DesignEditor } from './DesignEditor';

describe('DesignEditor over a prime field', () => {
  it('offers the named fields, a custom prime and widths 3 and 4', () => {
    const html = renderToStaticMarkup(<DesignEditor design={primeDesign('koalabear')} target="external" />);
    for (const label of ['HADES, 64-bit prime', 'BabyBear', 'KoalaBear', 'Mersenne31', 'Goldilocks', 'Custom prime', 't = 3', 't = 4']) {
      expect(html).toContain(label);
    }
    expect(html).toContain('p = 2130706433');
    expect(html).toContain('p − 1 = 2^24 · 127');
    // No circuit target over this field.
    expect(html).not.toContain('The circuit implements');
    expect(html).toContain('unspecified (every claim holds for all round constants)');
  });

  it('reports a composite custom modulus while typing', () => {
    const html = renderToStaticMarkup(<DesignEditor design={primeDesign3('prime', '2013265923')} target="external" />);
    expect(html).toContain('2013265923 is not prime.');
    expect(html).toContain('aria-invalid="true"');
  });
});
