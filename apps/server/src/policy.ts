/**
 * The CI gate: which claim outcomes make `check`, `verify` and `report` fail.
 *
 * Exit codes of those commands:
 *   0  every input was checked to completion and no in-scope claim violates the policy;
 *   1  the policy failed: an in-scope claim has a status the policy rejects, or
 *      (verify) a re-checked claim differs from the bundle;
 *   2  usage error, unreadable or invalid input, or a run that did not complete
 *      (engine failure, Lean failure or timeout, cancellation), or, when a policy
 *      is set, an in-scope claim that could not be checked because the engine,
 *      Lean or the native toolchain was unavailable, a --claims id the input
 *      does not carry, or (verify) an in-scope claim verify cannot re-check.
 *      2 takes precedence over 1.
 */
import type { Claim, ClaimStatus, NotEstablishedReason } from '@cryptificate/schema';
import { CLAIM_STATUSES, IMPLEMENTATION_CLAIMS, MODELS, everyDesignClaimFor } from '@cryptificate/schema';

export type FailOn = 'none' | 'refuted' | 'not-established' | 'any';

export const FAIL_ON: readonly FailOn[] = ['none', 'refuted', 'not-established', 'any'];

export const EXIT_PASS = 0;
export const EXIT_POLICY = 1;
export const EXIT_ERROR = 2;

export class UsageError extends Error {}

export function parseFailOn(value: string | undefined): FailOn {
  const v = (value ?? 'none').trim().replace(/_/g, '-');
  if ((FAIL_ON as readonly string[]).includes(v)) return v as FailOn;
  throw new UsageError(`--fail-on must be one of ${FAIL_ON.join(', ')} (got "${value}")`);
}

/** Every claim id a report can carry, over all design models and widths. */
export const KNOWN_CLAIM_IDS: ReadonlySet<string> = new Set([...MODELS.flatMap((m) => everyDesignClaimFor(m).map((c) => c.id)), ...IMPLEMENTATION_CLAIMS.map((c) => c.id)]);

/**
 * Claim ids given with --claims, or null for the default scope. An id that
 * no report can carry (a typo, or the wrong case) is a usage error, so a
 * misspelt scope never passes vacuously.
 */
export function parseClaimList(values: readonly string[] | undefined): Set<string> | null {
  if (!values || values.length === 0) return null;
  const ids = values.flatMap((v) => v.split(',')).map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return null;
  const unknown = ids.filter((id) => !KNOWN_CLAIM_IDS.has(id));
  if (unknown.length > 0) {
    throw new UsageError(`--claims: unknown claim id${unknown.length > 1 ? 's' : ''} ${unknown.map((id) => `"${id}"`).join(', ')}; known ids are ${[...KNOWN_CLAIM_IDS].join(', ')}`);
  }
  return new Set(ids);
}

/** Requested claim ids that an input does not carry at all. */
export function absentClaims(only: ReadonlySet<string> | null, present: Iterable<string>): string[] {
  if (!only) return [];
  const have = new Set(present);
  return [...only].filter((id) => !have.has(id));
}

/** Whether the policy rejects a claim with this status. */
export function violates(status: string, failOn: FailOn): boolean {
  if (!(CLAIM_STATUSES as readonly string[]).includes(status)) return false;
  const s = status as ClaimStatus;
  switch (failOn) {
    case 'none':
      return false;
    case 'refuted':
      return s === 'refuted';
    case 'not-established':
      return s === 'refuted' || s === 'not_established';
    case 'any':
      return s !== 'proved';
  }
}

/**
 * Claims the policy applies to. With --claims, exactly those ids (an input
 * that lacks one of them is an error under a policy, not a pass). Otherwise
 * every claim except those the run did not attempt by design (reason
 * `not-run`: no circuit submitted, or timing, which only experiments measure).
 */
export function inScope(claim: Pick<Claim, 'id' | 'reason'>, only: ReadonlySet<string> | null): boolean {
  if (only) return only.has(claim.id);
  return claim.reason !== 'not-run';
}

/** Reasons that mean a tool was missing, not that the claim was examined. */
export const UNAVAILABLE_REASONS: readonly NotEstablishedReason[] = ['lean-unavailable', 'engine-unavailable', 'native-unavailable'];

export function unavailable(claim: Pick<Claim, 'status' | 'reason'>): boolean {
  return claim.status === 'not_established' && claim.reason !== undefined && UNAVAILABLE_REASONS.includes(claim.reason);
}

export type Outcome = 'pass' | 'policy-failure' | 'error';

export function exitCodeOf(outcome: Outcome): number {
  return outcome === 'pass' ? EXIT_PASS : outcome === 'policy-failure' ? EXIT_POLICY : EXIT_ERROR;
}

/** Combine per-input outcomes: any error wins, then any policy failure. */
export function combine(outcomes: readonly Outcome[]): Outcome {
  if (outcomes.includes('error')) return 'error';
  if (outcomes.includes('policy-failure')) return 'policy-failure';
  return 'pass';
}
