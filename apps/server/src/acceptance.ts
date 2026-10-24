/**
 * Acceptance of a Lean certificate run. A zero exit status is necessary but
 * not sufficient: every expected theorem must be reported by the audit
 * command with exactly the expected type, depend only on the standard
 * axioms, and the candidate constants Lean evaluated must equal the values
 * that were submitted. Anything else leaves the claim not established.
 */
import { ALLOWED_AXIOMS, canonicalJson } from '@cryptificate/schema';
import type { ClaimId, NotEstablishedReason, Witness } from '@cryptificate/schema';

export const AUDIT_MARKER = 'CRYPTIFICATE_AUDIT';
export const INPUT_MARKER = 'CRYPTIFICATE_INPUT';
export const INPUTS_MARKER = 'CRYPTIFICATE_INPUTS';

export interface AuditRecord {
  theorem: string;
  type: string;
  axioms: string[];
}

export interface ParsedLeanOutput {
  /** Audit records by theorem; null when the theorem was reported inconsistently. */
  audits: Map<string, AuditRecord | null>;
  /** Echoed candidate constants by key; null when echoed inconsistently. */
  inputs: Map<string, unknown>;
  conflictingInputs: Set<string>;
  malformed: string[];
}

export interface ExpectedTheorem {
  claim: ClaimId;
  theorem: string;
  status: 'proved' | 'refuted';
  expectedType: string;
  witness?: Witness | null;
}

export interface LeanOutcome {
  exitCode: number | null;
  timedOut: boolean;
  cancelled: boolean;
  /** Lean could not be started (not installed, no toolchain). */
  unavailable?: boolean;
  stdout: string;
  stderr: string;
  ms: number;
}

export interface ClaimVerdict {
  claim: ClaimId;
  theorem: string;
  /** proved/refuted only when accepted; otherwise not_established. */
  status: 'proved' | 'refuted' | 'not_established';
  accepted: boolean;
  reason?: NotEstablishedReason;
  detail: string;
  audit?: AuditRecord;
}

export interface AcceptanceResult {
  verdicts: ClaimVerdict[];
  inputsMatch: boolean;
  inputProblems: string[];
  parsed: ParsedLeanOutput;
}

const FORBIDDEN_HINT: Record<string, string> = {
  sorryAx: 'the proof uses sorry',
  'Lean.ofReduceBool': 'the proof uses native_decide (Lean.ofReduceBool)',
  'Lean.ofReduceNat': 'the proof trusts compiled code (Lean.ofReduceNat)',
  'Lean.trustCompiler': 'the proof trusts compiled code (Lean.trustCompiler)',
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract audit and input lines. Lean prints informational messages either
 * bare or prefixed with "<file>:<line>:<col>: info: "; only those two shapes
 * are recognised, so text inside other messages cannot pose as an audit line.
 */
export function parseLeanOutput(stdout: string, sourcePaths: readonly string[] = []): ParsedLeanOutput {
  const prefixes = sourcePaths.filter((p) => p.length > 0).map((p) => new RegExp(`^${escapeRegExp(p)}:\\d+:\\d+: (?:info: )?`));
  const audits = new Map<string, AuditRecord | null>();
  const inputs = new Map<string, unknown>();
  const conflictingInputs = new Set<string>();
  const malformed: string[] = [];

  const setInput = (key: string, value: unknown): void => {
    if (inputs.has(key) && canonicalJson(inputs.get(key)) !== canonicalJson(value)) conflictingInputs.add(key);
    else inputs.set(key, value);
  };

  for (const rawLine of stdout.split('\n')) {
    let line = rawLine.replace(/\r$/, '');
    if (!line.startsWith('CRYPTIFICATE_')) {
      const prefix = prefixes.find((re) => re.test(line));
      if (!prefix) continue;
      line = line.replace(prefix, '');
      if (!line.startsWith('CRYPTIFICATE_')) continue;
    }
    if (line.startsWith(`${AUDIT_MARKER} `)) {
      const rec = parseAudit(line.slice(AUDIT_MARKER.length + 1));
      if (!rec) {
        malformed.push(line.slice(0, 200));
        continue;
      }
      const prev = audits.get(rec.theorem);
      if (prev === undefined) audits.set(rec.theorem, rec);
      else if (prev === null || canonicalJson(prev) !== canonicalJson(rec)) audits.set(rec.theorem, null);
    } else if (line.startsWith(`${INPUTS_MARKER} `)) {
      try {
        const obj = JSON.parse(line.slice(INPUTS_MARKER.length + 1)) as unknown;
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('not an object');
        for (const [k, v] of Object.entries(obj as Record<string, unknown>)) setInput(k, v);
      } catch {
        malformed.push(line.slice(0, 200));
      }
    } else if (line.startsWith(`${INPUT_MARKER} `)) {
      const rest = line.slice(INPUT_MARKER.length + 1);
      const sp = rest.indexOf(' ');
      const key = sp < 0 ? '' : rest.slice(0, sp);
      if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(key)) {
        malformed.push(line.slice(0, 200));
        continue;
      }
      try {
        setInput(key, JSON.parse(rest.slice(sp + 1)) as unknown);
      } catch {
        malformed.push(line.slice(0, 200));
      }
    }
  }
  return { audits, inputs, conflictingInputs, malformed };
}

function parseAudit(json: string): AuditRecord | null {
  try {
    const v = JSON.parse(json) as Record<string, unknown>;
    if (!v || typeof v !== 'object') return null;
    const { theorem, type, axioms } = v;
    if (typeof theorem !== 'string' || typeof type !== 'string' || !Array.isArray(axioms)) return null;
    if (!axioms.every((a): a is string => typeof a === 'string')) return null;
    return { theorem, type, axioms: [...axioms] };
  } catch {
    return null;
  }
}

/** Whitespace-insensitive comparison of pretty-printed types. */
export function sameType(printed: string, expected: string): boolean {
  const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();
  return norm(printed) === norm(expected);
}

/** Canonical form for comparing echoed values: GF(2^8) hex upper-cased, integers as numbers. */
export function canonicalEcho(value: unknown): unknown {
  if (typeof value === 'string') {
    const m = /^(?:0x)?([0-9A-Fa-f]{2})$/.exec(value);
    if (m && m[1]) return `#${m[1].toUpperCase()}`;
    if (/^(0|[1-9][0-9]*)$/.test(value)) return `n${value}`;
    return value;
  }
  if (typeof value === 'number' && Number.isInteger(value)) return `n${value}`;
  if (Array.isArray(value)) return value.map(canonicalEcho);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = canonicalEcho(v);
    return out;
  }
  return value;
}

export function sameEcho(a: unknown, b: unknown): boolean {
  return canonicalJson(canonicalEcho(a)) === canonicalJson(canonicalEcho(b));
}

function allNotEstablished(
  expect: readonly ExpectedTheorem[],
  reason: NotEstablishedReason,
  detail: string,
): ClaimVerdict[] {
  return expect.map((e) => ({ claim: e.claim, theorem: e.theorem, status: 'not_established', accepted: false, reason, detail }));
}

/**
 * Decide, per expected theorem, whether the Lean run establishes it.
 * `expectedInputs` maps echo keys to the normalized submitted values.
 */
export function acceptCertificate(
  expect: readonly ExpectedTheorem[],
  expectedInputs: Readonly<Record<string, unknown>>,
  outcome: LeanOutcome,
  sourcePaths: readonly string[] = [],
): AcceptanceResult {
  const parsed = parseLeanOutput(outcome.stdout, sourcePaths);
  const result = (verdicts: ClaimVerdict[], inputsMatch: boolean, inputProblems: string[]): AcceptanceResult => ({
    verdicts,
    inputsMatch,
    inputProblems,
    parsed,
  });

  if (outcome.cancelled) {
    return result(allNotEstablished(expect, 'cancelled', 'The Lean check was stopped before it finished.'), false, []);
  }
  if (outcome.timedOut) {
    return result(
      allNotEstablished(expect, 'lean-timeout', `The Lean check exceeded its time limit after ${Math.round(outcome.ms / 1000)} s; nothing was refuted.`),
      false,
      [],
    );
  }
  if (outcome.unavailable) {
    return result(allNotEstablished(expect, 'lean-unavailable', 'Lean is not installed or the trusted library is not built.'), false, []);
  }
  if (outcome.exitCode !== 0) {
    return result(
      allNotEstablished(expect, 'lean-failed', `Lean exited with status ${outcome.exitCode ?? 'killed'}; the certificate did not check.`),
      false,
      [],
    );
  }

  const inputProblems: string[] = [];
  for (const [key, want] of Object.entries(expectedInputs)) {
    if (parsed.conflictingInputs.has(key)) inputProblems.push(`${key} was echoed with conflicting values`);
    else if (!parsed.inputs.has(key)) inputProblems.push(`${key} was not echoed by Lean`);
    else if (!sameEcho(parsed.inputs.get(key), want)) inputProblems.push(`${key} evaluated by Lean differs from the submitted value`);
  }
  if (inputProblems.length > 0) {
    return result(
      allNotEstablished(expect, 'audit-input-mismatch', `The certificate does not describe the submitted inputs: ${inputProblems.join('; ')}.`),
      false,
      inputProblems,
    );
  }

  const allowed = new Set(ALLOWED_AXIOMS);
  const verdicts = expect.map((e): ClaimVerdict => {
    const base = { claim: e.claim, theorem: e.theorem };
    const rec = parsed.audits.get(e.theorem);
    if (rec === undefined) {
      return { ...base, status: 'not_established', accepted: false, reason: 'audit-missing-theorem', detail: `Lean did not report theorem ${e.theorem}.` };
    }
    if (rec === null) {
      return { ...base, status: 'not_established', accepted: false, reason: 'audit-missing-theorem', detail: `Theorem ${e.theorem} was reported inconsistently.` };
    }
    if (!sameType(rec.type, e.expectedType)) {
      return {
        ...base,
        status: 'not_established',
        accepted: false,
        reason: 'audit-type-mismatch',
        detail: `Theorem ${e.theorem} does not state the expected property.`,
        audit: rec,
      };
    }
    const bad = rec.axioms.filter((a) => !allowed.has(a));
    if (bad.length > 0) {
      const hints = bad.map((a) => FORBIDDEN_HINT[a] ?? `it depends on the axiom ${a}`);
      return {
        ...base,
        status: 'not_established',
        accepted: false,
        reason: 'audit-forbidden-axiom',
        detail: `Theorem ${e.theorem} is not accepted: ${hints.join('; ')}.`,
        audit: rec,
      };
    }
    return { ...base, status: e.status, accepted: true, detail: `Lean checked ${e.theorem}.`, audit: rec };
  });
  return result(verdicts, true, []);
}
