import { activityFormula } from '../lib/design';
import type { PreviewItem } from '../lib/preview';
import { ALLOWED_AXIOMS, type Claim, type FieldName } from '../lib/types';
import { IconInfo, IconPreview, StatusPill } from './icons';
import { WitnessView } from './WitnessView';

const ALLOWED = new Set(ALLOWED_AXIOMS);

/**
 * The evidence label as shown. A failed native run's label counts only the
 * passing cases; the total is added so "passed 39" is not read as success.
 */
export function evidenceText(claim: Claim): string {
  const ev = claim.evidence;
  const m = /^Generated Rust passed (\d+) correctness cases$/.exec(ev.label);
  if (ev.kind === 'native' && claim.status === 'refuted' && m && typeof ev.cases === 'number' && ev.cases > Number(m[1])) {
    return `Generated Rust passed only ${m[1]} of ${ev.cases} correctness cases`;
  }
  return ev.label;
}

export function ClaimCard({ claim, field, rounds }: { claim: Claim; field: FieldName; rounds?: number }) {
  const ev = claim.evidence;
  const hasProofDetails = Boolean(ev.theorem || ev.type || (ev.axioms && ev.axioms.length));
  const unchecked = ev.kind === 'diagnostic';
  return (
    <article className="claim" aria-labelledby={`claim-${claim.id}`} data-claim={claim.id} data-status={claim.status}>
      <div className="claim-head">
        <h4 className="claim-title" id={`claim-${claim.id}`}>
          {claim.title}
        </h4>
        <StatusPill
          status={claim.status}
          byMethod={claim.id.startsWith('activity') || claim.reason === 'precondition-failed'}
        />
      </div>
      <p className="evidence">
        {unchecked ? <IconInfo /> : null}
        <span>
          Evidence: <strong>{evidenceText(claim)}</strong>
        </span>
      </p>
      {claim.note ? <p className="claim-note">{claim.note}</p> : null}
      {claim.id === 'activity.bound' && rounds !== undefined && claim.status === 'proved' ? (
        <p className="small mono">Active S-boxes ≥ {activityFormula(rounds)}</p>
      ) : null}
      {claim.witness ? <WitnessView witness={claim.witness} field={field} unchecked={unchecked} /> : null}
      {hasProofDetails ? (
        <details className="proof">
          <summary>Proof details</summary>
          <dl>
            {ev.theorem ? (
              <>
                <dt>Theorem</dt>
                <dd>{ev.theorem}</dd>
              </>
            ) : null}
            {ev.type ? (
              <>
                <dt>Statement</dt>
                <dd>{ev.type}</dd>
              </>
            ) : null}
            {ev.axioms ? (
              <>
                <dt>Axioms</dt>
                <dd>
                  {ev.axioms.length ? ev.axioms.join(', ') : 'none'}
                  {ev.axioms.every((a) => ALLOWED.has(a)) ? (
                    <span className="muted"> (standard axioms only; no sorry, no native evaluation)</span>
                  ) : (
                    <span className="error-text"> includes axioms outside the allowed set</span>
                  )}
                </dd>
              </>
            ) : null}
            {ev.cases !== undefined ? (
              <>
                <dt>Cases</dt>
                <dd>{ev.cases}</dd>
              </>
            ) : null}
          </dl>
        </details>
      ) : null}
    </article>
  );
}

/** Placeholder for a claim the current result does not contain. */
export function MissingClaimCard({ title, reason }: { title: string; reason: string }) {
  return (
    <article className="claim" aria-label={title}>
      <div className="claim-head">
        <h4 className="claim-title">{title}</h4>
        <span className="status status-none">No result</span>
      </div>
      <p className="claim-note">{reason}</p>
    </article>
  );
}

const OUTCOME_TEXT = {
  holds: 'Holds',
  fails: 'Fails',
  unknown: 'Not established by this method',
} as const;

/** An unchecked browser computation. Never shown with a proof status. */
export function PreviewCard({ item, field }: { item: PreviewItem; field: FieldName }) {
  return (
    <article className="claim" aria-labelledby={`preview-${item.id}`} data-preview={item.id}>
      <div className="claim-head">
        <h4 className="claim-title" id={`preview-${item.id}`}>
          {item.title}
        </h4>
        <span className="status status-preview">
          <IconPreview />
          {OUTCOME_TEXT[item.outcome]}
        </span>
      </div>
      <p className="evidence">
        <IconInfo />
        <span>
          Evidence: <strong>Unchecked diagnostic</strong> (computed in this browser, no proof)
        </span>
      </p>
      <p className="claim-note">{item.note}</p>
      {item.witness ? <WitnessView witness={item.witness} field={field} preview /> : null}
    </article>
  );
}
