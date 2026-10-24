/**
 * Turning checked evidence into report claims. Statuses follow one rule:
 * only an accepted Lean theorem proves or refutes a design or circuit
 * claim; everything else is not established (a timeout or an unmet
 * precondition is never a refutation).
 */
import {
  EVIDENCE_LABELS,
  IMPLEMENTATION_CLAIMS,
  NOT_ESTABLISHED_TEXT,
  aesLikeActivityBound,
  designClaimsFor,
  nativeCorrectnessLabel,
} from '@cryptificate/schema';
import type {
  AnalysisRequest,
  Claim,
  ClaimId,
  ClaimInfo,
  NotEstablishedReason,
  Witness,
} from '@cryptificate/schema';
import type { ClaimVerdict, ExpectedTheorem } from './acceptance.js';

export interface NativeOutcome {
  /** Correctness cases executed. */
  cases: number;
  passed: boolean;
  checksum?: string;
  witness?: Witness | null;
  detail?: string;
}

export interface ClaimInputs {
  request: AnalysisRequest;
  expect: readonly ExpectedTheorem[];
  verdicts: readonly ClaimVerdict[];
  /** Unchecked engine diagnostics (raw JSON). */
  diagnostics: unknown;
  /** Set when Lean did not run to completion for every claim. */
  leanProblem?: { reason: NotEstablishedReason; detail: string };
  native?: NativeOutcome | { unavailable: string } | null;
  refinement?: { status: 'proved'; note: string } | null;
}

function notEstablished(info: ClaimInfo, reason: NotEstablishedReason, note: string, witness: Witness | null = null): Claim {
  return {
    id: info.id,
    chain: info.chain,
    title: info.title,
    status: 'not_established',
    evidence: { kind: 'diagnostic', label: EVIDENCE_LABELS.uncheckedDiagnostic },
    witness,
    note,
    reason,
  };
}

function leanClaim(info: ClaimInfo, verdict: ClaimVerdict, expect: ExpectedTheorem | undefined, witness: Witness | null, note: string): Claim {
  const label =
    verdict.status === 'refuted'
      ? EVIDENCE_LABELS.leanCounterexample
      : info.id === 'circuit.equivalence'
        ? EVIDENCE_LABELS.leanCircuitEquivalence
        : EVIDENCE_LABELS.leanProof;
  const evidence: Claim['evidence'] = { kind: 'lean', label, theorem: verdict.theorem };
  if (verdict.audit) {
    evidence.type = verdict.audit.type;
    evidence.axioms = [...verdict.audit.axioms];
  }
  return {
    id: info.id,
    chain: info.chain,
    title: info.title,
    status: verdict.status,
    evidence,
    witness: verdict.status === 'refuted' ? (expect?.witness ?? witness) : null,
    note,
  };
}

/** Find a witness of the given claim in the (unchecked) diagnostics. */
export function diagnosticWitness(diagnostics: unknown, claim: ClaimId): Witness | null {
  if (!diagnostics || typeof diagnostics !== 'object') return null;
  const d = diagnostics as Record<string, unknown>;
  const fromList = (list: unknown): Witness | null => {
    if (!Array.isArray(list)) return null;
    for (const item of list) {
      if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        if ((o['claim'] === claim || o['id'] === claim) && o['witness'] && typeof o['witness'] === 'object') {
          return o['witness'] as Witness;
        }
      }
    }
    return null;
  };
  const listed = fromList(d['claims']) ?? fromList(d['diagnostics']);
  if (listed) return listed;
  const byId = d[claim];
  if (byId && typeof byId === 'object') {
    const w = (byId as Record<string, unknown>)['witness'];
    if (w && typeof w === 'object') return w as Witness;
  }
  const witnesses = d['witnesses'];
  if (witnesses && typeof witnesses === 'object' && !Array.isArray(witnesses)) {
    const w = (witnesses as Record<string, unknown>)[claim];
    if (w && typeof w === 'object') return w as Witness;
  }
  return null;
}

function diagnosticHint(diagnostics: unknown, claim: ClaimId): boolean | null {
  if (!diagnostics || typeof diagnostics !== 'object') return null;
  const d = diagnostics as Record<string, unknown>;
  const pick = (v: unknown): boolean | null => {
    if (typeof v === 'boolean') return v;
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      for (const k of ['holds', 'ok', 'mds', 'pass', 'value']) if (typeof o[k] === 'boolean') return o[k] as boolean;
    }
    return null;
  };
  if (claim in d) return pick(d[claim]);
  if (Array.isArray(d['claims'])) {
    for (const item of d['claims'] as unknown[]) {
      if (item && typeof item === 'object' && (item as Record<string, unknown>)['claim'] === claim) {
        return pick(item);
      }
    }
  }
  return null;
}

function activityTitle(req: AnalysisRequest, info: ClaimInfo): string {
  const d = req.design;
  if (info.id === 'activity.bound' && d.model === 'aes-like/gf256/v1' && d.width === 4) {
    return `At least ${aesLikeActivityBound(d.rounds)} active S-boxes over ${d.rounds} rounds`;
  }
  return info.title;
}

export function buildAnalysisClaims(inp: ClaimInputs): Claim[] {
  const { request, expect, verdicts, diagnostics } = inp;
  const claims: Claim[] = [];
  const byClaim = new Map<ClaimId, ClaimVerdict>();
  for (const v of verdicts) if (!byClaim.has(v.claim)) byClaim.set(v.claim, v);
  const expectByClaim = new Map<ClaimId, ExpectedTheorem>();
  for (const e of expect) if (!expectByClaim.has(e.claim)) expectByClaim.set(e.claim, e);

  const fromLean = (info: ClaimInfo, title = info.title): Claim => {
    const verdict = byClaim.get(info.id);
    const e = expectByClaim.get(info.id);
    const witness = diagnosticWitness(diagnostics, info.id);
    const named: ClaimInfo = { ...info, title };
    if (verdict && verdict.accepted) {
      const note =
        verdict.status === 'refuted'
          ? `Lean checked a counterexample (${verdict.theorem}).`
          : `Lean checked ${verdict.theorem} using only the standard axioms.`;
      return leanClaim(named, verdict, e, witness, note);
    }
    if (verdict) {
      const hint = diagnosticHint(diagnostics, info.id);
      const suffix = hint === null ? '' : ` The unchecked diagnostic ${hint ? 'suggests it holds' : 'suggests it fails'}.`;
      return notEstablished(named, verdict.reason ?? 'lean-failed', `${verdict.detail}${suffix}`, witness);
    }
    if (inp.leanProblem && e) return notEstablished(named, inp.leanProblem.reason, inp.leanProblem.detail, witness);
    return notEstablished(named, 'out-of-scope', `No certificate template covers this case; ${NOT_ESTABLISHED_TEXT}.`, witness);
  };

  const isProved = (id: ClaimId): boolean => claims.some((c) => c.id === id && c.status === 'proved');

  for (const info of designClaimsFor(request.design.model)) {
    if (info.id === 'activity.bound' || info.id === 'activity.outer') {
      const title = activityTitle(request, info);
      const pre = info.id === 'activity.bound' ? ['matrix.mds', 'offsets.dispersion'] : ['external.mds'];
      const missing = pre.filter((p) => !isProved(p as ClaimId));
      if (missing.length > 0) {
        claims.push(
          notEstablished(
            { ...info, title },
            'precondition-failed',
            `${NOT_ESTABLISHED_TEXT[0]!.toUpperCase()}${NOT_ESTABLISHED_TEXT.slice(1)}: the bound needs ${missing.join(' and ')} to be proved first. This is not a refutation.`,
          ),
        );
        continue;
      }
      const c = fromLean(info, title);
      // A bound can only be proved or not established, never refuted.
      if (c.status === 'refuted') claims.push(notEstablished({ ...info, title }, 'lean-failed', NOT_ESTABLISHED_TEXT));
      else claims.push(c);
      continue;
    }
    claims.push(fromLean(info));
  }

  for (const info of IMPLEMENTATION_CLAIMS) {
    switch (info.id) {
      case 'circuit.equivalence':
        if (!request.program) claims.push(notEstablished(info, 'not-run', 'No circuit was submitted.'));
        else claims.push(fromLean(info));
        break;
      case 'native.correctness': {
        const n = inp.native;
        if (!request.program) claims.push(notEstablished(info, 'not-run', 'No circuit was submitted.'));
        else if (!n) claims.push(notEstablished(info, 'not-run', 'Native correctness was not run.'));
        else if ('unavailable' in n) claims.push(notEstablished(info, 'native-unavailable', n.unavailable));
        else if (n.passed) {
          claims.push({
            id: info.id,
            chain: info.chain,
            title: info.title,
            status: 'proved',
            evidence: { kind: 'native', label: nativeCorrectnessLabel(n.cases), cases: n.cases },
            witness: null,
            note: `Generated Rust matched the independently computed matrix product on all ${n.cases} test vectors. This is testing, not a proof.`,
          });
        } else {
          claims.push({
            id: info.id,
            chain: info.chain,
            title: info.title,
            status: 'refuted',
            evidence: { kind: 'native', label: nativeCorrectnessLabel(n.cases), cases: n.cases },
            witness: n.witness ?? null,
            note: n.detail ?? 'Generated Rust disagreed with the reference matrix product on a test vector.',
          });
        }
        break;
      }
      case 'rust.refinement':
        if (inp.refinement) {
          claims.push({
            id: info.id,
            chain: info.chain,
            title: info.title,
            status: 'proved',
            evidence: { kind: 'refinement', label: EVIDENCE_LABELS.rustRefinement },
            witness: null,
            note: inp.refinement.note,
          });
        } else {
          claims.push({
            ...notEstablished(info, 'out-of-scope', 'Refinement proofs cover the reference kernels in crates/kernels, not circuits generated for this run.'),
            status: 'unsupported',
          });
        }
        break;
      case 'native.timing':
        claims.push(notEstablished(info, 'not-run', 'Timing is measured by experiments, not by an analysis.'));
        break;
      default:
        break;
    }
  }
  return claims;
}
