import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Claim } from '../lib/types';
import { powerPreview } from '../lib/preview';
import { describeWitness } from '../lib/witness';
import { ClaimCard, PreviewCard } from './ClaimCard';
import { WitnessView } from './WitnessView';

const wrongWire = {
  kind: 'distinguishing-input' as const,
  input: ['00', '01', '00', '00'],
  expected: ['03', '02', '01', '01'],
  actual: ['01', '02', '01', '01'],
  differing: [0],
};

/** The cells of one labelled row, in order, with their highlight state. */
function cells(html: string, label: string): { text: string; highlighted: boolean }[] {
  const start = html.indexOf(`>${label}</span>`);
  const row = html.slice(start, html.indexOf('</span></span><span class="witness-label"', start + 1) + 1 || undefined);
  return [
    ...row.matchAll(
      /<span role="listitem" class="([^"]*)"[^>]*>.*?<\/span><span class="visually-hidden">[^<]*<\/span>([0-9A-Fa-f]+)/g,
    ),
  ].map((m) => ({ text: m[2]!, highlighted: m[1]!.includes('byte-hl') || m[1]!.includes('byte-nz') }));
}

describe('witness viewer', () => {
  it('shows the wrong-wire witness with the differing output highlighted', () => {
    const html = renderToStaticMarkup(<WitnessView witness={wrongWire} field="gf256" />);
    expect(cells(html, 'Input').map((c) => c.text)).toEqual(['00', '01', '00', '00']);
    expect(cells(html, 'Design gives')).toEqual([
      { text: '03', highlighted: true },
      { text: '02', highlighted: false },
      { text: '01', highlighted: false },
      { text: '01', highlighted: false },
    ]);
    expect(cells(html, 'Circuit gives').map((c) => c.text)).toEqual(['01', '02', '01', '01']);
    expect(html).toContain('(differs)');
    expect(html).toContain(
      'On input [00, 01, 00, 00] the design gives [03, 02, 01, 01] but the circuit gives [01, 02, 01, 01]: output y0 differs.',
    );
  });

  it('renders bytes in uppercase hex whatever the input case', () => {
    const html = renderToStaticMarkup(
      <WitnessView witness={{ ...wrongWire, expected: ['1b', '80', '80', '9b'], differing: [0, 3] }} field="gf256" />,
    );
    expect(cells(html, 'Design gives').map((c) => c.text)).toEqual(['1B', '80', '80', '9B']);
    expect(html).toContain('outputs y0 and y3 differ');
    expect(html).not.toMatch(/>1b</);
  });

  it('explains a branch-number witness with its weights', () => {
    const w = {
      kind: 'branch' as const,
      input: ['01', '00', '00', '00'],
      output: ['01', '00', '00', '00'],
      inputWeight: 1,
      outputWeight: 1,
      bound: 5,
    };
    const html = renderToStaticMarkup(<WitnessView witness={w} field="gf256" />);
    expect(html).toContain('1 + 1 = 2 &lt; 5');
    expect(html).toContain('byte-nz');
    expect(html).not.toContain('byte-hl');
    expect(describeWitness(w, 'gf256')).toContain('the branch number is less than 5');
  });

  it('shows the full root of unity for a power-map collision', () => {
    const w = powerPreview(3).witness!;
    expect(w.kind).toBe('power-collision');
    const html = renderToStaticMarkup(<WitnessView witness={w} field="bn254" />);
    expect(w.kind === 'power-collision' && w.x2.length).toBeGreaterThan(40);
    expect(html).toContain(w.kind === 'power-collision' ? w.x2 : '');
    expect(html).toContain('ω^3 = 1');
  });
});

describe('claim cards', () => {
  const claim: Claim = {
    id: 'activity.bound',
    chain: 'design',
    title: 'At least 25 active S-boxes over 4 rounds',
    status: 'not_established',
    evidence: {
      kind: 'lean',
      label: 'Lean-checked proof',
      theorem: 'CryptificateJob.activity_bound',
      axioms: ['propext'],
    },
    witness: null,
    note: 'Needs an MDS matrix.',
  };

  it('pairs every status with its text and keeps proof details expandable', () => {
    const html = renderToStaticMarkup(<ClaimCard claim={claim} field="gf256" rounds={4} />);
    expect(html).toContain('Not established by this method');
    expect(html).toContain('<svg');
    expect(html).toContain('<details class="proof"><summary>Proof details</summary>');
    expect(html).toContain('CryptificateJob.activity_bound');
    expect(html).toContain('standard axioms only');
    const refuted = renderToStaticMarkup(<ClaimCard claim={{ ...claim, status: 'refuted' }} field="gf256" />);
    expect(refuted).toContain('Refuted');
  });

  it('flags axioms outside the allowed set', () => {
    const html = renderToStaticMarkup(
      <ClaimCard
        claim={{ ...claim, status: 'proved', evidence: { ...claim.evidence, axioms: ['sorryAx'] } }}
        field="gf256"
      />,
    );
    expect(html).toContain('outside the allowed set');
  });

  it('marks a witness from an unchecked diagnostic as unchecked', () => {
    const w = powerPreview(3).witness!;
    const unchecked: Claim = {
      ...claim,
      id: 'sbox.bijective',
      title: 'Power S-box is a permutation',
      evidence: { kind: 'diagnostic', label: 'Unchecked diagnostic' },
      witness: w,
      note: 'Lean exited with status 1; the certificate did not check.',
    };
    expect(renderToStaticMarkup(<ClaimCard claim={unchecked} field="bn254" />)).toContain(
      'Power map collision (unchecked diagnostic)',
    );
    const checked = renderToStaticMarkup(
      <ClaimCard
        claim={{ ...unchecked, status: 'refuted', evidence: { kind: 'lean', label: 'Lean-checked counterexample' } }}
        field="bn254"
      />,
    );
    expect(checked).toContain('Power map collision');
    expect(checked).not.toContain('(unchecked');
  });

  it('never shows a proof status on an unchecked preview', () => {
    const html = renderToStaticMarkup(
      <PreviewCard
        item={{ id: 'matrix.mds', chain: 'design', title: 'Matrix is MDS', outcome: 'holds', witness: null, note: '' }}
        field="gf256"
      />,
    );
    expect(html).toContain('Unchecked diagnostic');
    expect(html).not.toContain('Proved');
  });
});
