import { isStale, type WorkspaceInputs } from '../lib/canonical';
import { previewDesign, previewEquivalence, type PreviewItem, type PreviewOutcome } from '../lib/preview';
import type { AnalysisReport, Claim, ClaimId } from '../lib/types';
import type { Run } from '../state/store';
import { IconPreview, StatusPill } from './icons';

/**
 * Instant checks: browser diagnostics (lib/preview.ts) for the inputs in
 * the editor, recomputed as they change. They are labelled as a preview
 * that Lean has not checked. When a Lean result for exactly these inputs
 * is on screen, each item shows that result instead.
 */

export const PREVIEW_LABEL = 'Preview (not yet checked by Lean)';

const SHORT: Partial<Record<ClaimId, string>> = {
  'matrix.mds': 'MDS',
  'offsets.dispersion': 'Offsets',
  'sbox.bijective': 'S-box permutation',
  'activity.bound': 'Activity bound',
  'external.mds': 'External MDS',
  'internal.invertible': 'Internal invertible',
  'circuit.equivalence': 'Circuit = matrix',
};

export const OUTCOME_TEXT: Record<PreviewOutcome, string> = {
  holds: 'Holds',
  fails: 'Fails',
  unknown: 'Not established',
};

export function previewItems(inputs: WorkspaceInputs): PreviewItem[] {
  const items = previewDesign(inputs.design);
  if (inputs.program) {
    const eq = previewEquivalence(inputs.design, inputs.program, inputs.target);
    if (eq) items.push(eq);
  }
  return items;
}

/** The Lean report that describes exactly these inputs, if one is on screen. */
export function currentReport(run: Run | undefined, inputs: WorkspaceInputs): AnalysisReport | null {
  if (!run?.report || run.report.kind !== 'analysis' || run.state === 'unavailable') return null;
  return isStale(inputs, run.inputs) ? null : (run.report as AnalysisReport);
}

export interface CheckRow {
  id: ClaimId;
  label: string;
  title: string;
  preview?: PreviewItem;
  claim?: Claim;
}

/** One row per preview item; the Lean claim replaces the preview when the report is current. */
export function checkRows(items: PreviewItem[], report: AnalysisReport | null): CheckRow[] {
  const claims = new Map(report?.claims.map((c) => [c.id, c]) ?? []);
  return items.map((i) => {
    const claim = claims.get(i.id);
    return { id: i.id, label: SHORT[i.id] ?? i.title, title: i.title, ...(claim ? { claim } : { preview: i }) };
  });
}

/** The compact strip under the run buttons. */
export function LiveChecks({
  items,
  report,
  problems,
}: {
  items: PreviewItem[];
  report: AnalysisReport | null;
  problems: number;
}) {
  const rows = checkRows(items, report);
  const allLean = rows.length > 0 && rows.every((r) => r.claim);
  const someLean = rows.some((r) => r.claim);
  if (problems > 0 || !rows.length) {
    return (
      <div className="checks" aria-label="Instant checks">
        <span className="checks-label">
          <IconPreview size={14} /> {PREVIEW_LABEL}
        </span>
        <span className="small muted">Fix the input problems to see instant checks.</span>
      </div>
    );
  }
  return (
    <div className="checks" role="group" aria-label={allLean ? 'Checked by Lean' : 'Instant checks'}>
      <span className={`checks-label${allLean ? ' checks-label-lean' : ''}`}>
        {allLean ? 'Checked by Lean' : (
          <>
            <IconPreview size={14} /> {someLean ? 'Lean results, preview for the rest' : PREVIEW_LABEL}
          </>
        )}
      </span>
      <ul className="checks-list">
        {rows.map((r) => (
          <li key={r.id} className="check" data-source={r.claim ? 'lean' : 'preview'} title={r.title}>
            <span className="check-name">{r.label}</span>
            {r.claim ? (
              <StatusPill status={r.claim.status} short />
            ) : (
              <span className="status status-preview">
                <span className="visually-hidden">Preview: </span>
                {OUTCOME_TEXT[r.preview!.outcome]}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
