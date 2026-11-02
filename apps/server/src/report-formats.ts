/**
 * Machine-readable and summary renderings of `check` and `verify` results:
 * text, JSON, SARIF 2.1.0, JUnit XML and Markdown. Pure functions: file
 * contents (for SARIF regions) are read through an injected reader.
 *
 * The renderings never upgrade a status. A claim that is not established is
 * never shown as a failure of the design, only as a failure of the chosen
 * policy when the policy asks for it to be established.
 */
import { createHash } from 'node:crypto';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { IMPLEMENTATION_CLAIMS, designClaimsFor } from '@cryptificate/schema';
import type { AnalysisReport, Claim, ExecutionState } from '@cryptificate/schema';
import { formatAnalysis, table, witnessText } from './format.js';
import type { Style } from './format.js';
import { locateJson, positionOf } from './json-locate.js';
import type { Position } from './json-locate.js';
import { UNAVAILABLE_REASONS, absentClaims, exitCodeOf, inScope, unavailable, violates, combine } from './policy.js';
import type { FailOn, Outcome } from './policy.js';
import type { VerifyResult, VerifyRow } from './verify.js';

export const INFORMATION_URI = 'https://github.com/4waan/Cryptificate';
export const HELP_URI = 'https://github.com/4waan/Cryptificate/blob/main/docs/evidence-model.md';
export const SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';

// ---------------------------------------------------------------------------
// Result model

/** Where a checked request came from, for placing annotations. */
export interface CheckInput {
  /** The input file as given on the command line (relative to the working directory, or absolute). */
  file: string;
  /** Separate circuit file given with --program. */
  programFile?: string;
  /** JSON pointer of the design inside `file`: "" for a bare design, "/design" for a request. */
  designPointer: string;
  /** JSON pointer of the circuit inside `programFile` (or `file`), or null when there is none. */
  programPointer: string | null;
}

export interface CheckEntry {
  input: CheckInput;
  /** Execution state of the run, or "error" when the input could not be run at all. */
  state: ExecutionState | 'error';
  error?: string;
  report: AnalysisReport | null;
  outcome: Outcome;
  /** Ids of in-scope claims whose status the policy rejects. */
  violations: string[];
  /** Ids of in-scope claims that a missing tool left unchecked (counted only under a policy). */
  unavailable: string[];
  /** --claims ids the report does not carry (counted only under a policy). */
  absent?: string[];
}

export interface CheckRun {
  format: 'cryptificate-check/v1';
  command: 'check';
  failOn: FailOn;
  /** Claim ids the policy is restricted to, or null for the default scope. */
  claims: string[] | null;
  /**
   * Absolute directory that relative input paths (`input.file`, `input.programFile`)
   * are relative to: the working directory, or the directory of cryptificate.json
   * when the inputs came from it. `report` resolves the paths against it.
   */
  base?: string;
  outcome: Outcome;
  exitCode: number;
  results: CheckEntry[];
}

export interface VerifyEntry {
  bundle: string;
  error?: string;
  result: VerifyResult | null;
  outcome: Outcome;
  /** "subject claim" of the rows whose status the policy rejects. */
  violations: string[];
  /**
   * Why the bundle could not be gated: the re-run did not complete, a missing
   * tool left a claim unchecked, or an in-scope claim cannot be re-checked.
   * Any problem makes the outcome an error (exit 2).
   */
  problems: string[];
}

export interface VerifyRun {
  format: 'cryptificate-verify/v1';
  command: 'verify';
  failOn: FailOn;
  claims: string[] | null;
  outcome: Outcome;
  exitCode: number;
  results: VerifyEntry[];
}

export type GateRun = CheckRun | VerifyRun;

// ---------------------------------------------------------------------------
// Policy evaluation

/** Evaluate one check input against the policy. */
export function evaluateCheckEntry(
  e: Pick<CheckEntry, 'input' | 'state' | 'report'> & { error?: string },
  failOn: FailOn,
  only: ReadonlySet<string> | null,
): CheckEntry {
  const base = { input: e.input, state: e.state, report: e.report, ...(e.error !== undefined ? { error: e.error } : {}) };
  if (e.state === 'error' || !e.report) return { ...base, outcome: 'error', violations: [], unavailable: [] };
  const scoped = e.report.claims.filter((c) => inScope(c, only));
  const violations = scoped.filter((c) => violates(c.status, failOn)).map((c) => c.id);
  const missing = failOn === 'none' ? [] : scoped.filter(unavailable).map((c) => c.id);
  const absent = failOn === 'none' ? [] : absentClaims(only, e.report.claims.map((c) => c.id));
  let outcome: Outcome = 'pass';
  if (e.state !== 'completed' || missing.length > 0 || absent.length > 0) outcome = 'error';
  else if (violations.length > 0) outcome = 'policy-failure';
  return { ...base, outcome, violations, unavailable: missing, ...(absent.length > 0 ? { absent } : {}) };
}

export function makeCheckRun(entries: CheckEntry[], failOn: FailOn, only: ReadonlySet<string> | null, base?: string): CheckRun {
  const outcome = combine(entries.map((e) => e.outcome));
  return {
    format: 'cryptificate-check/v1',
    command: 'check',
    failOn,
    claims: only ? [...only] : null,
    ...(base !== undefined ? { base } : {}),
    outcome,
    exitCode: exitCodeOf(outcome),
    results: entries,
  };
}

/** Whether verify re-derived this row with the installed tools. */
function rechecked(r: VerifyRow): boolean {
  return r.result === 'match' || r.result === 'mismatch';
}

/** Whether a missing tool, not the re-check itself, decided the recomputed status. */
function rowUnavailable(r: VerifyRow): boolean {
  return rechecked(r) && r.recomputed === 'not_established' && (UNAVAILABLE_REASONS as readonly string[]).includes(r.recomputedReason ?? '');
}

/**
 * Policy scope of a verify row: with --claims, exactly those ids; otherwise
 * the claims that were re-checked, except those the recorded run did not
 * attempt (reason `not-run`, such as circuit claims without a circuit).
 */
function rowInScope(r: VerifyRow, only: ReadonlySet<string> | null): boolean {
  if (only) return only.has(r.claim);
  return rechecked(r) && r.reason !== 'not-run';
}

function absentText(ids: readonly string[]): string {
  return `requested claim${ids.length > 1 ? 's' : ''} ${ids.join(', ')}`;
}

/**
 * Evaluate one verified bundle. The policy only ever reads recomputed
 * statuses: a status the bundle records about itself is never gated on.
 *   error           the bundle could not be read; the re-run did not complete;
 *                   nothing could be re-checked; a missing tool decided a
 *                   mismatch, or (under a policy) an in-scope status; or
 *                   (under a policy) an in-scope claim verify cannot re-check
 *                   or a --claims id the bundle does not carry;
 *   policy-failure  a re-checked claim differs from the bundle, the digest
 *                   differs, or an in-scope recomputed status violates the policy;
 *   pass            otherwise.
 */
export function evaluateVerifyEntry(e: { bundle: string; result: VerifyResult | null; error?: string }, failOn: FailOn, only: ReadonlySet<string> | null): VerifyEntry {
  const base = { bundle: e.bundle, result: e.result, ...(e.error !== undefined ? { error: e.error } : {}) };
  if (!e.result) return { ...base, outcome: 'error', violations: [], problems: [] };
  const r = e.result;
  const problems: string[] = [];
  const absent = failOn === 'none' ? [] : absentClaims(only, r.rows.map((row) => row.claim));
  if (absent.length > 0) problems.push(`${absentText(absent)} not in the bundle`);
  if (r.state !== 'completed') problems.push(`the re-run ended with state ${r.state ?? 'unknown'}`);
  if (!r.rows.some(rechecked)) problems.push('no claim could be re-checked');
  for (const row of r.rows) {
    const scoped = failOn !== 'none' && rowInScope(row, only);
    if (rowUnavailable(row) && (row.result === 'mismatch' || scoped)) {
      problems.push(`${row.subject} ${row.claim} could not be re-checked (${row.recomputedReason})`);
    } else if (scoped && !rechecked(row)) {
      problems.push(`${row.subject} ${row.claim} cannot be re-checked by verify (${row.result})`);
    }
  }
  const violations = r.rows.filter((row) => rowInScope(row, only) && rechecked(row) && violates(row.recomputed, failOn)).map((row) => `${row.subject} ${row.claim}`);
  let outcome: Outcome = 'pass';
  if (problems.length > 0) outcome = 'error';
  else if (!r.ok || violations.length > 0) outcome = 'policy-failure';
  return { ...base, outcome, violations, problems };
}

export function makeVerifyRun(entries: VerifyEntry[], failOn: FailOn, only: ReadonlySet<string> | null): VerifyRun {
  const outcome = combine(entries.map((e) => e.outcome));
  return { format: 'cryptificate-verify/v1', command: 'verify', failOn, claims: only ? [...only] : null, outcome, exitCode: exitCodeOf(outcome), results: entries };
}

// ---------------------------------------------------------------------------
// Shared helpers

const STATUS_WORDS: Record<string, string> = {
  proved: 'proved',
  refuted: 'refuted',
  not_established: 'not established',
  unsupported: 'unsupported',
};

function statusWord(s: string): string {
  return STATUS_WORDS[s] ?? s;
}

function policyText(run: GateRun): string {
  const scope = run.claims ? ` on ${run.claims.join(', ')}` : '';
  return run.failOn === 'none' ? 'no policy (--fail-on none)' : `--fail-on ${run.failOn}${scope}`;
}

function outcomeText(run: GateRun): string {
  switch (run.outcome) {
    case 'pass':
      return run.failOn === 'none' ? 'completed' : 'passed';
    case 'policy-failure':
      return 'policy failed';
    case 'error':
      return 'error';
  }
}

/** Generic title of a claim id (activity titles vary with the design). */
const RULE_TITLES: ReadonlyMap<string, { title: string; chain: string }> = (() => {
  const m = new Map<string, { title: string; chain: string }>();
  for (const info of [...designClaimsFor('aes-like/gf256/v1'), ...designClaimsFor('hades/bn254/v1'), ...IMPLEMENTATION_CLAIMS]) {
    if (!m.has(info.id)) m.set(info.id, { title: info.title, chain: info.chain });
  }
  return m;
})();

/**
 * Path for annotations: `file` (relative to `cwd`, or absolute) with forward
 * slashes, relative to `base` when inside it, otherwise a file:// URI.
 */
export function artifactUri(file: string, cwd: string, base: string = cwd): string {
  const abs = isAbsolute(file) ? file : resolve(cwd, file);
  const rel = relative(base, abs);
  if (rel && !rel.startsWith('..') && !isAbsolute(rel)) return rel.split(sep).join('/');
  return pathToFileURL(abs).href;
}

function claimMessage(c: Claim): string {
  const w = c.status === 'refuted' ? witnessText(c) : '';
  return `${c.title}: ${statusWord(c.status)} (${c.evidence.label}).${w ? ` Counterexample: ${w}.` : ''} ${c.note}`.trim();
}

/** File and JSON pointer an annotation for this claim should point at. */
export function claimLocation(c: Claim, input: CheckInput): { file: string; pointer: string } {
  const d = (p: string): { file: string; pointer: string } => ({ file: input.file, pointer: `${input.designPointer}${p}` });
  const p = (sub: string): { file: string; pointer: string } => {
    if (input.programPointer === null) return { file: input.file, pointer: '' };
    return { file: input.programFile ?? input.file, pointer: `${input.programPointer}${sub}` };
  };
  const w = c.witness;
  switch (c.id) {
    case 'matrix.mds':
      return d('/matrix');
    case 'external.mds':
      return d('/external');
    case 'internal.invertible':
      return d('/internal');
    case 'offsets.dispersion':
      return w?.kind === 'offset-collision' && w.rows.length > 0 ? d(`/offsets/${w.rows[w.rows.length - 1]}`) : d('/offsets');
    case 'sbox.bijective':
      if (w?.kind === 'sbox-collision') return d(`/sbox/table/${parseInt(w.x2, 16)}`);
      if (w?.kind === 'power-collision') return d('/sbox/exponent');
      return d('/sbox');
    case 'activity.bound':
      return d('/rounds');
    case 'activity.outer':
      return d('/fullRounds');
    case 'circuit.equivalence':
      return w?.kind === 'distinguishing-input' && w.differing.length > 0 ? p(`/outputs/${w.differing[0]}`) : p('');
    default:
      return p('');
  }
}

export type FileReader = (path: string) => string | null;

function positionsCache(read: FileReader, cwd: string): (file: string) => Map<string, Position> | null {
  const cache = new Map<string, Map<string, Position> | null>();
  return (file) => {
    if (!cache.has(file)) {
      const text = read(isAbsolute(file) ? file : resolve(cwd, file));
      cache.set(file, text === null ? null : locateJson(text));
    }
    return cache.get(file) ?? null;
  };
}

// ---------------------------------------------------------------------------
// Text

export function checkToText(run: CheckRun, style: Style): string {
  const multi = run.results.length > 1;
  const parts: string[] = [];
  for (const e of run.results) {
    const head = multi ? `${style.bold(`== ${e.input.file}`)}\n` : '';
    if (!e.report) parts.push(`${head}${e.input.file}: ${style.status('invalid', 'error')}: ${e.error ?? 'not checked'}`);
    else parts.push(`${head}${formatAnalysis(e.report, style)}`);
  }
  let out = parts.join('\n\n');
  if (run.failOn !== 'none' || multi) out += `\n\n${gateSummaryText(run, style)}`;
  return out;
}

/** Why a completed check input is an error under the policy. */
function checkProblems(e: CheckEntry): string[] {
  const out: string[] = [];
  if (e.absent && e.absent.length > 0) out.push(`${absentText(e.absent)} not in this report`);
  if (e.unavailable.length > 0) out.push(`${e.unavailable.join(', ')} could not be checked (a tool was unavailable)`);
  return out;
}

function gateSummaryText(run: GateRun, style: Style): string {
  const lines = [`${style.bold('Policy')} ${policyText(run)}: ${style.status(run.outcome === 'pass' ? 'proved' : run.outcome === 'error' ? 'invalid' : 'refuted', outcomeText(run))} (exit ${run.exitCode})`];
  if (run.command === 'check') {
    for (const e of run.results) {
      if (e.outcome === 'error') {
        const why = e.error ?? (e.state !== 'completed' ? `run ${e.state}` : checkProblems(e).join('; '));
        lines.push(`  ${e.input.file}: error: ${why}`);
      } else if (e.violations.length > 0) {
        const byId = new Map(e.report?.claims.map((c) => [c.id, c.status]) ?? []);
        lines.push(`  ${e.input.file}: ${e.violations.map((id) => `${id} ${statusWord(byId.get(id as Claim['id']) ?? '')}`).join(', ')}`);
      }
    }
  } else {
    for (const e of run.results) {
      if (e.outcome === 'error') lines.push(`  ${e.bundle}: error: ${e.error ?? (e.problems.join('; ') || 'not verified')}`);
      else if (e.result && !e.result.ok) lines.push(`  ${e.bundle}: some claims do not match or could not be re-checked`);
      if (e.violations.length > 0) lines.push(`  ${e.bundle}: rejected by the policy: ${e.violations.join(', ')}`);
    }
  }
  return lines.join('\n');
}

const MATCH_LINE = 'All re-checked claims match.';

/** Closing sentence of a verify result; never "match" for a re-run that did not complete. */
function verdictLine(result: VerifyResult): string {
  if (result.state !== 'completed') return `The re-run did not complete (${result.state}); the claims were not re-checked in full.`;
  return result.ok ? MATCH_LINE : 'Some claims do not match or could not be re-checked.';
}

export function verifyResultText(result: VerifyResult, style: Style): string {
  const lines = [`${style.bold('Bundle')} ${result.kind} ${result.id}`, `inputs  recorded ${result.inputDigest.recorded}`];
  if (result.inputDigest.recomputed) lines.push(`        recomputed ${result.inputDigest.recomputed}`);
  lines.push(
    '',
    table(
      ['subject', 'claim', 'recorded', 'recomputed', 'result'],
      result.rows.map((r) => [r.subject, r.claim, r.recorded, r.recomputed, style.status(r.result, r.result)]),
    ),
    '',
    ...result.notes,
    '',
    verdictLine(result) === MATCH_LINE ? style.status('match', MATCH_LINE) : style.status('mismatch', verdictLine(result)),
  );
  return lines.join('\n');
}

export function verifyToText(run: VerifyRun, style: Style): string {
  const multi = run.results.length > 1;
  const parts = run.results.map((e) => {
    const head = multi ? `${style.bold(`== ${e.bundle}`)}\n` : '';
    return e.result ? `${head}${verifyResultText(e.result, style)}` : `${head}${e.bundle}: ${style.status('invalid', 'error')}: ${e.error ?? 'not verified'}`;
  });
  let out = parts.join('\n\n');
  if (run.failOn !== 'none' || multi) out += `\n\n${gateSummaryText(run, style)}`;
  return out;
}

// ---------------------------------------------------------------------------
// JSON

export function toJson(run: GateRun): string {
  return `${JSON.stringify(run, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// Markdown

function mdCell(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function mdCode(s: string): string {
  return `\`${s.replace(/`/g, "'")}\``;
}

export function checkToMarkdown(run: CheckRun): string {
  const out: string[] = ['## Cryptificate check', ''];
  out.push(`**Result: ${outcomeText(run)}** (policy ${mdCode(policyText(run).replace(/^no policy \((.*)\)$/, '$1'))}, exit ${run.exitCode})`, '');
  for (const e of run.results) {
    out.push(`### ${mdCode(e.input.file)}`, '');
    if (!e.report) {
      out.push(`Error: ${mdCell(e.error ?? 'not checked')}`, '');
      continue;
    }
    const r = e.report;
    const origin = r.provenance.origin === 'cached' ? `cached exact result${r.provenance.cachedFrom ? ` of run ${mdCode(r.provenance.cachedFrom)}` : ''}` : r.provenance.origin;
    out.push(`Run ${r.execution.state}, ${origin}. Inputs ${mdCode(r.inputDigest)}. Checker ${mdCode(r.provenance.checker)}, Lean ${mdCode(r.provenance.toolchain.lean)}.`, '');
    if (e.outcome === 'error' && e.state === 'completed' && e.absent && e.absent.length > 0) {
      out.push(`Error: requested ${e.absent.map(mdCode).join(', ')} not in this report.`, '');
    }
    if (e.outcome === 'error' && e.state === 'completed' && e.unavailable.length > 0) {
      out.push(`Error: ${e.unavailable.map(mdCode).join(', ')} could not be checked because a tool was unavailable.`, '');
    }
    out.push('| Claim | Status | Evidence | Note |', '| --- | --- | --- | --- |');
    for (const c of r.claims) {
      const violated = e.violations.includes(c.id);
      const status = c.status === 'refuted' ? `**${statusWord(c.status)}**` : statusWord(c.status);
      const scope = inScope(c, run.claims ? new Set(run.claims) : null) ? '' : ' (outside policy)';
      out.push(`| ${mdCode(c.id)} ${mdCell(c.title)} | ${status}${violated ? ' (fails policy)' : scope} | ${mdCell(c.evidence.label)} | ${mdCell(c.note)} |`);
    }
    const refuted = r.claims.filter((c) => c.status === 'refuted' && witnessText(c));
    if (refuted.length > 0) {
      out.push('', ...refuted.map((c) => `- Counterexample for ${mdCode(c.id)}: ${mdCode(witnessText(c))}`));
    }
    out.push('');
  }
  out.push('A claim that is not established is not a refutation. Statuses and evidence labels are defined in the [evidence model](' + HELP_URI + ').', '');
  return out.join('\n');
}

export function verifyToMarkdown(run: VerifyRun): string {
  const out: string[] = ['## Cryptificate verify', ''];
  out.push(`**Result: ${outcomeText(run)}** (policy ${mdCode(policyText(run).replace(/^no policy \((.*)\)$/, '$1'))}, exit ${run.exitCode})`, '');
  for (const e of run.results) {
    out.push(`### ${mdCode(e.bundle)}`, '');
    if (!e.result) {
      out.push(`Error: ${mdCell(e.error ?? 'not verified')}`, '');
      continue;
    }
    const r = e.result;
    out.push(`${r.kind} ${mdCode(r.id)}; inputs recorded ${mdCode(r.inputDigest.recorded)}${r.inputDigest.recomputed ? `, recomputed ${mdCode(r.inputDigest.recomputed)}` : ''}.`, '');
    if (e.problems.length > 0) out.push(`Error: ${mdCell(e.problems.join('; '))}.`, '');
    out.push('| Subject | Claim | Recorded | Recomputed | Result |', '| --- | --- | --- | --- | --- |');
    for (const row of r.rows) {
      const violated = e.violations.includes(`${row.subject} ${row.claim}`);
      const result = row.result === 'mismatch' ? '**mismatch**' : row.result;
      out.push(`| ${mdCell(row.subject)} | ${mdCode(row.claim)} | ${mdCell(row.recorded)} | ${mdCell(row.recomputed)} | ${result}${violated ? ' (fails policy)' : ''} |`);
    }
    out.push('', ...r.notes.map((n) => `- ${mdCell(n)}`), '', verdictLine(r), '');
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// JUnit XML

function xml(s: string): string {
  return s
    // characters XML 1.0 cannot carry
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

interface JCase {
  classname: string;
  name: string;
  file?: string;
  failure?: { type: string; message: string; body: string };
  error?: { type: string; message: string; body: string };
  skipped?: string;
  out?: string;
}

function junitDocument(name: string, suites: { name: string; props: [string, string][]; cases: JCase[] }[]): string {
  const count = (cs: JCase[]) => ({
    tests: cs.length,
    failures: cs.filter((c) => c.failure).length,
    errors: cs.filter((c) => c.error).length,
    skipped: cs.filter((c) => c.skipped !== undefined).length,
  });
  const all = count(suites.flatMap((s) => s.cases));
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', `<testsuites name="${xml(name)}" tests="${all.tests}" failures="${all.failures}" errors="${all.errors}" skipped="${all.skipped}">`];
  for (const s of suites) {
    const n = count(s.cases);
    lines.push(`  <testsuite name="${xml(s.name)}" tests="${n.tests}" failures="${n.failures}" errors="${n.errors}" skipped="${n.skipped}">`);
    if (s.props.length > 0) {
      lines.push('    <properties>');
      for (const [k, v] of s.props) lines.push(`      <property name="${xml(k)}" value="${xml(v)}"/>`);
      lines.push('    </properties>');
    }
    for (const c of s.cases) {
      const attrs = `classname="${xml(c.classname)}" name="${xml(c.name)}"${c.file ? ` file="${xml(c.file)}"` : ''}`;
      const inner: string[] = [];
      if (c.failure) inner.push(`      <failure type="${xml(c.failure.type)}" message="${xml(c.failure.message)}">${xml(c.failure.body)}</failure>`);
      if (c.error) inner.push(`      <error type="${xml(c.error.type)}" message="${xml(c.error.message)}">${xml(c.error.body)}</error>`);
      if (c.skipped !== undefined) inner.push(`      <skipped message="${xml(c.skipped)}"/>`);
      if (c.out) inner.push(`      <system-out>${xml(c.out)}</system-out>`);
      if (inner.length === 0) lines.push(`    <testcase ${attrs}/>`);
      else lines.push(`    <testcase ${attrs}>`, ...inner, '    </testcase>');
    }
    lines.push('  </testsuite>');
  }
  lines.push('</testsuites>', '');
  return lines.join('\n');
}

export function checkToJUnit(run: CheckRun): string {
  const only = run.claims ? new Set(run.claims) : null;
  const suites = run.results.map((e) => {
    const props: [string, string][] = [['failOn', run.failOn]];
    if (!e.report) {
      return { name: e.input.file, props, cases: [{ classname: 'cryptificate.input', name: 'input', file: e.input.file, error: { type: 'input-error', message: e.error ?? 'not checked', body: e.error ?? '' } }] };
    }
    props.push(['inputDigest', e.report.inputDigest], ['reportId', e.report.id], ['execution', e.report.execution.state], ['checker', e.report.provenance.checker]);
    const cases: JCase[] = e.report.claims.map((c) => {
      const base: JCase = { classname: `cryptificate.${c.chain}`, name: `${c.id}: ${c.title}`, file: e.input.file, out: `${c.evidence.label}. ${c.note}` };
      const message = `${statusWord(c.status)} (${c.evidence.label})`;
      if (e.unavailable.includes(c.id)) return { ...base, error: { type: c.reason ?? 'unavailable', message, body: c.note } };
      if (e.violations.includes(c.id)) {
        const w = c.status === 'refuted' ? witnessText(c) : '';
        const body = [c.note, w ? `Counterexample: ${w}` : '', c.status === 'refuted' && c.witness ? JSON.stringify(c.witness) : ''].filter(Boolean).join('\n');
        return { ...base, failure: { type: c.status, message, body } };
      }
      if (c.status === 'proved') return base;
      const scope = inScope(c, only) ? '' : ' (outside policy)';
      return { ...base, skipped: `${message}${scope}: ${c.note}` };
    });
    if (e.state !== 'completed') cases.push({ classname: 'cryptificate.run', name: 'run', file: e.input.file, error: { type: e.state, message: `run ${e.state}`, body: e.error ?? '' } });
    if (e.absent && e.absent.length > 0) {
      const message = `${absentText(e.absent)} not in this report`;
      cases.push({ classname: 'cryptificate.policy', name: 'claims', file: e.input.file, error: { type: 'absent-claim', message, body: message } });
    }
    return { name: e.input.file, props, cases };
  });
  return junitDocument('cryptificate check', suites);
}

export function verifyToJUnit(run: VerifyRun): string {
  const suites = run.results.map((e) => {
    const props: [string, string][] = [['failOn', run.failOn]];
    if (!e.result) {
      return { name: e.bundle, props, cases: [{ classname: 'cryptificate.bundle', name: 'bundle', file: e.bundle, error: { type: 'input-error', message: e.error ?? 'not verified', body: e.error ?? '' } }] };
    }
    props.push(['reportId', e.result.id], ['inputDigest', e.result.inputDigest.recorded]);
    const cases: JCase[] = e.result.rows.map((r) => {
      const base: JCase = { classname: `cryptificate.verify.${r.subject}`, name: r.claim, file: e.bundle };
      const message = `recorded ${r.recorded}, recomputed ${r.recomputed}`;
      if (r.result === 'mismatch') return { ...base, failure: { type: 'mismatch', message, body: message } };
      if (e.violations.includes(`${r.subject} ${r.claim}`)) return { ...base, failure: { type: r.recomputed, message, body: message } };
      if (r.result === 'match') return base;
      return { ...base, skipped: `${r.result}: ${message}` };
    });
    if (e.problems.length > 0) {
      cases.push({ classname: 'cryptificate.verify', name: 'bundle', file: e.bundle, error: { type: 'not-re-checked', message: e.problems.join('; '), body: e.result.notes.join('\n') } });
    }
    return { name: e.bundle, props, cases };
  });
  return junitDocument('cryptificate verify', suites);
}

// ---------------------------------------------------------------------------
// SARIF 2.1.0

export interface SarifOptions {
  /** Directory relative input paths are resolved against. */
  cwd: string;
  /** Directory artifact URIs are made relative to (default cwd): the repository root for code scanning. */
  uriBase?: string;
  read: FileReader;
}

type SarifKind = 'pass' | 'fail' | 'open' | 'notApplicable' | 'informational';
type SarifLevel = 'error' | 'warning' | 'note' | 'none';

function ruleName(id: string): string {
  return id
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join('');
}

class RuleSet {
  readonly rules: Record<string, unknown>[] = [];
  private readonly index = new Map<string, number>();
  ruleIndex(id: string): number {
    const hit = this.index.get(id);
    if (hit !== undefined) return hit;
    const info = RULE_TITLES.get(id);
    const title = info?.title ?? id;
    this.rules.push({
      id,
      name: ruleName(id),
      shortDescription: { text: title },
      helpUri: HELP_URI,
      properties: { tags: ['cryptificate', info?.chain ?? 'claim'] },
    });
    this.index.set(id, this.rules.length - 1);
    return this.rules.length - 1;
  }
}

function driverVersion(checker: string | undefined): string | undefined {
  const m = checker ? /^cryptificate (\S+)/.exec(checker) : null;
  return m ? m[1] : undefined;
}

function sarifLog(run: GateRun, rules: RuleSet, results: unknown[], notifications: unknown[], version: string | undefined): Record<string, unknown> {
  const driver: Record<string, unknown> = { name: 'Cryptificate', informationUri: INFORMATION_URI, rules: rules.rules };
  if (version) driver['version'] = version;
  const invocation: Record<string, unknown> = { executionSuccessful: run.outcome !== 'error', exitCode: run.exitCode };
  if (notifications.length > 0) invocation['toolExecutionNotifications'] = notifications;
  return {
    $schema: SARIF_SCHEMA,
    version: '2.1.0',
    runs: [
      {
        tool: { driver },
        invocations: [invocation],
        results,
        properties: { command: run.command, failOn: run.failOn, claims: run.claims, outcome: run.outcome },
      },
    ],
  };
}

function fingerprint(...parts: string[]): string {
  return createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 32);
}

export function checkToSarif(run: CheckRun, opts: SarifOptions): Record<string, unknown> {
  const rules = new RuleSet();
  const positions = positionsCache(opts.read, opts.cwd);
  const results: unknown[] = [];
  const notifications: unknown[] = [];
  const only = run.claims ? new Set(run.claims) : null;
  let version: string | undefined;
  for (const e of run.results) {
    if (!e.report) {
      notifications.push({
        level: 'error',
        message: { text: `${e.input.file}: ${e.error ?? 'not checked'}` },
        locations: [{ physicalLocation: { artifactLocation: { uri: artifactUri(e.input.file, opts.cwd, opts.uriBase) } } }],
      });
      continue;
    }
    if (e.state !== 'completed') {
      notifications.push({ level: 'error', message: { text: `${e.input.file}: run ${e.state}${e.error ? `: ${e.error}` : ''}` } });
    }
    if (e.absent && e.absent.length > 0) {
      notifications.push({ level: 'error', message: { text: `${e.input.file}: ${absentText(e.absent)} not in this report` }, locations: [{ physicalLocation: { artifactLocation: { uri: artifactUri(e.input.file, opts.cwd, opts.uriBase) } } }] });
    }
    version ??= driverVersion(e.report.provenance.checker);
    for (const c of e.report.claims) {
      const violated = e.violations.includes(c.id);
      let kind: SarifKind;
      let level: SarifLevel;
      if (c.status === 'refuted') [kind, level] = ['fail', 'error'];
      else if (violated) [kind, level] = ['fail', 'warning'];
      else if (c.status === 'proved') [kind, level] = ['pass', 'none'];
      else if (!inScope(c, only)) [kind, level] = ['notApplicable', 'none'];
      else [kind, level] = ['open', 'none'];
      const loc = claimLocation(c, e.input);
      const uri = artifactUri(loc.file, opts.cwd, opts.uriBase);
      const pos = positionOf(positions(loc.file), loc.pointer);
      const physicalLocation: Record<string, unknown> = { artifactLocation: { uri } };
      if (pos) physicalLocation['region'] = { startLine: pos.line, startColumn: pos.column };
      const properties: Record<string, unknown> = {
        claimId: c.id,
        chain: c.chain,
        status: c.status,
        evidenceLabel: c.evidence.label,
        evidenceKind: c.evidence.kind,
        policyViolation: violated,
        inputDigest: e.report.inputDigest,
        reportId: e.report.id,
        jsonPointer: loc.pointer,
      };
      if (c.evidence.theorem) properties['theorem'] = c.evidence.theorem;
      if (c.evidence.axioms) properties['axioms'] = c.evidence.axioms;
      if (c.reason) properties['reason'] = c.reason;
      if (c.status === 'refuted' && c.witness) properties['counterexample'] = c.witness;
      results.push({
        ruleId: c.id,
        ruleIndex: rules.ruleIndex(c.id),
        kind,
        level,
        message: { text: claimMessage(c) },
        locations: [{ physicalLocation }],
        partialFingerprints: { 'cryptificateClaim/v1': fingerprint(uri, c.id) },
        properties,
      });
    }
  }
  return sarifLog(run, rules, results, notifications, version);
}

export function verifyToSarif(run: VerifyRun, opts: SarifOptions): Record<string, unknown> {
  const rules = new RuleSet();
  const results: unknown[] = [];
  const notifications: unknown[] = [];
  for (const e of run.results) {
    const uri = artifactUri(e.bundle, opts.cwd, opts.uriBase);
    if (!e.result) {
      notifications.push({ level: 'error', message: { text: `${e.bundle}: ${e.error ?? 'not verified'}` }, locations: [{ physicalLocation: { artifactLocation: { uri } } }] });
      continue;
    }
    for (const r of e.result.rows) {
      const violated = e.violations.includes(`${r.subject} ${r.claim}`);
      let kind: SarifKind;
      let level: SarifLevel;
      if (r.result === 'mismatch') [kind, level] = ['fail', 'error'];
      else if (violated) [kind, level] = ['fail', r.recomputed === 'refuted' ? 'error' : 'warning'];
      else if (r.result === 'match') [kind, level] = ['pass', 'none'];
      else if (r.result === 'historical') [kind, level] = ['informational', 'none'];
      else [kind, level] = ['open', 'none'];
      const title = RULE_TITLES.get(r.claim)?.title ?? r.claim;
      results.push({
        ruleId: r.claim,
        ruleIndex: rules.ruleIndex(r.claim),
        kind,
        level,
        message: { text: `${title} (${r.subject}): recorded ${r.recorded}, recomputed ${r.recomputed}: ${r.result}.` },
        locations: [{ physicalLocation: { artifactLocation: { uri } } }],
        partialFingerprints: { 'cryptificateClaim/v1': fingerprint(uri, r.subject, r.claim) },
        properties: { claimId: r.claim, subject: r.subject, recorded: r.recorded, recomputed: r.recomputed, result: r.result, policyViolation: violated, reportId: e.result.id },
      });
    }
    for (const p of e.problems) notifications.push({ level: 'error', message: { text: `${e.bundle}: ${p}` }, locations: [{ physicalLocation: { artifactLocation: { uri } } }] });
  }
  return sarifLog(run, rules, results, notifications, undefined);
}

export function toSarifText(log: Record<string, unknown>): string {
  return `${JSON.stringify(log, null, 2)}\n`;
}
