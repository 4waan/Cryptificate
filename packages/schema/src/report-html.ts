/**
 * Self-contained HTML evidence report: one file with inline CSS, no scripts
 * and no external requests, readable in a browser and printable to PDF.
 *
 * Shared by the command line (`--format html`), evidence bundles
 * (`report.html`) and the web workbench (Export report). Pure functions over
 * a report object; the output carries no timestamp, so the same report
 * always renders to the same bytes.
 *
 * Everything taken from a report is treated as untrusted data: text and
 * attribute values are escaped by the element builder below, which is the
 * only way markup is produced, and the page declares a Content Security
 * Policy that forbids scripts and every external load.
 *
 * The page renders what the report records. It never upgrades a status and
 * it is not itself evidence: the evidence is the bundle, which `cryptificate
 * verify` re-checks.
 */
import { ALLOWED_AXIOMS } from './constants.js';
import type {
  AnalysisReport,
  Claim,
  ExperimentCandidate,
  ExperimentReport,
  Measurements,
  Program,
  Report,
  Step,
  Witness,
} from './types.js';

// ---------------------------------------------------------------------------
// Element builder

/** Markup produced by this module; the only value inserted without escaping. */
export class SafeHtml {
  /** @internal Use `h`, `text` or `fragment`; never wrap untrusted strings. */
  constructor(readonly value: string) {}
}

export type Child = SafeHtml | string | number | boolean | null | undefined | Child[];

// C0 controls other than tab, newline and carriage return, DEL, and the
// noncharacters U+FFFE and U+FFFF have no place in a report; drop them.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F￾￿]/g;

/** Escape text for an HTML text node or a double- or single-quoted attribute value. */
export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(CONTROL, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function render(child: Child): string {
  if (child === null || child === undefined || child === false || child === true) return '';
  if (child instanceof SafeHtml) return child.value;
  if (Array.isArray(child)) return child.map(render).join('');
  return escapeHtml(child);
}

const TAG = /^[a-z][a-z0-9]*$/;
const ATTR = /^[a-z][a-z0-9-]*$/;
const VOID = new Set(['meta', 'br', 'col', 'hr', 'wbr']);

type Attrs = Record<string, string | number | boolean | null | undefined>;

/** An element. Tag and attribute names are fixed by the caller; values and children are escaped. */
export function h(tag: string, attrs: Attrs | null, ...children: Child[]): SafeHtml {
  if (!TAG.test(tag)) throw new Error(`invalid tag ${tag}`);
  let open = `<${tag}`;
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (!ATTR.test(k) || k.startsWith('on')) throw new Error(`invalid attribute ${k}`);
    if (v === null || v === undefined || v === false) continue;
    open += v === true ? ` ${k}` : ` ${k}="${escapeHtml(v)}"`;
  }
  open += '>';
  if (VOID.has(tag)) return new SafeHtml(open);
  return new SafeHtml(`${open}${render(children)}</${tag}>`);
}

export function fragment(...children: Child[]): SafeHtml {
  return new SafeHtml(render(children));
}

// ---------------------------------------------------------------------------
// Defensive accessors: a report read from disk may not match its type.

function str(v: unknown, fallback = ''): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return fallback;
}

function arr<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Fixed-precision number, no locale; "-" when absent. */
function fixed(v: unknown, digits: number): string {
  const n = num(v);
  return n === null ? '-' : n.toFixed(digits);
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ---------------------------------------------------------------------------
// Public interface

/** The toolchain document of a bundle (toolchain.json), when it is at hand. */
export interface HtmlToolchain {
  leanToolchain?: string;
  lakeManifest?: { name: string; url?: string | null; rev: string; inputRev?: string | null }[];
  cargoLockSha256?: string | null;
  rustc?: string;
  checker?: string;
}

export interface HtmlReportOptions {
  /** Pins recorded with the run (the bundle's toolchain.json). */
  toolchain?: HtmlToolchain | null;
  /** File name of the bundle, used in the verify instructions. */
  bundleName?: string;
  /** Where the page was produced from, shown under the title (e.g. "Evidence bundle"). */
  context?: string;
}

/** A complete HTML document for one analysis or experiment report. */
export function renderReportHtml(report: Report, opts: HtmlReportOptions = {}): string {
  return htmlDocument(reportTitle(report), [reportArticle(report, opts)]);
}

/** Document title of a report, e.g. "Cryptificate evidence report: analysis 0123…". */
export function reportTitle(report: Report): string {
  const kind = report.kind === 'experiment' ? 'experiment' : 'analysis';
  return `Cryptificate evidence report: ${kind} ${str(report.id)}`;
}

/** File name the workbench and the service offer for a report's HTML. */
export function reportHtmlFileName(report: Report): string {
  const id = str(report.id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'report';
  return `cryptificate-${id}.html`;
}

/** Wrap rendered sections into a standalone document with the report style sheet. */
export function htmlDocument(title: string, body: Child[]): string {
  return `<!DOCTYPE html>\n${render(
    h(
      'html',
      { lang: 'en' },
      h(
        'head',
        null,
        h('meta', { charset: 'utf-8' }),
        h('meta', { 'http-equiv': 'Content-Security-Policy', content: CSP }),
        h('meta', { name: 'referrer', content: 'no-referrer' }),
        h('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }),
        h('meta', { name: 'color-scheme', content: 'light dark' }),
        h('title', null, title),
        h('style', null, new SafeHtml(STYLE)),
      ),
      h('body', null, h('main', null, ...body)),
    ),
  )}\n`;
}

/** Scripts, frames, forms, fonts, images from the network and every fetch are refused. */
export const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'";

/** One report as an <article>, for documents that combine several. */
export function reportArticle(report: Report, opts: HtmlReportOptions = {}): SafeHtml {
  return report.kind === 'experiment' ? experimentArticle(report, opts) : analysisArticle(report as AnalysisReport, opts);
}

// ---------------------------------------------------------------------------
// Shared pieces

const STATUS_TEXT: Record<string, string> = {
  proved: 'proved',
  refuted: 'refuted',
  not_established: 'not established',
  unsupported: 'unsupported',
};

function statusBadge(status: unknown): SafeHtml {
  const s = str(status, 'unknown');
  const cls = Object.hasOwn(STATUS_TEXT, s) ? s.replace('_', '-') : 'other';
  return h('span', { class: `badge badge-${cls}` }, STATUS_TEXT[s] ?? s);
}

function stateBadge(state: unknown): SafeHtml {
  const s = str(state, 'unknown');
  const cls = s === 'completed' ? 'proved' : s === 'failed' || s === 'invalid' ? 'refuted' : 'not-established';
  return h('span', { class: `badge badge-${cls}` }, s);
}

function code(v: unknown): SafeHtml {
  return h('code', null, str(v));
}

function dl(rows: [string, Child][]): SafeHtml {
  return h(
    'dl',
    { class: 'kv' },
    rows.filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => fragment(h('dt', null, k), h('dd', null, v))),
  );
}

function table(head: string[], rows: Child[][], opts: { numeric?: number[]; caption?: string; className?: string } = {}): SafeHtml {
  const numeric = new Set(opts.numeric ?? []);
  return h(
    'table',
    { class: opts.className ?? null },
    opts.caption ? h('caption', null, opts.caption) : null,
    h('thead', null, h('tr', null, head.map((c, i) => h('th', { scope: 'col', class: numeric.has(i) ? 'num' : null }, c)))),
    h('tbody', null, rows.map((r) => h('tr', null, r.map((c, i) => h('td', { class: numeric.has(i) ? 'num' : null }, c))))),
  );
}

function section(id: string, title: string, ...children: Child[]): SafeHtml {
  return h('section', { id, 'aria-labelledby': `${id}-h` }, h('h2', { id: `${id}-h` }, title), ...children);
}

function originText(report: Report): string {
  const p = obj(report.provenance);
  const origin = str(p['origin'], 'unknown');
  if (origin === 'cached') {
    const from = str(p['cachedFrom']);
    return `cached exact result${from ? ` of run ${from}` : ''}`;
  }
  return origin;
}

function headerBlock(report: Report, opts: HtmlReportOptions, kindTitle: string, extra: [string, Child][]): SafeHtml {
  const p = obj(report.provenance);
  const state = report.kind === 'experiment' ? obj(report.execution)['state'] ?? 'completed' : obj(report.execution)['state'];
  return h(
    'header',
    { class: 'report-head' },
    h('p', { class: 'eyebrow' }, 'Cryptificate evidence report', opts.context ? ` · ${opts.context}` : ''),
    h('h1', null, kindTitle, ' ', h('code', { class: 'id' }, str(report.id))),
    dl([
      ['Inputs', h('code', { class: 'digest' }, str(report.inputDigest))],
      ['Run', fragment(stateBadge(state), ' ', originText(report))],
      ['Checker', code(p['checker'])],
      ...extra,
    ]),
  );
}

function legend(): SafeHtml {
  return h(
    'aside',
    { class: 'legend', 'aria-label': 'How to read this report' },
    h('h3', null, 'How to read this report'),
    h(
      'ul',
      null,
      h('li', null, statusBadge('proved'), ' Lean checked a theorem stating the property for the exact submitted values.'),
      h('li', null, statusBadge('refuted'), ' Lean (or, for native correctness, the generated code) produced a concrete counterexample for the exact submitted values.'),
      h('li', null, statusBadge('not_established'), ' This method did not establish the property. It is not a counterexample; a timeout or a missing tool lands here.'),
      h('li', null, statusBadge('unsupported'), ' The input is outside the supported model.'),
    ),
    h(
      'p',
      null,
      'Design guarantees and implementation correspondence are separate chains: a circuit can compute its matrix exactly while the matrix diffuses poorly, and an MDS matrix can have a miswired circuit. A Lean proof is accepted only when its printed statement equals the expected statement about the exact inputs and its axioms are within ',
      ALLOWED_AXIOMS.map((a, i) => fragment(i ? ', ' : '', code(a))),
      '.',
    ),
  );
}

// ---------------------------------------------------------------------------
// Inputs

function matrixTable(m: unknown, label: string): SafeHtml {
  const rows = arr<unknown[]>(m).map((r) => arr(r));
  const width = Math.max(0, ...rows.map((r) => r.length));
  return h(
    'table',
    { class: 'matrix', 'aria-label': label },
    h('thead', null, h('tr', null, h('th', null, ''), Array.from({ length: width }, (_, j) => h('th', { scope: 'col' }, `c${j}`)))),
    h('tbody', null, rows.map((r, i) => h('tr', null, h('th', { scope: 'row' }, `r${i}`), r.map((e) => h('td', null, str(e)))))),
  );
}

function sboxBlock(sbox: unknown): Child {
  const s = obj(sbox);
  const kind = str(s['kind']);
  if (kind === 'aes') return h('p', null, 'The AES S-box (', code('kind: aes'), ').');
  if (kind === 'power') return h('p', null, 'Power map ', h('code', null, 'x ↦ x^', str(s['exponent'])), '.');
  if (kind === 'table') {
    const t = arr(s['table']);
    const hex = (n: number): string => n.toString(16).toUpperCase();
    return fragment(
      h('p', null, `Explicit table of ${t.length} entries; row r, column c holds S(16·r + c).`),
      h(
        'table',
        { class: 'matrix sbox', 'aria-label': 'S-box table' },
        h('thead', null, h('tr', null, h('th', null, ''), Array.from({ length: 16 }, (_, c) => h('th', { scope: 'col' }, `.${hex(c)}`)))),
        h(
          'tbody',
          null,
          Array.from({ length: Math.ceil(t.length / 16) }, (_, r) =>
            h('tr', null, h('th', { scope: 'row' }, `${hex(r)}.`), t.slice(r * 16, r * 16 + 16).map((e) => h('td', null, str(e)))),
          ),
        ),
      ),
    );
  }
  return h('pre', null, JSON.stringify(sbox));
}

function designBlock(design: unknown): SafeHtml {
  const d = obj(design);
  const model = str(d['model']);
  if (model === 'hades/bn254/v1') {
    const c = obj(d['constants']);
    const mask = arr(d['partialMask']).map((b) => (b === true ? 'active' : 'inactive'));
    return fragment(
      dl([
        ['Model', code(model)],
        ['Field', code(d['field'])],
        ['Width', str(d['width'])],
        ['Full rounds', str(d['fullRounds'])],
        ['Partial rounds', str(d['partialRounds'])],
        ['Partial-round S-boxes', mask.map((m, i) => `${i ? ', ' : ''}lane ${i} ${m}`).join('')],
        [
          'Round constants',
          str(c['kind']) === 'explicit'
            ? `explicit, ${plural(arr(c['values']).length, 'row')} (listed in the appendix)`
            : str(c['kind']) === 'reference'
              ? 'the reference Poseidon2 BN254 constants'
              : str(c['kind']),
        ],
      ]),
      h('h4', null, 'External matrix'),
      matrixTable(d['external'], 'External matrix'),
      h('h4', null, 'Internal matrix'),
      matrixTable(d['internal'], 'Internal matrix'),
      h('h4', null, 'S-box'),
      sboxBlock(d['sbox']),
    );
  }
  return fragment(
    dl([
      ['Model', code(model)],
      ['Field', code(d['field'])],
      ['Width', `${str(d['width'])}${d['experimental'] === true ? ' (experimental width)' : ''}`],
      ['Rounds', str(d['rounds'])],
      ['Row offsets', h('code', null, arr(d['offsets']).map((o) => str(o)).join(', '))],
    ]),
    h('h4', null, 'Matrix'),
    matrixTable(d['matrix'], 'Matrix'),
    h('h4', null, 'S-box'),
    sboxBlock(d['sbox']),
  );
}

function instructionText(ins: unknown, reg: number): string {
  const i = obj(ins);
  if (i['op'] === 'add') return `r${reg} = r${str(i['a'])} + r${str(i['b'])}`;
  if (i['op'] === 'mul') return `r${reg} = ${str(i['k'])} · r${str(i['a'])}`;
  return `r${reg} = ${JSON.stringify(ins)}`;
}

/** Straight-line program as one instruction per line. */
export function programListing(program: Program): string {
  const p = obj(program);
  const width = num(p['width']) ?? 0;
  const lines = arr(p['instructions']).map((ins, i) => instructionText(ins, width + i));
  const outs = arr(p['outputs']).map((o, i) => `y${i} = r${str(o)}`);
  const inputs = width > 0 ? [`inputs r0..r${width - 1}`] : [];
  return [...inputs, ...lines, ...outs].join('\n');
}

function programBlock(program: unknown, target: unknown): SafeHtml {
  const p = obj(program);
  const ins = arr<Record<string, unknown>>(p['instructions']);
  const adds = ins.filter((i) => obj(i)['op'] === 'add').length;
  const muls = ins.filter((i) => obj(i)['op'] === 'mul').length;
  return fragment(
    dl([
      ['Name', p['name'] !== undefined ? code(p['name']) : null],
      ['Field', code(p['field'])],
      ['Width', str(p['width'])],
      ['Implements', target !== undefined ? fragment('the ', code(target), ' matrix') : null],
      ['Size', `${plural(ins.length, 'instruction')}: ${plural(adds, 'addition')}, ${plural(muls, 'multiplication')} by a constant`],
    ]),
    h('pre', { class: 'listing program', 'aria-label': 'Circuit' }, programListing(program as Program)),
  );
}

function inputsSection(report: Report): SafeHtml {
  const inputs = obj(report.inputs);
  const program = inputs['program'];
  return section(
    'inputs',
    'Inputs',
    h(
      'p',
      null,
      'Input digest ',
      h('code', { class: 'digest' }, str(report.inputDigest)),
      ': SHA-256 of the canonical JSON of the normalized inputs below. Every claim in this report is about exactly these values.',
    ),
    report.inputs === undefined
      ? h('p', { class: 'muted' }, 'This report does not record its inputs.')
      : fragment(
          h('h3', null, 'Design'),
          designBlock(inputs['design']),
          h('h3', null, 'Circuit'),
          program === undefined || program === null
            ? h('p', { class: 'muted' }, 'No circuit was submitted.')
            : programBlock(program, inputs['target']),
        ),
  );
}

// ---------------------------------------------------------------------------
// Claims

function vector(v: unknown): string {
  return `[${arr(v).map((e) => str(e)).join(', ')}]`;
}

/** Counterexample or witness of a claim, in plain words (null when there is none). */
export function witnessSummary(w: Witness | null | undefined): string | null {
  const x = obj(w);
  switch (x['kind']) {
    case 'branch':
      return `input ${vector(x['input'])} maps to ${vector(x['output'])}: ${str(x['inputWeight'])} + ${str(x['outputWeight'])} nonzero coordinates, below the branch number ${str(x['bound'])}`;
    case 'offset-collision':
      return `rows ${arr(x['rows']).map((r) => str(r)).join(', ')} share the offset ${str(x['offset'])}`;
    case 'distinguishing-input':
      return `on input ${vector(x['input'])} the matrix gives ${vector(x['expected'])} and the circuit gives ${vector(x['actual'])}`;
    case 'sbox-collision':
      return `S(${str(x['x1'])}) = S(${str(x['x2'])}) = ${str(x['y'])}`;
    case 'power-collision':
      return `${str(x['x1'])}^${str(x['exponent'])} = ${str(x['x2'])}^${str(x['exponent'])}`;
    default:
      return w ? JSON.stringify(w) : null;
  }
}

function witnessBlock(w: Witness | null | undefined, status: string): Child {
  if (!w) return null;
  const x = obj(w);
  const title = status === 'refuted' ? 'Counterexample' : 'Witness';
  let body: Child;
  switch (x['kind']) {
    case 'branch': {
      const input = arr(x['input']);
      const output = arr(x['output']);
      body = fragment(
        table(
          ['', ...input.map((_, i) => `x${i}`)],
          [
            ['input', ...input.map((e) => h('code', null, str(e)))],
            ['M · input', ...output.map((e) => h('code', null, str(e)))],
          ],
          { className: 'vector' },
        ),
        h(
          'p',
          null,
          `Nonzero coordinates: ${str(x['inputWeight'])} in the input and ${str(x['outputWeight'])} in the output, ${str(x['inputWeight'])} + ${str(x['outputWeight'])} below the branch number ${str(x['bound'])} an MDS matrix of this width has.`,
        ),
      );
      break;
    }
    case 'distinguishing-input': {
      const input = arr(x['input']);
      const expected = arr(x['expected']);
      const actual = arr(x['actual']);
      const differing = new Set(arr(x['differing']).map((d) => num(d)));
      const n = Math.max(input.length, expected.length, actual.length);
      body = fragment(
        h('p', null, 'Input ', h('code', null, vector(input)), '.'),
        table(
          ['Output', 'Matrix (expected)', 'Circuit (actual)', ''],
          Array.from({ length: n }, (_, i) => [
            `y${i}`,
            h('code', null, str(expected[i])),
            h('code', null, str(actual[i])),
            differing.has(i) ? h('strong', null, 'differs') : '',
          ]),
          { className: 'vector' },
        ),
      );
      break;
    }
    case 'offset-collision':
    case 'sbox-collision':
    case 'power-collision':
      body = h('p', null, h('code', null, witnessSummary(w) ?? ''), x['kind'] === 'power-collision' && str(x['note']) ? ` (${str(x['note'])})` : '', '.');
      break;
    default:
      body = h('pre', null, JSON.stringify(w, null, 2));
  }
  return h('div', { class: 'witness' }, h('h4', null, title), body);
}

function axiomsBlock(axioms: unknown): Child {
  const list = arr(axioms).map((a) => str(a));
  if (list.length === 0) return h('span', { class: 'muted' }, 'none reported');
  const outside = list.filter((a) => !ALLOWED_AXIOMS.includes(a));
  return fragment(
    list.map((a, i) => fragment(i ? ', ' : '', code(a))),
    outside.length
      ? h('span', { class: 'warn' }, ` (outside the accepted set: ${outside.join(', ')})`)
      : h('span', { class: 'muted' }, ' (within the accepted set)'),
  );
}

function claimBlock(c: Claim): SafeHtml {
  const e = obj(c.evidence);
  const status = str(c.status);
  return h(
    'article',
    { class: `claim claim-${Object.hasOwn(STATUS_TEXT, status) ? status.replace('_', '-') : 'other'}`, id: `claim-${str(c.id).replace(/[^A-Za-z0-9_.-]/g, '_')}` },
    h('header', null, h('h3', null, h('code', null, str(c.id)), ' ', str(c.title)), statusBadge(status)),
    dl([
      ['Evidence', str(e['label'])],
      ['Kind', str(e['kind'])],
      ['Theorem', e['theorem'] !== undefined ? code(e['theorem']) : null],
      ['Lean statement', e['type'] !== undefined ? h('pre', { class: 'statement' }, str(e['type'])) : null],
      ['Axioms', e['axioms'] !== undefined ? axiomsBlock(e['axioms']) : null],
      ['Cases', e['cases'] !== undefined ? str(e['cases']) : null],
      ['Reason', c.reason !== undefined ? code(c.reason) : null],
      ['Note', str(c.note)],
    ]),
    witnessBlock(c.witness, status),
  );
}

function summaryTable(claims: readonly Claim[]): SafeHtml {
  return table(
    ['Chain', 'Claim', 'Status', 'Evidence'],
    claims.map((c) => [str(c.chain), fragment(h('code', null, str(c.id)), ' ', str(c.title)), statusBadge(c.status), str(obj(c.evidence)['label'])]),
    { className: 'summary' },
  );
}

function counts(claims: readonly Claim[]): string {
  const by = new Map<string, number>();
  for (const c of claims) by.set(STATUS_TEXT[str(c.status)] ?? str(c.status), (by.get(STATUS_TEXT[str(c.status)] ?? str(c.status)) ?? 0) + 1);
  return [...by].map(([s, n]) => `${n} ${s}`).join(', ') || 'no claims';
}

// ---------------------------------------------------------------------------
// Execution and provenance

function stepsTable(steps: readonly Step[]): SafeHtml {
  return table(
    ['Step', 'State', 'Duration', 'Detail'],
    steps.map((s) => {
      const o = obj(s);
      const ms = num(o['ms']);
      return [h('code', null, str(o['name'])), str(o['state']), ms === null ? '-' : `${(ms / 1000).toFixed(1)} s`, str(o['detail'])];
    }),
    { numeric: [2] },
  );
}

function provenanceSection(report: Report, opts: HtmlReportOptions, machine: Measurements['machine'] | null): SafeHtml {
  const p = obj(report.provenance);
  const t = obj(p['toolchain']);
  const tc = opts.toolchain ? obj(opts.toolchain) : null;
  // An experiment records its steps as checkpoints and, in newer reports, also as execution steps.
  let steps = arr<Step>(obj(report.execution)['steps']);
  if (steps.length === 0 && report.kind === 'experiment') steps = arr<Step>(report.checkpoints);
  const m = machine ? obj(machine) : null;
  return section(
    'provenance',
    'Provenance',
    dl([
      ['Report id', code(report.id)],
      ['Origin', originText(report)],
      ['Checker (engine version)', code(p['checker'])],
      ['Lean', code(t['lean'])],
      ['Mathlib', code(t['mathlib'])],
      ['WideTrail revision', code(t['widetrail'])],
      ['rustc', code(t['rustc'])],
      ['Lean source SHA-256', p['leanSourceSha256'] !== undefined ? h('code', { class: 'digest' }, str(p['leanSourceSha256'])) : null],
      ['Proof cache key', p['cacheKey'] !== undefined ? h('code', { class: 'digest' }, str(p['cacheKey'])) : null],
    ]),
    tc
      ? fragment(
          h('h3', null, 'Recorded toolchain (toolchain.json)'),
          dl([
            ['lean-toolchain', tc['leanToolchain'] !== undefined ? code(tc['leanToolchain']) : null],
            ['Cargo.lock SHA-256', tc['cargoLockSha256'] ? h('code', { class: 'digest' }, str(tc['cargoLockSha256'])) : null],
            ['rustc', tc['rustc'] !== undefined ? code(tc['rustc']) : null],
          ]),
          arr(tc['lakeManifest']).length
            ? table(
                ['Lake package', 'Revision', 'Input revision'],
                arr(tc['lakeManifest']).map((pkg) => {
                  const k = obj(pkg);
                  return [h('code', null, str(k['name'])), h('code', { class: 'digest' }, str(k['rev'])), str(k['inputRev'], '-')];
                }),
              )
            : null,
        )
      : null,
    h('h3', null, 'Machine'),
    m
      ? dl([
          ['CPU', str(m['cpu'])],
          ['Operating system', str(m['os'])],
          ['RAM', num(m['ramMiB']) !== null ? `${str(m['ramMiB'])} MiB` : str(m['ramMiB'])],
          ['rustc', code(m['rustc'])],
          ['Build flags', h('code', null, str(m['flags']))],
        ])
      : h('p', { class: 'muted' }, 'This report records no machine description: only experiments take timings, and only they record the machine.'),
    h('h3', null, 'Execution'),
    steps.length ? stepsTable(steps) : h('p', { class: 'muted' }, 'No execution steps recorded.'),
    h('p', { class: 'muted' }, 'Durations are wall-clock times on the machine that produced the report. A timeout or a missing tool is an execution outcome, never a refutation.'),
  );
}

function verifySection(report: Report, opts: HtmlReportOptions): SafeHtml {
  const bundle = opts.bundleName ?? '<bundle>.tar.gz';
  const scope =
    report.kind === 'experiment'
      ? 'For an experiment it re-checks the circuit equivalence of every recorded candidate. Native correctness results and timings are historical: they describe the machine that recorded them and are shown, not re-measured.'
      : 'For an analysis it re-checks the design claims and circuit.equivalence, and native.correctness with --native (from regenerated Rust, never the bundled Rust). It does not re-check rust.refinement or timings; they are shown with their recorded status.';
  return section(
    'verify',
    'How to verify',
    h('p', null, 'From a Cryptificate checkout prepared with ', code('scripts/setup.sh'), ':'),
    h('pre', { class: 'listing' }, `npx cryptificate verify ${bundle}`),
    h(
      'p',
      null,
      'verify reads only ',
      code('inputs.json'),
      ' and ',
      code('report.json'),
      ' from the bundle. It regenerates the Lean certificate with the installed engine and templates, runs the installed Lean checker, recomputes each claim and compares it with the status recorded here. It never runs Lean, Rust or shell code from the bundle, and it ignores this page (',
      code('report.html'),
      '), which is a rendering of ',
      code('report.json'),
      ', not evidence.',
    ),
    h('p', null, scope),
    h('p', null, 'To render this page again from a bundle or a report.json without running anything:'),
    h('pre', { class: 'listing' }, `npx cryptificate report ${bundle} --format html --output report.html`),
  );
}

function appendix(report: Report, extra: Child[]): SafeHtml {
  return section(
    'appendix',
    'Appendix: inputs as recorded',
    ...extra,
    report.inputs === undefined ? null : fragment(h('p', null, 'The normalized inputs exactly as ', code('report.json'), ' records them:'), h('pre', { class: 'json' }, compactJson(report.inputs))),
  );
}

/**
 * Indented JSON that keeps arrays of scalars (matrix rows, offsets, S-box
 * tables, vectors) and small flat objects (instructions) on one line.
 * Parses back to the same value.
 */
export function compactJson(value: unknown, indent = ''): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.every((v) => v === null || typeof v !== 'object')) return `[${value.map((v) => JSON.stringify(v) ?? 'null').join(', ')}]`;
    const inner = `${indent}  `;
    return `[\n${value.map((v) => `${inner}${compactJson(v, inner)}`).join(',\n')}\n${indent}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '{}';
    if (entries.length <= 4 && entries.every(([, v]) => v === null || typeof v !== 'object')) {
      return `{${entries.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')}}`;
    }
    const inner = `${indent}  `;
    return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${compactJson(v, inner)}`).join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function footer(report: Report): SafeHtml {
  return h(
    'footer',
    null,
    h(
      'p',
      null,
      'Rendered from the report of run ',
      code(report.id),
      ' (inputs ',
      h('code', { class: 'digest' }, str(report.inputDigest)),
      '). This page shows what the report records and adds no claim of its own.',
    ),
  );
}

// ---------------------------------------------------------------------------
// Analysis

function chainSection(id: string, title: string, intro: string, claims: readonly Claim[], empty: string): SafeHtml {
  return section(id, title, h('p', { class: 'muted' }, intro), claims.length ? claims.map(claimBlock) : h('p', { class: 'muted' }, empty));
}

function analysisNative(report: AnalysisReport): SafeHtml {
  const claims = arr<Claim>(report.claims);
  const correctness = claims.find((c) => c.id === 'native.correctness');
  const timing = claims.find((c) => c.id === 'native.timing');
  const rows: Child[][] = [];
  for (const c of [correctness, timing]) {
    if (!c) continue;
    const e = obj(c.evidence);
    rows.push([h('code', null, str(c.id)), statusBadge(c.status), e['cases'] !== undefined ? str(e['cases']) : '-', str(e['label']), str(c.note)]);
  }
  return section(
    'native',
    'Native correctness and timing',
    rows.length
      ? table(['Claim', 'Status', 'Cases', 'Evidence', 'Note'], rows, { numeric: [2] })
      : h('p', { class: 'muted' }, 'This analysis ran no generated Rust.'),
    h('p', { class: 'muted' }, 'An analysis does not take timings; native speed is measured by experiments, under the protocol in docs/batch-interface.md, on the machine that runs them.'),
  );
}

function analysisArticle(report: AnalysisReport, opts: HtmlReportOptions): SafeHtml {
  const claims = arr<Claim>(report.claims);
  const design = claims.filter((c) => c.chain === 'design');
  const impl = claims.filter((c) => c.chain === 'implementation');
  const other = claims.filter((c) => c.chain !== 'design' && c.chain !== 'implementation');
  return h(
    'article',
    { class: 'report' },
    headerBlock(report, opts, 'Analysis', [
      ['Design guarantees', counts(design)],
      ['Implementation correspondence', counts(impl)],
    ]),
    legend(),
    section('summary', 'Claims', summaryTable(claims)),
    inputsSection(report),
    chainSection('design', 'Design guarantees', 'What the specification promises, for the exact design above.', design, 'This report carries no design claims.'),
    chainSection('implementation', 'Implementation correspondence', 'Whether the code computes the specification.', [...impl, ...other], 'This report carries no implementation claims.'),
    analysisNative(report),
    provenanceSection(report, opts, null),
    verifySection(report, opts),
    appendix(report, []),
    footer(report),
  );
}

// ---------------------------------------------------------------------------
// Experiment

function opsText(c: ExperimentCandidate): string {
  const ins = arr(obj(c.program)['instructions']);
  const adds = ins.filter((i) => obj(i)['op'] === 'add').length;
  return `${adds} add, ${ins.length - adds} mul`;
}

function candidateLabel(id: string, ex: ExperimentReport): string {
  const c = arr<ExperimentCandidate>(ex.candidates).find((k) => k.id === id);
  const origin = c ? str(c.origin) : '';
  return origin && origin !== 'search' && origin !== id ? `${id} (${origin})` : id;
}

function measurementsBlock(ex: ExperimentReport, m: Measurements): SafeHtml {
  const comps = arr<Record<string, unknown>>(m.comparisons).map(obj);
  const isPrimary = (c: Record<string, unknown>): boolean => (c['primary'] !== undefined ? c['primary'] === true : c['bytes'] === undefined || c['bytes'] === 65536);
  const primary = comps.filter(isPrimary);
  const rest = comps.filter((c) => !isPrimary(c));
  const compRow = (c: Record<string, unknown>): Child[] => {
    const ci = arr(c['ci95']);
    return [
      str(c['session']),
      c['bytes'] !== undefined ? str(c['bytes']) : '-',
      candidateLabel(str(c['candidate']), ex),
      candidateLabel(str(c['baseline']), ex),
      fixed(c['ratio'], 3),
      `[${fixed(ci[0], 3)}, ${fixed(ci[1], 3)}]`,
    ];
  };
  const head = ['Session', 'Bytes', 'Candidate', 'Baseline', 'Ratio', '95% interval'];
  const sessions = arr<Record<string, unknown>>(m.sessions).map(obj);
  const tri = (v: unknown): string => (v === true ? 'yes' : v === false ? 'no' : 'not reported');
  return fragment(
    h('p', null, 'Verdict: ', h('strong', null, str(m.verdict)), '. ', VERDICT_TEXT[str(m.verdict)] ?? ''),
    h('h3', null, 'Speed-up at the primary workload (64 KiB)'),
    h('p', { class: 'muted' }, 'Speed-up: the median over paired rounds of baseline time / candidate time per column; above 1 means the candidate is faster. The interval is the 95% paired bootstrap interval of that median recorded by the harness.'),
    primary.length ? table(head, primary.map(compRow), { numeric: [0, 1, 4, 5] }) : h('p', { class: 'muted' }, 'No comparison at the primary workload.'),
    rest.length ? fragment(h('h3', null, 'Other workloads'), table(head, rest.map(compRow), { numeric: [0, 1, 4, 5] })) : null,
    sessions.length
      ? fragment(
          h('h3', null, 'Output checks per session'),
          table(
            ['Session', 'All variants agree', 'Every sample consistent'],
            sessions.map((s) => [str(s['session']), tri(s['checksumsAgree']), tri(s['samplesConsistent'])]),
            { numeric: [0] },
          ),
        )
      : null,
    h('h3', null, 'Workloads'),
    table(
      ['Session', 'Variant', 'Bytes', 'Median ns/column', 'IQR ns/column', 'MiB/s', 'Samples'],
      arr<Record<string, unknown>>(m.workloads)
        .map(obj)
        .map((w) => [
          str(w['session'], '-'),
          candidateLabel(str(w['candidate'], '-'), ex),
          str(w['bytes']),
          fixed(w['medianNsPerColumn'], 4),
          fixed(w['iqr'], 4),
          fixed(w['mibPerSec'], 1),
          String(arr(w['samples']).length),
        ]),
      { numeric: [0, 2, 3, 4, 5, 6] },
    ),
    h('p', { class: 'muted' }, 'Raw samples are in report.json and native/ in the bundle.'),
  );
}

const VERDICT_TEXT: Record<string, string> = {
  'locally confirmed': 'The lower bound of the 95% interval exceeded 1.02 in both confirmation sessions against every relevant baseline, for a candidate whose equivalence Lean proved. This holds for the recorded machine, compiler and workloads.',
  inconclusive: 'Intervals overlapped or there were too few samples; no speed-up is claimed.',
  'no improvement': 'No candidate was faster; no speed-up is claimed.',
};

function experimentArticle(ex: ExperimentReport, opts: HtmlReportOptions): SafeHtml {
  const cands = arr<ExperimentCandidate>(ex.candidates);
  const eq = cands.map((c) => obj(c.equivalence) as unknown as Claim);
  const m = ex.measurements ? (obj(ex.measurements) as unknown as Measurements) : null;
  const search = ex.search ? obj(ex.search) : null;
  return h(
    'article',
    { class: 'report' },
    headerBlock(ex, opts, 'Experiment', [
      ['Profile', code(ex.profile)],
      ['Circuit equivalence', counts(eq)],
      ['Timing verdict', m ? str(m.verdict) : 'no measurements'],
    ]),
    legend(),
    section(
      'summary',
      'Candidates',
      cands.length
        ? table(
            ['Candidate', 'Origin', 'Operations', 'Equivalence', 'Native correctness'],
            cands.map((c) => {
              const n = c.native ? obj(c.native) : null;
              return [
                h('a', { href: `#candidate-${str(c.id).replace(/[^A-Za-z0-9_-]/g, '_')}` }, str(c.id)),
                str(c.origin),
                opsText(c),
                statusBadge(obj(c.equivalence)['status']),
                n ? (n['passed'] === true ? `passed ${str(n['cases'])} cases` : `failed (${str(n['cases'])} cases)`) : 'not run',
              ];
            }),
          )
        : h('p', { class: 'muted' }, 'No candidate was checked.'),
      search
        ? h(
            'p',
            null,
            `Search seed `,
            code(search['seed']),
            `, ${str(search['generated'])} generated, shortlist ${arr(search['shortlist']).map((s) => str(s)).join(', ') || '(none)'}.`,
          )
        : null,
    ),
    inputsSection(ex),
    section(
      'design',
      'Design guarantees',
      h('p', { class: 'muted' }, 'An experiment does not check design guarantees; an analysis of the same design does. The circuits below are checked against the design matrix above.'),
    ),
    section(
      'implementation',
      'Implementation correspondence',
      h('p', { class: 'muted' }, 'Circuit equivalence of every candidate, checked by Lean, and native correctness of the generated Rust.'),
      cands.map((c) =>
        h(
          'div',
          { class: 'candidate', id: `candidate-${str(c.id).replace(/[^A-Za-z0-9_-]/g, '_')}` },
          h('h3', null, 'Candidate ', h('code', null, str(c.id)), ` (${str(c.origin)}, ${opsText(c)})`),
          claimBlock(obj(c.equivalence) as unknown as Claim),
          c.native
            ? dl([
                ['Native correctness', obj(c.native)['passed'] === true ? `passed ${str(obj(c.native)['cases'])} cases` : `failed (${str(obj(c.native)['cases'])} cases)`],
                ['Output checksum', h('code', { class: 'digest' }, str(obj(c.native)['checksum']))],
              ])
            : h('p', { class: 'muted' }, 'Native correctness was not run for this candidate.'),
          h('pre', { class: 'listing program', 'aria-label': `Circuit ${str(c.id)}` }, programListing(c.program)),
        ),
      ),
    ),
    section('native', 'Native timing', m ? measurementsBlock(ex, m) : h('p', { class: 'muted' }, 'No measurements were taken.')),
    provenanceSection(ex, opts, m ? m.machine : null),
    verifySection(ex, opts),
    appendix(ex, []),
    footer(ex),
  );
}

// ---------------------------------------------------------------------------
// Style sheet: light by default and always light in print; dark on screen
// when the reader's system asks for it. No web fonts.

const STYLE = `
:root{--fg:#1b1f24;--muted:#57606a;--bg:#fff;--panel:#f6f8fa;--line:#d0d7de;--code:#0b3b6f;
--ok:#116329;--ok-bg:#dafbe1;--bad:#a40e26;--bad-bg:#ffebe9;--warn:#7d4e00;--warn-bg:#fff8c5;--other-bg:#eaeef2;
font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:15px;line-height:1.5;color:var(--fg);background:var(--bg)}
@media screen and (prefers-color-scheme:dark){:root{--fg:#e6edf3;--muted:#9da7b3;--bg:#0d1117;--panel:#161b22;--line:#30363d;--code:#a5d6ff;
--ok:#7ee787;--ok-bg:#12261e;--bad:#ffa198;--bad-bg:#2d1214;--warn:#e3b341;--warn-bg:#2b2111;--other-bg:#21262d}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg)}
main{max-width:60rem;margin:0 auto;padding:2rem 1.25rem 3rem}
h1{font-size:1.6rem;margin:.2rem 0 1rem;line-height:1.25}
h2{font-size:1.25rem;margin:2.2rem 0 .8rem;padding-bottom:.3rem;border-bottom:1px solid var(--line)}
h3{font-size:1.05rem;margin:1.4rem 0 .5rem}
h4{font-size:.95rem;margin:1rem 0 .4rem}
p{margin:.4rem 0 .8rem}
a{color:var(--code)}
code,pre{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;font-size:.88em}
code{color:var(--code);overflow-wrap:break-word}
code.digest{overflow-wrap:anywhere}
pre{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:.6rem .8rem;white-space:pre-wrap;overflow-wrap:anywhere;margin:.4rem 0 .8rem}
pre.statement{margin:0;background:transparent;border:0;padding:0;color:var(--code)}
pre.json{font-size:.78em}
pre.program{column-width:13rem;column-gap:2rem;column-rule:1px solid var(--line)}
.eyebrow{text-transform:uppercase;letter-spacing:.06em;font-size:.75rem;color:var(--muted);margin:0}
.id{font-size:.8em}
.digest{font-size:.82em}
.muted{color:var(--muted)}
.warn{color:var(--warn);font-weight:600}
dl.kv{display:grid;grid-template-columns:minmax(9rem,max-content) 1fr;gap:.25rem 1rem;margin:.4rem 0 .8rem}
dl.kv dt{color:var(--muted)}
dl.kv dd{margin:0;min-width:0}
table{border-collapse:collapse;width:100%;margin:.4rem 0 .9rem;font-size:.9em}
caption{text-align:left;color:var(--muted);padding-bottom:.3rem}
th,td{border:1px solid var(--line);padding:.3rem .5rem;text-align:left;vertical-align:top;overflow-wrap:break-word}
thead th{background:var(--panel)}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
table.matrix{width:auto;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.82em}
table.matrix th{color:var(--muted);font-weight:normal;background:var(--panel)}
table.matrix td{text-align:right;max-width:22rem}
table.sbox td{padding:.1rem .3rem}
table.vector{width:auto}
.badge{display:inline-block;padding:.05rem .5rem;border-radius:999px;font-size:.8rem;font-weight:600;white-space:nowrap;border:1px solid transparent}
.badge-proved{color:var(--ok);background:var(--ok-bg);border-color:var(--ok)}
.badge-refuted{color:var(--bad);background:var(--bad-bg);border-color:var(--bad)}
.badge-not-established{color:var(--warn);background:var(--warn-bg);border-color:var(--warn)}
.badge-unsupported,.badge-other{color:var(--fg);background:var(--other-bg);border-color:var(--line)}
.legend{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:.6rem 1rem;margin:1rem 0;font-size:.9em}
.legend h3{margin:.2rem 0 .4rem;font-size:.95rem}
.legend ul{margin:0 0 .4rem;padding-left:1rem}
.legend li{margin:.2rem 0}
.claim{border:1px solid var(--line);border-left-width:4px;border-radius:6px;padding:.6rem .9rem;margin:.8rem 0}
.claim-proved{border-left-color:var(--ok)}
.claim-refuted{border-left-color:var(--bad)}
.claim-not-established{border-left-color:var(--warn)}
.claim>header{display:flex;justify-content:space-between;align-items:baseline;gap:1rem}
.claim>header h3{margin:0 0 .4rem;font-size:1rem}
.witness{background:var(--bad-bg);border-radius:6px;padding:.4rem .8rem;margin-top:.4rem}
.claim-proved .witness,.claim-not-established .witness{background:var(--panel)}
.witness h4{margin:.2rem 0 .3rem}
.candidate{margin:1.4rem 0}
.report-head{margin-bottom:1rem}
footer{margin-top:2.5rem;padding-top:.6rem;border-top:1px solid var(--line);color:var(--muted);font-size:.85em}
.report+.report{margin-top:3rem;border-top:3px double var(--line);padding-top:1rem}
.gate+.report{margin-top:2.5rem}
@media (max-width:640px){dl.kv{grid-template-columns:1fr}dl.kv dt{margin-top:.3rem}main{padding:1rem}}
@page{margin:16mm 14mm}
@media print{
:root{--fg:#000;--muted:#444;--bg:#fff;--panel:#f3f4f6;--line:#b8bfc7;--code:#0b3b6f;font-size:10pt}
main{max-width:none;padding:0}
a{color:inherit;text-decoration:none}
h2{break-after:avoid;page-break-after:avoid}
h3,h4{break-after:avoid;page-break-after:avoid}
.claim,.legend,.witness,table.matrix,dl.kv,tr{break-inside:avoid;page-break-inside:avoid}
pre{break-inside:auto}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.report+.report{break-before:page;page-break-before:always;border-top:0}
}
`;
