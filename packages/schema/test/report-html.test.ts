/**
 * The HTML evidence report: snapshots over recorded example reports, escaping
 * of hostile report contents, the no-script/no-network contract, and the
 * content an auditor relies on (statements, axioms, counterexamples, pins).
 *
 * Snapshots live in test/snapshots; regenerate them with
 * UPDATE_SNAPSHOTS=1 npm test -w packages/schema and review the diff.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REPORT_HTML_CSP,
  compactJson,
  escapeHtml,
  htmlElement,
  programListing,
  renderReportHtml,
  reportHtmlFileName,
} from '../src/index.js';
import type { AnalysisReport, ExperimentReport, Report } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
/** packages/schema/dist/test -> repository root */
const ROOT = resolve(here, '../../../..');
const SNAPSHOTS = resolve(here, '../../test/snapshots');

function example<T extends Report>(name: string): T {
  return JSON.parse(readFileSync(join(ROOT, 'examples', 'bundles', name, 'report.json'), 'utf8')) as T;
}

function snapshot(name: string, actual: string): void {
  const file = join(SNAPSHOTS, name);
  if (process.env['UPDATE_SNAPSHOTS'] === '1') {
    mkdirSync(SNAPSHOTS, { recursive: true });
    writeFileSync(file, actual);
    return;
  }
  let expected: string | null = null;
  try {
    expected = readFileSync(file, 'utf8');
  } catch {
    expected = null;
  }
  assert.ok(expected !== null, `missing snapshot ${name}; run with UPDATE_SNAPSHOTS=1`);
  assert.equal(actual, expected, `snapshot ${name} differs; run with UPDATE_SNAPSHOTS=1 and review the diff`);
}

const ALLOWED_TAGS = new Set([
  'html', 'head', 'meta', 'title', 'style', 'body', 'main', 'article', 'section', 'header', 'footer', 'aside', 'h1', 'h2', 'h3',
  'h4', 'p', 'ul', 'li', 'dl', 'dt', 'dd', 'table', 'caption', 'thead', 'tbody', 'tr', 'th', 'td', 'code', 'pre', 'span',
  'strong', 'div', 'a',
]);

/**
 * Every tag in the document is one the renderer writes, no attribute is an
 * event handler or loads anything, and every link stays inside the page.
 */
function assertInert(html: string): void {
  assert.ok(html.startsWith('<!DOCTYPE html>\n'));
  // the style sheet is fixed text; check the markup around it
  const style = /<style>([\s\S]*?)<\/style>/.exec(html);
  assert.ok(style, 'one inline style sheet');
  assert.ok(!/@import|url\(/i.test(style[1]!), 'the style sheet loads nothing');
  const markup = html.replace(style[0], '<style></style>');
  for (const m of markup.matchAll(/<\/?([A-Za-z][A-Za-z0-9]*)([^>]*)>/g)) {
    const tag = m[1]!.toLowerCase();
    assert.ok(ALLOWED_TAGS.has(tag), `unexpected tag <${tag}>`);
    const attrs = [...m[2]!.matchAll(/\s([^\s=]+)(?:="([^"]*)")?/g)];
    for (const a of attrs) {
      const name = a[1]!.toLowerCase();
      assert.ok(!name.startsWith('on'), `event handler ${name}`);
      assert.ok(!['src', 'srcset', 'action', 'formaction', 'style', 'background', 'poster', 'data'].includes(name), `attribute ${name} on <${tag}>`);
      if (name === 'href') assert.match(a[2] ?? '', /^#[A-Za-z0-9_-]+$/, 'links stay inside the page');
    }
  }
  assert.ok(!/<script/i.test(html));
  assert.ok(html.includes(`<meta http-equiv="Content-Security-Policy" content="${escapeHtml(REPORT_HTML_CSP)}">`));
}

test('analysis reports render as stable, inert documents (snapshots)', () => {
  for (const name of ['aes-wrong-wire', 'poseidon2-exponent3']) {
    const html = renderReportHtml(example(name), { bundleName: `${name}.tar.gz` });
    assertInert(html);
    assert.equal(renderReportHtml(example(name), { bundleName: `${name}.tar.gz` }), html, 'deterministic');
    snapshot(`${name}.html`, html);
  }
});

test('experiment reports render with candidates, timing intervals and the machine (snapshot)', () => {
  const ex = example<ExperimentReport>('beat-the-reference');
  const html = renderReportHtml(ex, { bundleName: 'beat-the-reference.tar.gz' });
  assertInert(html);
  snapshot('beat-the-reference.html', html);
  for (const c of ex.candidates) assert.ok(html.includes(`id="candidate-${c.id}"`), c.id);
  const primary = ex.measurements!.comparisons.find((c) => c.primary)!;
  assert.ok(html.includes(`[${primary.ci95[0].toFixed(3)}, ${primary.ci95[1].toFixed(3)}]`), 'interval of a primary comparison');
  assert.ok(html.includes(escapeHtml(ex.measurements!.machine.cpu)));
  assert.ok(html.includes(escapeHtml(ex.measurements!.machine.flags)));
  assert.ok(html.includes('Verdict: <strong>inconclusive</strong>'));
  // the explanation follows the rule in crates/native/src/protocol.rs, quick-test settings included
  assert.ok(html.includes('met neither the locally confirmed criterion nor the no improvement criterion, or the run used quick-test settings'));
  assert.ok(html.includes('An experiment does not check design guarantees'));
});

test('a report shows inputs, digests, exact Lean statements, axioms, counterexamples and pins', () => {
  const r = example<AnalysisReport>('aes-wrong-wire');
  const html = renderReportHtml(r, {
    bundleName: 'aes-wrong-wire.tar.gz',
    toolchain: { leanToolchain: 'leanprover/lean4:v4.33.1', cargoLockSha256: 'ab'.repeat(32), lakeManifest: [{ name: 'WideTrail', rev: r.provenance.toolchain.widetrail, inputRev: null }] },
  });
  assert.ok(html.includes(r.inputDigest));
  assert.ok(html.includes(escapeHtml(r.provenance.checker)));
  assert.ok(html.includes(r.provenance.toolchain.widetrail));
  assert.ok(html.includes(r.provenance.leanSourceSha256!));
  assert.ok(html.includes('leanprover/lean4:v4.33.1') && html.includes('ab'.repeat(32)), 'recorded toolchain.json');
  for (const c of r.claims) {
    assert.ok(html.includes(`id="claim-${c.id}"`), c.id);
    if (c.evidence.type) assert.ok(html.includes(escapeHtml(c.evidence.type)), `statement of ${c.id}`);
    if (c.evidence.theorem) assert.ok(html.includes(escapeHtml(c.evidence.theorem)), `theorem of ${c.id}`);
  }
  assert.ok(html.includes('<code>propext</code>, <code>Classical.choice</code>, <code>Quot.sound</code><span class="muted"> (within the accepted set)</span>'));
  // the distinguishing input of the crossed wire, and the differing output
  assert.ok(html.includes('Input <code>[00, 01, 00, 00]</code>.'));
  assert.ok(/<td>y0<\/td><td><code>03<\/code><\/td><td><code>01<\/code><\/td><td><strong>differs<\/strong><\/td>/.test(html));
  assert.ok(html.includes('npx cryptificate verify aes-wrong-wire.tar.gz'));
  assert.ok(html.includes(escapeHtml(programListing(r.inputs.program!)).split('\n')[1]!));
  assert.equal(reportHtmlFileName(r), `cryptificate-${r.id}.html`);
});

test('the legend scopes the statement and axiom checks to Lean certificates and names what refinement trusts', () => {
  const html = renderReportHtml(example('aes-wrong-wire'));
  assert.ok(html.includes('A Lean certificate (evidence kind <code>lean</code>) is accepted only when its printed statement equals the expected statement'));
  assert.ok(!html.includes('A Lean proof is accepted only when'));
  assert.ok(html.includes('For <code>rust.refinement</code> it is an Aeneas refinement proof, checked by Lean'));
  assert.ok(html.includes('it does not depend on the submitted values and it trusts the Charon/Aeneas translation'));
});

test('axioms outside the accepted set are pointed out, not hidden', () => {
  const r = example<AnalysisReport>('identity');
  const forged: AnalysisReport = JSON.parse(JSON.stringify(r));
  forged.claims[0]!.evidence.axioms = ['propext', 'sorryAx'];
  const html = renderReportHtml(forged);
  assert.ok(html.includes('(outside the accepted set: sorryAx)'));
});

const HOSTILE = '<script>alert(1)</script>"><img src=x onerror=alert(2)>\'</style></pre>&amp;\u0000\u0007';

function hostileReport(): AnalysisReport {
  const r = example<AnalysisReport>('aes-wrong-wire');
  const x: AnalysisReport = JSON.parse(JSON.stringify(r));
  x.id = HOSTILE;
  x.inputDigest = HOSTILE;
  x.provenance.checker = HOSTILE;
  x.provenance.toolchain.widetrail = HOSTILE;
  x.provenance.origin = 'cached';
  x.provenance.cachedFrom = HOSTILE;
  x.inputs.program!.name = HOSTILE;
  x.inputs.design = { ...x.inputs.design, matrix: [[HOSTILE, '01'], ['01', HOSTILE]] } as typeof x.inputs.design;
  x.execution.steps[0]!.detail = HOSTILE;
  for (const c of x.claims) {
    c.note = HOSTILE;
    c.title = HOSTILE;
    c.evidence.label = HOSTILE;
    if (c.evidence.type) c.evidence.type = HOSTILE;
    if (c.evidence.axioms) c.evidence.axioms = [HOSTILE];
  }
  x.claims[4]!.witness = { kind: 'distinguishing-input', input: [HOSTILE], expected: [HOSTILE], actual: [HOSTILE], differing: [0] };
  x.claims[0]!.id = HOSTILE as AnalysisReport['claims'][number]['id'];
  return x;
}

test('report contents are escaped everywhere: hostile strings stay text', () => {
  const html = renderReportHtml(hostileReport(), { context: HOSTILE, bundleName: HOSTILE, toolchain: { leanToolchain: HOSTILE, lakeManifest: [{ name: HOSTILE, rev: HOSTILE }] } });
  assertInert(html);
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('</style></pre>'));
  assert.ok(!html.includes('\u0000') && !html.includes('\u0007'), 'control characters are dropped');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;&quot;&gt;&lt;img src=x onerror=alert(2)&gt;&#39;&lt;/style&gt;&lt;/pre&gt;&amp;amp;'));
  // the title and the experiment variant escape too
  const ex = example<ExperimentReport>('beat-the-reference');
  const hx: ExperimentReport = JSON.parse(JSON.stringify(ex));
  hx.id = HOSTILE;
  hx.candidates[0]!.id = HOSTILE;
  hx.candidates[0]!.program.name = HOSTILE;
  hx.measurements!.machine.cpu = HOSTILE;
  hx.measurements!.comparisons[0]!.candidate = HOSTILE;
  hx.search!.shortlist = [HOSTILE];
  const hxHtml = renderReportHtml(hx);
  assertInert(hxHtml);
  assert.ok(!hxHtml.includes('<img'));
  assert.match(reportHtmlFileName(hx), /^cryptificate-[A-Za-z0-9_-]+\.html$/);
});

test('a malformed report renders without throwing and without markup injection', () => {
  const junk = {
    kind: 'analysis',
    id: 42,
    inputDigest: null,
    inputs: { design: { model: 'aes-like/gf256/v1', matrix: 'not a matrix', offsets: { a: '<b>' }, sbox: { kind: 'table', table: [1, '<i>', null] } }, program: { instructions: [{ op: '<x>' }, 7], outputs: 'no' } },
    claims: [{ id: 'matrix.mds', chain: 'design', status: '<b>weird</b>', evidence: null, witness: { kind: 'branch', input: 'x' }, note: ['<a>'] }],
    execution: { steps: 'none' },
    provenance: null,
  } as unknown as AnalysisReport;
  const html = renderReportHtml(junk);
  assertInert(html);
  assert.ok(html.includes('&lt;b&gt;weird&lt;/b&gt;'));
  const ex = { kind: 'experiment', id: 'x', candidates: [{ id: 'c', program: null, equivalence: null, native: { passed: 'yes' } }], measurements: { comparisons: [{ ci95: 'wide' }], workloads: [null] }, provenance: {}, checkpoints: null } as unknown as ExperimentReport;
  assertInert(renderReportHtml(ex));
});

test('the element builder refuses event handlers and odd names; escaping covers quotes', () => {
  assert.throws(() => htmlElement('div', { onclick: 'x' }));
  assert.throws(() => htmlElement('img src=x', null));
  assert.throws(() => htmlElement('div', { 'a"b': 'x' }));
  assert.equal(htmlElement('p', { title: `"'<>&` }, `"'<>&`).value, '<p title="&quot;&#39;&lt;&gt;&amp;">&quot;&#39;&lt;&gt;&amp;</p>');
  assert.equal(escapeHtml('a\u0000b\u001Fc\td\ne'), 'abc\td\ne');
});

test('the appendix JSON is compact and parses back to the recorded inputs', () => {
  for (const name of ['aes-wrong-wire', 'poseidon2-exponent3', 'beat-the-reference']) {
    const r = example(name);
    const text = compactJson(r.inputs);
    assert.deepEqual(JSON.parse(text), r.inputs, name);
  }
  assert.equal(compactJson({ a: [1, 2], b: { op: 'add', a: 0, b: 1 }, c: [] }), '{\n  "a": [1, 2],\n  "b": {"op": "add", "a": 0, "b": 1},\n  "c": []\n}');
});
