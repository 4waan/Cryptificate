/**
 * Renderings of check and verify results: snapshot tests for every format
 * over recorded example reports, the SARIF 2.1.0 essentials, the JSON
 * position scanner and input pattern expansion.
 *
 * Snapshots live in test/snapshots; regenerate them with
 * UPDATE_SNAPSHOTS=1 npm test -w apps/server and review the diff.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AnalysisReport } from '@cryptificate/schema';
import type { Style } from '../src/format.js';
import { expandGlob, expandInputs } from '../src/glob.js';
import { locateJson, positionOf } from '../src/json-locate.js';
import { KNOWN_CLAIM_IDS, parseClaimList, parseFailOn, violates } from '../src/policy.js';
import type { FailOn } from '../src/policy.js';
import {
  artifactUri,
  checkToHtml,
  checkToJUnit,
  checkToMarkdown,
  checkToSarif,
  checkToText,
  evaluateCheckEntry,
  evaluateVerifyEntry,
  makeCheckRun,
  makeVerifyRun,
  verifyToHtml,
  verifyToJUnit,
  verifyToMarkdown,
  verifyToSarif,
  verifyToText,
} from '../src/report-formats.js';
import type { CheckInput, CheckRun, VerifyRun } from '../src/report-formats.js';
import type { VerifyResult } from '../src/verify.js';

const here = dirname(fileURLToPath(import.meta.url));
/** apps/server/dist/test -> repository root */
const ROOT = resolve(here, '../../../..');
const SNAPSHOTS = resolve(here, '../../test/snapshots');
const PLAIN: Style = { bold: (s) => s, dim: (s) => s, status: (_s, t = _s) => t };

function read(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function snapshot(name: string, actual: string): void {
  const file = join(SNAPSHOTS, name);
  if (process.env['UPDATE_SNAPSHOTS'] === '1') {
    mkdirSync(SNAPSHOTS, { recursive: true });
    writeFileSync(file, actual);
    return;
  }
  const expected = read(file);
  assert.ok(expected !== null, `missing snapshot ${name}; run with UPDATE_SNAPSHOTS=1`);
  assert.equal(actual, expected, `snapshot ${name} differs; run with UPDATE_SNAPSHOTS=1 and review the diff`);
}

function exampleReport(name: string): { input: CheckInput; report: AnalysisReport } {
  const file = `examples/bundles/${name}/report.json`;
  const report = JSON.parse(readFileSync(join(ROOT, file), 'utf8')) as AnalysisReport;
  return { input: { file, designPointer: '/inputs/design', programPointer: report.inputs.program ? '/inputs/program' : null }, report };
}

function checkRun(names: string[], failOn: FailOn, withError = false, only: Set<string> | null = null): CheckRun {
  const entries = names.map((n) => {
    const { input, report } = exampleReport(n);
    return evaluateCheckEntry({ input, state: report.execution.state as 'completed', report }, failOn, only);
  });
  if (withError) {
    entries.push(
      evaluateCheckEntry(
        { input: { file: 'examples/designs/missing.json', designPointer: '', programPointer: null }, state: 'error', report: null, error: 'cannot read examples/designs/missing.json: ENOENT' },
        failOn,
        only,
      ),
    );
  }
  return makeCheckRun(entries, failOn, only);
}

const VERIFY_RESULT: VerifyResult = {
  kind: 'analysis',
  id: '9421acab267bd47776b29d832356e9f9',
  inputDigest: { recorded: 'sha256:e55f3e07cf131691b0cd8aca16972ba3ea957bb50d043f3bd76de552b5171616', recomputed: 'sha256:e55f3e07cf131691b0cd8aca16972ba3ea957bb50d043f3bd76de552b5171616' },
  state: 'completed',
  rows: [
    { subject: 'design', claim: 'matrix.mds', recorded: 'refuted', recomputed: 'refuted', result: 'match' },
    { subject: 'design', claim: 'offsets.dispersion', recorded: 'proved', recomputed: 'proved', result: 'match' },
    { subject: 'design', claim: 'activity.bound', recorded: 'proved', recomputed: 'not_established', result: 'mismatch' },
    { subject: 'implementation', claim: 'native.correctness', recorded: 'proved', recomputed: '-', result: 'not re-checked' },
    { subject: 'implementation', claim: 'native.timing', recorded: 'not_established', recomputed: '-', result: 'historical' },
  ],
  ok: false,
  notes: ['Timings in the bundle are historical and were not re-measured.'],
};

function verifyRun(failOn: FailOn): VerifyRun {
  return makeVerifyRun(
    [
      evaluateVerifyEntry({ bundle: 'examples/bundles/identity/identity.tar.gz', result: VERIFY_RESULT }, failOn, null),
      evaluateVerifyEntry({ bundle: 'missing.tar.gz', result: null, error: 'cannot verify missing.tar.gz: ENOENT' }, failOn, null),
    ],
    failOn,
    null,
  );
}

// ---------------------------------------------------------------------------
// SARIF 2.1.0 essentials

const KINDS = ['pass', 'fail', 'open', 'review', 'notApplicable', 'informational'];
const LEVELS = ['none', 'note', 'warning', 'error'];

/** The parts of the SARIF 2.1.0 schema that consumers (GitHub code scanning among them) rely on. */
function assertSarifEssentials(log: unknown): void {
  const l = log as Record<string, unknown>;
  assert.equal(l['version'], '2.1.0');
  assert.equal(typeof l['$schema'], 'string');
  assert.ok(Array.isArray(l['runs']) && l['runs'].length > 0, 'runs');
  for (const run of l['runs'] as Record<string, unknown>[]) {
    const driver = (run['tool'] as { driver?: Record<string, unknown> } | undefined)?.driver;
    assert.ok(driver, 'runs[].tool.driver');
    assert.equal(typeof driver['name'], 'string');
    assert.ok((driver['name'] as string).length > 0);
    const rules = (driver['rules'] ?? []) as Record<string, unknown>[];
    assert.ok(Array.isArray(rules));
    const ruleIds = rules.map((r) => r['id']);
    assert.equal(new Set(ruleIds).size, ruleIds.length, 'rule ids are unique');
    for (const r of rules) {
      assert.equal(typeof r['id'], 'string');
      assert.equal(typeof (r['shortDescription'] as { text?: unknown }).text, 'string');
    }
    assert.ok(Array.isArray(run['results']), 'runs[].results');
    for (const res of run['results'] as Record<string, unknown>[]) {
      assert.equal(typeof (res['message'] as { text?: unknown }).text, 'string', 'result.message.text');
      assert.equal(typeof res['ruleId'], 'string');
      const idx = res['ruleIndex'] as number;
      assert.ok(Number.isInteger(idx) && idx >= 0 && idx < rules.length, 'ruleIndex in range');
      assert.equal(rules[idx]!['id'], res['ruleId'], 'ruleIndex names the rule of ruleId');
      assert.ok(KINDS.includes(res['kind'] as string), `kind ${String(res['kind'])}`);
      assert.ok(LEVELS.includes(res['level'] as string), `level ${String(res['level'])}`);
      // SARIF 2.1.0 section 3.27.10: a result whose kind is not "fail" has level "none"
      if (res['kind'] !== 'fail') assert.equal(res['level'], 'none');
      const locations = res['locations'] as Record<string, unknown>[];
      assert.ok(Array.isArray(locations) && locations.length > 0);
      for (const loc of locations) {
        const phys = loc['physicalLocation'] as Record<string, unknown>;
        assert.equal(typeof (phys['artifactLocation'] as { uri?: unknown }).uri, 'string');
        const region = phys['region'] as { startLine?: number; startColumn?: number } | undefined;
        if (region) {
          assert.ok(Number.isInteger(region.startLine) && region.startLine! >= 1);
          assert.ok(Number.isInteger(region.startColumn) && region.startColumn! >= 1);
        }
      }
      const fp = res['partialFingerprints'] as Record<string, unknown> | undefined;
      if (fp) for (const v of Object.values(fp)) assert.equal(typeof v, 'string');
    }
    for (const inv of (run['invocations'] ?? []) as Record<string, unknown>[]) {
      assert.equal(typeof inv['executionSuccessful'], 'boolean');
    }
  }
}

function lineOf(text: string, needle: string): number {
  const at = text.indexOf(needle);
  assert.ok(at >= 0, `${needle} not found`);
  return text.slice(0, at).split('\n').length;
}

// ---------------------------------------------------------------------------
// Snapshots

const CHECK_EXAMPLES = ['aes-wrong-wire', 'repeated-offsets', 'poseidon2-exponent3'];

test('check: text rendering (snapshot)', () => {
  snapshot('check.txt', `${checkToText(checkRun(CHECK_EXAMPLES, 'refuted', true), PLAIN)}\n`);
});

test('check: markdown rendering (snapshot)', () => {
  snapshot('check.md', checkToMarkdown(checkRun(CHECK_EXAMPLES, 'refuted', true)));
});

test('check: JUnit rendering (snapshot)', () => {
  snapshot('check.junit.xml', checkToJUnit(checkRun(CHECK_EXAMPLES, 'not-established', true)));
});

test('check: SARIF rendering (snapshot) meets the SARIF 2.1.0 essentials', () => {
  const log = checkToSarif(checkRun(CHECK_EXAMPLES, 'refuted', true), { cwd: ROOT, read });
  assertSarifEssentials(log);
  snapshot('check.sarif.json', `${JSON.stringify(log, null, 2)}\n`);
});

test('verify: text, markdown, JUnit and SARIF renderings (snapshots)', () => {
  const run = verifyRun('refuted');
  snapshot('verify.txt', `${verifyToText(run, PLAIN)}\n`);
  snapshot('verify.md', verifyToMarkdown(run));
  snapshot('verify.junit.xml', verifyToJUnit(run));
  const log = verifyToSarif(run, { cwd: ROOT, read });
  assertSarifEssentials(log);
  snapshot('verify.sarif.json', `${JSON.stringify(log, null, 2)}\n`);
});

test('verify: HTML rendering (snapshot)', () => {
  // The style sheet is the shared renderer's and is pinned by its own snapshots in packages/schema.
  const html = verifyToHtml(verifyRun('refuted'));
  assert.match(html, /<style>[\s\S]+?<\/style>/);
  snapshot('verify.html', html.replace(/<style>[\s\S]*?<\/style>/, '<style>/* report style sheet */</style>'));
});

test('check: HTML is one inert document with the policy outcome and every report', () => {
  const run = checkRun(CHECK_EXAMPLES, 'refuted', true);
  const html = checkToHtml(run);
  assert.ok(html.startsWith('<!DOCTYPE html>\n'));
  assert.ok(!/<script|<img|<link|src=/i.test(html));
  assert.match(html, /<h2 id="gate-h">Cryptificate check<\/h2>/);
  assert.match(html, /Result: <span class="badge badge-not-established">error<\/span> \(policy --fail-on refuted, exit 2\)/);
  assert.ok(html.includes('<code>examples/designs/missing.json</code>: error: cannot read examples/designs/missing.json: ENOENT'));
  assert.ok(html.includes('rejected by the policy: circuit.equivalence, native.correctness'));
  for (const name of CHECK_EXAMPLES) {
    const { report } = exampleReport(name);
    assert.ok(html.includes(`<code class="id">${report.id}</code>`), name);
  }
  assert.equal((html.match(/<article class="report">/g) ?? []).length, CHECK_EXAMPLES.length);

  // a single report without a policy is that report alone, under its own title
  const one = checkToHtml(checkRun(['identity'], 'none'));
  assert.ok(!one.includes('id="gate"'));
  assert.match(one, /<title>Cryptificate evidence report: analysis [0-9a-f]{32}<\/title>/);
  // the toolchain of a bundle input is shown when the caller has it
  const file = 'examples/bundles/identity/report.json';
  const withTc = checkToHtml(checkRun(['identity'], 'none'), { toolchains: new Map([[file, { leanToolchain: 'leanprover/lean4:v4.33.1' }]]) });
  assert.ok(withTc.includes('Recorded toolchain (toolchain.json)') && withTc.includes('leanprover/lean4:v4.33.1'));
});

// ---------------------------------------------------------------------------
// Content checks independent of the snapshots

test('SARIF results point at the claim in the design file and carry claim, status, evidence and counterexample', () => {
  const log = checkToSarif(checkRun(['aes-wrong-wire', 'repeated-offsets', 'poseidon2-exponent3', 'identity'], 'refuted'), { cwd: ROOT, read }) as {
    runs: { results: { ruleId: string; kind: string; level: string; message: { text: string }; locations: { physicalLocation: { artifactLocation: { uri: string }; region?: { startLine: number } } }[]; properties: Record<string, unknown> }[]; invocations: { exitCode: number }[] }[];
  };
  const results = log.runs[0]!.results;
  const find = (uri: string, id: string) => {
    const r = results.find((x) => x.ruleId === id && x.locations[0]!.physicalLocation.artifactLocation.uri === uri);
    assert.ok(r, `${uri} ${id}`);
    return r;
  };
  // the identity matrix: refuted with its branch counterexample, at "matrix" of the design
  const idFile = 'examples/bundles/identity/report.json';
  const idText = readFileSync(join(ROOT, idFile), 'utf8');
  const mds = find(idFile, 'matrix.mds');
  assert.equal(mds.kind, 'fail');
  assert.equal(mds.level, 'error');
  assert.equal(mds.properties['claimId'], 'matrix.mds');
  assert.equal(mds.properties['status'], 'refuted');
  assert.equal(mds.properties['evidenceLabel'], 'Lean-checked counterexample');
  assert.deepEqual((mds.properties['counterexample'] as { kind: string }).kind, 'branch');
  assert.match(mds.message.text, /Counterexample: input \[01,00,00,00\] -> \[01,00,00,00\], weight 1\+1 < 5/);
  assert.equal(mds.locations[0]!.physicalLocation.region?.startLine, lineOf(idText, '"matrix"'));
  // the repeated offset: at the second row that shares it
  const roFile = 'examples/bundles/repeated-offsets/report.json';
  const roText = readFileSync(join(ROOT, roFile), 'utf8');
  const offsets = find(roFile, 'offsets.dispersion');
  assert.equal(offsets.level, 'error');
  const offLine = lineOf(roText, '"offsets"');
  assert.ok(offsets.locations[0]!.physicalLocation.region!.startLine > offLine, 'points inside the offsets array');
  // the wrong wire: at the differing output of the circuit
  const wwFile = 'examples/bundles/aes-wrong-wire/report.json';
  const eq = find(wwFile, 'circuit.equivalence');
  assert.equal(eq.properties['status'], 'refuted');
  assert.equal(eq.properties['jsonPointer'], '/inputs/program/outputs/0');
  // the cube map over BN254: at the exponent
  const p3 = find('examples/bundles/poseidon2-exponent3/report.json', 'sbox.bijective');
  assert.equal(p3.properties['jsonPointer'], '/inputs/design/sbox/exponent');
  // not established and unsupported claims are never failures under --fail-on refuted
  for (const r of results) {
    if (r.properties['status'] !== 'refuted') assert.notEqual(r.kind, 'fail', `${r.ruleId} ${r.properties['status']}`);
    if (r.properties['status'] !== 'refuted') assert.equal(r.properties['counterexample'], undefined);
  }
  assert.equal(log.runs[0]!.invocations[0]!.exitCode, 1);
});

test('SARIF regions for a bare design and for a request file with a separate circuit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cryptificate-sarif-'));
  try {
    const { report } = exampleReport('aes-wrong-wire');
    writeFileSync(join(dir, 'design.json'), `${JSON.stringify(report.inputs.design, null, 2)}\n`);
    writeFileSync(join(dir, 'circuit.json'), `${JSON.stringify(report.inputs.program, null, 2)}\n`);
    const entry = evaluateCheckEntry({ input: { file: 'design.json', programFile: 'circuit.json', designPointer: '', programPointer: '' }, state: 'completed', report }, 'refuted', null);
    const log = checkToSarif(makeCheckRun([entry], 'refuted', null), { cwd: dir, read }) as {
      runs: { results: { ruleId: string; locations: { physicalLocation: { artifactLocation: { uri: string }; region?: { startLine: number; startColumn: number } } }[] }[] }[];
    };
    assertSarifEssentials(log);
    const byId = new Map(log.runs[0]!.results.map((r) => [r.ruleId, r.locations[0]!.physicalLocation]));
    const design = readFileSync(join(dir, 'design.json'), 'utf8');
    const circuit = readFileSync(join(dir, 'circuit.json'), 'utf8');
    assert.deepEqual(byId.get('matrix.mds'), { artifactLocation: { uri: 'design.json' }, region: { startLine: lineOf(design, '"matrix"'), startColumn: 3 } });
    assert.equal(byId.get('activity.bound')!.region!.startLine, lineOf(design, '"rounds"'));
    assert.equal(byId.get('circuit.equivalence')!.artifactLocation.uri, 'circuit.json');
    // outputs[0] is the first element after "outputs": [
    assert.equal(byId.get('circuit.equivalence')!.region!.startLine, lineOf(circuit, '"outputs"') + 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('policy outcomes: scope, statuses and exit codes', () => {
  assert.equal(checkRun(['aes-wrong-wire'], 'none').exitCode, 0);
  assert.equal(checkRun(['aes-wrong-wire'], 'refuted').exitCode, 1);
  assert.deepEqual(checkRun(['aes-wrong-wire'], 'refuted').results[0]!.violations, ['circuit.equivalence', 'native.correctness']);
  // restricted to the design claims, which all hold
  assert.equal(checkRun(['aes-wrong-wire'], 'any', false, new Set(['matrix.mds', 'offsets.dispersion', 'sbox.bijective', 'activity.bound'])).exitCode, 0);
  // the activity bound is not established when MDS is refuted: only stricter policies reject it
  const id = checkRun(['identity'], 'not-established', false, new Set(['activity.bound']));
  assert.equal(id.exitCode, 1);
  assert.equal(checkRun(['identity'], 'refuted', false, new Set(['activity.bound'])).exitCode, 0);
  // unsupported fails only "any"; native.timing (not run) is outside the default scope
  assert.equal(checkRun(['poseidon2-exponent3'], 'not-established', false, new Set(['rust.refinement'])).exitCode, 0);
  assert.equal(checkRun(['poseidon2-exponent3'], 'any', false, new Set(['rust.refinement'])).exitCode, 1);
  assert.ok(!checkRun(['aes-wrong-wire'], 'any').results[0]!.violations.includes('native.timing'));
  // an unreadable input is an error (2) and takes precedence over a policy failure (1)
  assert.equal(checkRun(['aes-wrong-wire'], 'refuted', true).exitCode, 2);
  // a run that did not complete is an error whatever the policy
  const { input, report } = exampleReport('aes-shared-sum');
  assert.equal(makeCheckRun([evaluateCheckEntry({ input, state: 'timeout', report }, 'none', null)], 'none', null).exitCode, 2);
  // a claim left unchecked by a missing tool is an error under a policy, not a pass
  const missing: AnalysisReport = JSON.parse(JSON.stringify(report));
  const nc = missing.claims.find((c) => c.id === 'native.correctness')!;
  Object.assign(nc, { status: 'not_established', reason: 'native-unavailable' });
  assert.equal(makeCheckRun([evaluateCheckEntry({ input, state: 'completed', report: missing }, 'refuted', null)], 'refuted', null).exitCode, 2);
  assert.equal(makeCheckRun([evaluateCheckEntry({ input, state: 'completed', report: missing }, 'none', null)], 'none', null).exitCode, 0);
  // verify: a mismatch fails whatever the policy; the policy applies to re-checked claims
  assert.equal(verifyRun('none').results[0]!.outcome, 'policy-failure');
  const okResult: VerifyResult = { ...VERIFY_RESULT, ok: true, rows: VERIFY_RESULT.rows.filter((r) => r.result !== 'mismatch') };
  assert.equal(evaluateVerifyEntry({ bundle: 'b', result: okResult }, 'none', null).outcome, 'pass');
  assert.equal(evaluateVerifyEntry({ bundle: 'b', result: okResult }, 'refuted', null).outcome, 'policy-failure');
  assert.equal(evaluateVerifyEntry({ bundle: 'b', result: okResult }, 'refuted', new Set(['offsets.dispersion'])).outcome, 'pass');
  assert.equal(evaluateVerifyEntry({ bundle: 'b', result: null, error: 'x' }, 'none', null).outcome, 'error');
});

test('verify outcomes: a re-run that did not complete or lacked a tool is an error, never a pass or a policy failure', () => {
  const okResult: VerifyResult = { ...VERIFY_RESULT, ok: true, rows: VERIFY_RESULT.rows.filter((r) => r.result !== 'mismatch') };
  const ev = (result: VerifyResult, failOn: FailOn, only: Set<string> | null = null) => evaluateVerifyEntry({ bundle: 'b', result }, failOn, only);
  // the re-run failed (Lean missing): every row "matches" not_established, yet nothing was checked
  const noLean: VerifyResult = {
    ...VERIFY_RESULT,
    state: 'failed',
    ok: true,
    rows: [
      { subject: 'design', claim: 'matrix.mds', recorded: 'not_established', recomputed: 'not_established', result: 'match', reason: 'lean-unavailable', recomputedReason: 'lean-unavailable' },
      { subject: 'design', claim: 'offsets.dispersion', recorded: 'not_established', recomputed: 'not_established', result: 'match', reason: 'lean-unavailable', recomputedReason: 'lean-unavailable' },
    ],
  };
  for (const failOn of ['none', 'refuted', 'any'] as const) {
    const e = ev(noLean, failOn);
    assert.equal(e.outcome, 'error', failOn);
    assert.match(e.problems[0]!, /the re-run ended with state failed/);
  }
  assert.equal(makeVerifyRun([ev(noLean, 'refuted')], 'refuted', null).exitCode, 2);
  // a bundle of proved claims re-checked without Lean: mismatches caused by the missing tool are errors (2), not policy failures (1)
  const mismatchNoLean: VerifyResult = {
    ...VERIFY_RESULT,
    state: 'failed',
    ok: false,
    rows: [{ subject: 'design', claim: 'matrix.mds', recorded: 'proved', recomputed: 'not_established', result: 'mismatch', recomputedReason: 'lean-unavailable' }],
  };
  assert.equal(ev(mismatchNoLean, 'refuted').outcome, 'error');
  // the same with a completed state (e.g. only the native toolchain missing): still an error
  const nativeMissing: VerifyResult = { ...mismatchNoLean, state: 'completed', rows: [{ ...mismatchNoLean.rows[0]!, claim: 'native.correctness', subject: 'implementation', recomputedReason: 'native-unavailable' }, ...okResult.rows] };
  const nm = ev(nativeMissing, 'none');
  assert.equal(nm.outcome, 'error');
  assert.deepEqual(nm.problems, ['implementation native.correctness could not be re-checked (native-unavailable)']);
  // a real mismatch stays a policy failure
  assert.equal(ev(VERIFY_RESULT, 'refuted').outcome, 'policy-failure');
  // an in-scope claim that verify does not re-check is an error under a policy, never gated on the recorded status
  for (const id of ['native.correctness', 'native.timing']) {
    const e = ev(okResult, 'any', new Set([id]));
    assert.equal(e.outcome, 'error', id);
    assert.deepEqual(e.violations, []);
    assert.match(e.problems[0]!, new RegExp(`${id.replace('.', '\\.')} cannot be re-checked by verify`));
  }
  assert.equal(ev(okResult, 'none', new Set(['native.correctness'])).outcome, 'pass');
  // nothing re-checked at all is an error
  const nothing: VerifyResult = { ...okResult, ok: false, rows: okResult.rows.filter((r) => r.result !== 'match') };
  assert.equal(ev(nothing, 'none').outcome, 'error');
  assert.deepEqual(ev(nothing, 'none').problems, ['no claim could be re-checked']);
});

test('--claims: unknown ids are usage errors; an id an input does not carry is an error under a policy', () => {
  assert.deepEqual([...parseClaimList(['matrix.mds,offsets.dispersion', ' external.mds '])!], ['matrix.mds', 'offsets.dispersion', 'external.mds']);
  assert.equal(parseClaimList(undefined), null);
  assert.equal(parseClaimList([' , ']), null);
  for (const typo of ['matrix.mdss', 'MATRIX.MDS', 'mds']) assert.throws(() => parseClaimList(['offsets.dispersion', typo]), new RegExp(`unknown claim id "${typo.replace(/\./g, '\\.')}"`));
  for (const id of ['matrix.mds', 'external.mds', 'internal.invertible', 'activity.outer', 'circuit.equivalence', 'native.correctness', 'native.timing', 'rust.refinement']) assert.ok(KNOWN_CLAIM_IDS.has(id), id);
  // a gate across AES-like and HADES designs on matrix.mds: the Poseidon2 report has external.mds instead
  const mixed = checkRun(['aes-wrong-wire', 'poseidon2-exponent3'], 'refuted', false, new Set(['matrix.mds']));
  assert.equal(mixed.exitCode, 2);
  assert.deepEqual(mixed.results.map((e) => [e.outcome, e.absent]), [
    ['pass', undefined],
    ['error', ['matrix.mds']],
  ]);
  assert.match(checkToText(mixed, PLAIN), /poseidon2-exponent3\/report\.json: error: requested claim matrix\.mds not in this report/);
  assert.match(checkToMarkdown(mixed), /Error: requested `matrix\.mds` not in this report\./);
  assert.match(checkToJUnit(mixed), /<error type="absent-claim" message="requested claim matrix\.mds not in this report"/);
  // without a policy, --claims gates nothing and an absent id is not an error
  assert.equal(checkRun(['poseidon2-exponent3'], 'none', false, new Set(['matrix.mds'])).exitCode, 0);
  // verify: the same rule for bundles
  const okResult: VerifyResult = { ...VERIFY_RESULT, ok: true, rows: VERIFY_RESULT.rows.filter((r) => r.result !== 'mismatch') };
  const absent = evaluateVerifyEntry({ bundle: 'b', result: okResult }, 'refuted', new Set(['offsets.dispersion', 'external.mds']));
  assert.equal(absent.outcome, 'error');
  assert.deepEqual(absent.problems, ['requested claim external.mds not in the bundle']);
});

test('fail-on values', () => {
  assert.equal(parseFailOn(undefined), 'none');
  assert.equal(parseFailOn('not_established'), 'not-established');
  assert.throws(() => parseFailOn('sometimes'), /--fail-on must be one of/);
  assert.equal(violates('refuted', 'refuted'), true);
  assert.equal(violates('not_established', 'refuted'), false);
  assert.equal(violates('not_established', 'not-established'), true);
  assert.equal(violates('unsupported', 'not-established'), false);
  assert.equal(violates('unsupported', 'any'), true);
  assert.equal(violates('proved', 'any'), false);
  assert.equal(violates('match', 'any'), false);
});

test('JUnit output is well formed: balanced elements, escaped text, consistent counts', () => {
  const xmlText = checkToJUnit(checkRun(CHECK_EXAMPLES, 'not-established', true));
  const stack: string[] = [];
  for (const m of xmlText.matchAll(/<(\/?)([A-Za-z-]+)[^>]*?(\/?)>/g)) {
    const [, close, name, self] = m;
    if (self) continue;
    if (close) assert.equal(stack.pop(), name);
    else stack.push(name!);
  }
  assert.deepEqual(stack, []);
  // no raw markup characters outside tags and attribute values
  assert.doesNotMatch(xmlText.replace(/<[^>]*>/g, ''), /[<>]/);
  const top = /<testsuites [^>]*tests="(\d+)" failures="(\d+)" errors="(\d+)" skipped="(\d+)"/.exec(xmlText)!;
  assert.equal(Number(top[1]), (xmlText.match(/<testcase /g) ?? []).length);
  assert.equal(Number(top[2]), (xmlText.match(/<failure /g) ?? []).length);
  assert.equal(Number(top[3]), (xmlText.match(/<error /g) ?? []).length);
  assert.equal(Number(top[4]), (xmlText.match(/<skipped /g) ?? []).length);
});

test('artifact URIs are relative inside the working directory and file URLs outside it', () => {
  assert.equal(artifactUri('examples/designs/aes.json', ROOT), 'examples/designs/aes.json');
  assert.equal(artifactUri(join(ROOT, 'examples', 'designs', 'aes.json'), ROOT), 'examples/designs/aes.json');
  assert.match(artifactUri('/elsewhere/d.json', ROOT), /^file:\/\/\/elsewhere\/d\.json$/);
});

test('JSON positions by pointer', () => {
  const text = '{\n  "a": [1, {"b~/c": "x\\"y"}],\n  "d": {}\n}\n';
  const pos = locateJson(text)!;
  assert.deepEqual(pos.get(''), { line: 1, column: 1 });
  assert.deepEqual(pos.get('/a'), { line: 2, column: 3 });
  assert.deepEqual(pos.get('/a/0'), { line: 2, column: 9 });
  assert.deepEqual(pos.get('/a/1'), { line: 2, column: 12 });
  assert.deepEqual(pos.get('/a/1/b~0~1c'), { line: 2, column: 13 });
  assert.deepEqual(pos.get('/d'), { line: 3, column: 3 });
  assert.deepEqual(positionOf(pos, '/a/7/z'), { line: 2, column: 3 });
  assert.equal(locateJson('{"a": }'), null);
  assert.equal(locateJson('{"a": 1} x'), null);
  assert.equal(positionOf(null, '/a'), null);
  // agrees with JSON.parse on the example designs
  for (const f of ['aes.json', 'poseidon2-bn254.json']) {
    const t = readFileSync(join(ROOT, 'examples', 'designs', f), 'utf8');
    const p = locateJson(t)!;
    for (const key of Object.keys(JSON.parse(t) as object)) assert.ok(p.has(`/${key}`), `${f} /${key}`);
  }
});

test('input patterns', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cryptificate-glob-'));
  try {
    for (const f of ['a.json', 'b.json', 'c.txt', 'sub/d.json', 'sub/deeper/e.json', '.hidden/f.json']) {
      mkdirSync(dirname(join(dir, f)), { recursive: true });
      writeFileSync(join(dir, f), '{}');
    }
    assert.deepEqual(expandGlob('*.json', dir), ['a.json', 'b.json']);
    assert.deepEqual(expandGlob('**/*.json', dir), ['a.json', 'b.json', 'sub/d.json', 'sub/deeper/e.json']);
    assert.deepEqual(expandGlob('sub/**/*.json', dir), ['sub/d.json', 'sub/deeper/e.json']);
    assert.deepEqual(expandGlob('[ab].json', dir), ['a.json', 'b.json']);
    assert.deepEqual(expandGlob('?.txt', dir), ['c.txt']);
    assert.deepEqual(expandGlob(`${dir}/*.txt`, dir), [join(dir, 'c.txt')]);
    assert.deepEqual(expandGlob('not-a-pattern.json', dir), ['not-a-pattern.json']);
    assert.deepEqual(expandInputs(['b.json', '*.json'], dir), ['b.json', 'a.json']);
    assert.throws(() => expandInputs(['*.yaml'], dir), /no file matches \*\.yaml/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
