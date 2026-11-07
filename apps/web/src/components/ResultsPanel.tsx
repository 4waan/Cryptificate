import { useMemo } from 'react';
import { isStale, normalizeAnalysisRequest, type WorkspaceInputs } from '../lib/canonical';
import { downloadJson } from '../lib/download';
import type { PreviewItem } from '../lib/preview';
import { displayFieldOf, type DisplayField } from '../lib/field';
import { exportReport, serverReportUrl } from '../lib/report';
import { PRIME_MINOR_WIDTH, WIDE_EXTERNAL_CLAIMS } from '../lib/types';
import type { AnalysisReport, CandidateDesign, Claim, ClaimId, ExperimentReport, ModelId } from '../lib/types';
import { checkNow } from '../state/actions';
import type { Run } from '../state/store';
import { ClaimCard, MissingClaimCard, PreviewCard } from './ClaimCard';
import { IconDownload, IconPlay, IconPreview, IconRefresh, IconWarning } from './icons';
import { PREVIEW_LABEL, previewItems } from './LiveChecks';
import { RunDetails, isActive } from './RunProgress';

const DESIGN_CLAIMS: Record<ModelId, { id: ClaimId; title: string }[]> = {
  'aes-like/gf256/v1': [
    { id: 'matrix.mds', title: 'Matrix is MDS (branch number 5)' },
    { id: 'offsets.dispersion', title: 'Row offsets spread every column' },
    { id: 'sbox.bijective', title: 'S-box is a permutation' },
    { id: 'activity.bound', title: 'Active S-box lower bound' },
    { id: 'sbox.differential', title: 'Differential uniformity of the S-box table' },
    { id: 'sbox.linearity', title: 'Linearity of the S-box table' },
  ],
  'hades/bn254/v1': [
    { id: 'external.mds', title: 'External matrix is MDS' },
    { id: 'internal.invertible', title: 'Internal matrix is invertible' },
    { id: 'sbox.bijective', title: 'Power map is a permutation' },
    { id: 'activity.outer', title: 'Active S-box bound in full rounds' },
    { id: 'activity.partial', title: 'No difference passes the partial rounds without an active S-box' },
    { id: 'activity.total', title: 'Active S-box bound over the whole permutation' },
    { id: 'constants.grain', title: 'Round constants are the Grain constants' },
  ],
  'hades/prime/v1': [
    { id: 'field.prime', title: 'Modulus is prime' },
    { id: 'external.mds', title: 'External matrix is MDS' },
    // Only above PRIME_MINOR_WIDTH; see designClaimSpecs.
    { id: 'external.m4_mds', title: 'External matrix is circ(2 M4, M4, …, M4) with M4 MDS' },
    { id: 'external.invertible', title: 'External matrix is invertible' },
    { id: 'internal.invertible', title: 'Internal matrix is invertible' },
    { id: 'sbox.bijective', title: 'Power map is a permutation' },
    { id: 'activity.outer', title: 'Active S-box bound in full rounds' },
    { id: 'activity.partial', title: 'No difference passes the partial rounds without an active S-box' },
    { id: 'activity.total', title: 'Active S-box bound over the whole permutation' },
    { id: 'constants.grain', title: 'Round constants are the Grain constants' },
  ],
};

/** The design claims of a design: the wide external claims only above width four. */
function designClaimSpecs(design: CandidateDesign): { id: ClaimId; title: string }[] {
  const wide = design.model === 'hades/prime/v1' && design.width > PRIME_MINOR_WIDTH;
  return DESIGN_CLAIMS[design.model].filter((c) => wide || !WIDE_EXTERNAL_CLAIMS.includes(c.id));
}

const IMPLEMENTATION_CLAIMS: { id: ClaimId; title: string }[] = [
  { id: 'circuit.equivalence', title: 'Circuit computes the design matrix' },
  { id: 'rust.refinement', title: 'Rust kernel refines the Lean model' },
  { id: 'native.correctness', title: 'Generated Rust is correct on test cases' },
  { id: 'native.timing', title: 'Native timing' },
];

const EXECUTION_TEXT: Record<string, string> = {
  failed: 'The run failed before every claim was checked.',
  timeout: 'The run hit its time limit.',
  cancelled: 'The run was stopped.',
  invalid: 'The service rejected the input.',
};

function missingReason(id: ClaimId, inputs: WorkspaceInputs, experiment: ExperimentReport | null): string {
  if (id === 'circuit.equivalence' && !inputs.program) return 'No circuit was submitted with this design.';
  if (id === 'native.correctness' || id === 'native.timing') {
    if (experiment) {
      const passed = experiment.candidates.filter((c) => c.native?.passed);
      return passed.length
        ? `Not part of this analysis. The latest experiment ran generated Rust for ${passed.length} candidate${passed.length === 1 ? '' : 's'}; see Experiments.`
        : 'Not part of this analysis; see Experiments.';
    }
    return 'Not part of this analysis. Run an experiment to compile, test and time generated Rust.';
  }
  if (id === 'rust.refinement') return 'This run did not include a Rust-source refinement result.';
  if (id === 'activity.partial' || id === 'activity.total') {
    return 'This report was recorded before the partial-round claims were added; check the design again to derive them.';
  }
  if (id === 'sbox.differential' || id === 'sbox.linearity') {
    return 'This run did not report S-box quality; reports recorded before these claims existed do not include them.';
  }
  if (id === 'constants.grain') {
    return 'This report was recorded before the round-constant claim was added; check the design again to derive it.';
  }
  return 'This run did not report this claim.';
}

export function exportRequest(inputs: WorkspaceInputs): void {
  try {
    downloadJson(
      'cryptificate-request.json',
      normalizeAnalysisRequest({ design: inputs.design, program: inputs.program ?? undefined, target: inputs.target }),
    );
  } catch {
    downloadJson('cryptificate-request.json', {
      design: inputs.design,
      program: inputs.program,
      target: inputs.target,
    });
  }
}

function Chain({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="chain" aria-label={title}>
      <div className="chain-head">
        <h3>{title}</h3>
        <span className="muted small">{subtitle}</span>
      </div>
      {children}
    </section>
  );
}

/** Both chains of browser diagnostics, labelled as a preview Lean has not checked. */
export function PreviewChains({ items, field }: { items: PreviewItem[]; field: DisplayField }) {
  return (
    <div className="grid-2">
      <Chain title="Design guarantees" subtitle={PREVIEW_LABEL}>
        {items
          .filter((i) => i.chain === 'design')
          .map((i) => (
            <PreviewCard key={i.id} item={i} field={field} />
          ))}
      </Chain>
      <Chain title="Implementation correspondence" subtitle={PREVIEW_LABEL}>
        {items
          .filter((i) => i.chain === 'implementation')
          .map((i) => (
            <PreviewCard key={i.id} item={i} field={field} />
          ))}
        <MissingClaimCard
          title="Rust refinement, native correctness and timing"
          reason="These need the local service: they are never computed in the browser."
        />
      </Chain>
    </div>
  );
}

export function UnverifiedPreview({ inputs, reason }: { inputs: WorkspaceInputs; reason: string }) {
  const items = useMemo(() => previewItems(inputs), [inputs]);
  const field = displayFieldOf(inputs.design);
  return (
    <div className="stack">
      <div className="banner banner-warn" role="status">
        <IconPreview />
        <div className="banner-body">
          <strong>These inputs are ready to check: export the design and run it with the local service.</strong> <span>{reason}</span>
        </div>
        <button type="button" className="btn" onClick={() => exportRequest(inputs)}>
          <IconDownload /> Export JSON
        </button>
      </div>
      {items.length ? <PreviewChains items={items} field={field} /> : <p className="muted">Fix the highlighted inputs to see the results.</p>}
    </div>
  );
}

/**
 * The instant preview in the result area: shown while there is no Lean
 * result for the inputs in the editor, and replaced by it when it arrives.
 */
export function LivePreview({
  items,
  field,
  note,
  action,
}: {
  items: PreviewItem[];
  field: DisplayField;
  note: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="stack" aria-label={PREVIEW_LABEL} data-live-preview="">
      <div className="banner banner-preview">
        <IconPreview />
        <div className="banner-body">
          <strong>{PREVIEW_LABEL}.</strong> <span>{note}</span>
        </div>
        {action}
      </div>
      {items.length ? <PreviewChains items={items} field={field} /> : <p className="muted">Fix the input problems to see the preview.</p>}
    </section>
  )
}

export function ClaimChains({
  report,
  inputs,
  experiment,
  only,
}: {
  report: AnalysisReport;
  inputs: WorkspaceInputs;
  experiment?: ExperimentReport | null;
  only?: ClaimId[];
}) {
  const reportDesign = report.inputs?.design ?? inputs.design;
  const field = displayFieldOf(reportDesign);
  const designClaims = designClaimSpecs(reportDesign);
  const rounds =
    report.inputs?.design && report.inputs.design.model === 'aes-like/gf256/v1'
      ? report.inputs.design.rounds
      : undefined;
  const byId = new Map<string, Claim>(report.claims.map((c) => [c.id, c]));
  const render = (spec: { id: ClaimId; title: string }) => {
    if (only && !only.includes(spec.id)) return null;
    const claim = byId.get(spec.id);
    return claim ? (
      <ClaimCard key={spec.id} claim={claim} field={field} rounds={rounds} />
    ) : (
      <MissingClaimCard
        key={spec.id}
        title={spec.title}
        reason={missingReason(spec.id, report.inputs ?? inputs, experiment ?? null)}
      />
    );
  };
  const extra = report.claims.filter(
    (c) => !designClaims.some((d) => d.id === c.id) && !IMPLEMENTATION_CLAIMS.some((d) => d.id === c.id),
  );
  return (
    <div className="grid-2">
      <Chain title="Design guarantees" subtitle="what the design promises">
        {designClaims.map(render)}
        {extra
          .filter((c) => c.chain === 'design' && (!only || only.includes(c.id)))
          .map((c) => (
            <ClaimCard key={c.id} claim={c} field={field} rounds={rounds} />
          ))}
      </Chain>
      <Chain title="Implementation correspondence" subtitle="whether the code keeps it">
        {IMPLEMENTATION_CLAIMS.map(render)}
        {extra
          .filter((c) => c.chain === 'implementation' && (!only || only.includes(c.id)))
          .map((c) => (
            <ClaimCard key={c.id} claim={c} field={field} rounds={rounds} />
          ))}
      </Chain>
    </div>
  );
}

/**
 * Downloads the self-contained HTML evidence report of a finished run. For a
 * live run it is the bundle's report.html, served by the local service; for a
 * recorded run it is rendered in the browser by the same renderer from the
 * recorded report, without the bundle's toolchain.json section.
 */
export function ExportReportButton({ report, run }: { report: AnalysisReport | ExperimentReport; run: Run }) {
  if (isActive(run) || run.state === 'unavailable') return null;
  const href = serverReportUrl(run);
  if (href) {
    return (
      <a className="btn btn-sm" href={href} download title="Download this run's evidence bundle report.html, printable to PDF">
        <IconDownload size={12} /> Export report
      </a>
    );
  }
  return (
    <button
      type="button"
      className="btn btn-sm"
      onClick={() => exportReport(report, run)}
      title="Download a self-contained HTML report of this run, printable to PDF"
    >
      <IconDownload size={12} /> Export report
    </button>
  );
}

/** Who checked the result and with which pinned toolchain, plus the evidence bundle. */
export function ProvenanceLine({ report, run }: { report: AnalysisReport | ExperimentReport; run: Run }) {
  const p = report.provenance;
  const lean = report.execution?.steps.find((s) => s.name === 'lean');
  const parts = [
    p.checker,
    p.toolchain?.lean ? `Lean ${p.toolchain.lean}` : null,
    p.toolchain?.widetrail ? `WideTrail ${p.toolchain.widetrail.slice(0, 10)}` : null,
    p.toolchain?.rustc && p.toolchain.rustc !== 'unavailable' ? p.toolchain.rustc : null,
    lean?.ms !== undefined && lean.state === 'completed' ? `Lean check ${(lean.ms / 1000).toFixed(1)} s` : null,
  ].filter(Boolean);
  return (
    <p className="small muted results-meta" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      <span>{parts.join(' · ')}</span>
      {p.leanSourceSha256 ? (
        <span className="mono" title={`SHA-256 of the generated Lean source: ${p.leanSourceSha256}`}>
          Lean source {p.leanSourceSha256.slice(0, 12)}…
        </span>
      ) : null}
      {run.bundleUrl && run.state !== 'unavailable' ? (
        <a href={run.bundleUrl} download>
          <IconDownload size={12} /> Evidence bundle
        </a>
      ) : null}
      <ExportReportButton report={report} run={run} />
    </p>
  );
}

/** What a run that ended without any report did, in words. */
export function noReportText(run: Run): string {
  const started = run.source !== 'live' || run.jobId !== undefined;
  if (!started) {
    if (run.state === 'cancelled') return 'Stopped before the service started it, so nothing was checked.';
    return 'The service never started this run, so nothing was checked.';
  }
  return `${EXECUTION_TEXT[run.state] ?? 'The run ended.'} It ended before producing a report, so nothing was checked.`;
}

export function ExecutionProblems({ report, run }: { report: AnalysisReport | ExperimentReport | null; run: Run }) {
  const state = report?.execution?.state ?? run.state;
  if (!['failed', 'timeout', 'cancelled', 'invalid'].includes(state)) return null;
  const steps = report?.execution?.steps ?? run.steps;
  const bad = steps.filter((s) => ['failed', 'timeout', 'cancelled', 'invalid'].includes(s.state));
  return (
    <section className="banner banner-bad" aria-label="Execution problems">
      <IconWarning />
      <div className="banner-body">
        <strong>Execution: {state}.</strong> {report ? (EXECUTION_TEXT[state] ?? '') : noReportText(run)}{' '}
        {run.error ? (
          <span className="block">
            {run.error}
            {run.errorPath ? <span className="mono"> ({run.errorPath})</span> : null}
          </span>
        ) : null}
        {bad.length ? (
          <span>
            Affected step{bad.length > 1 ? 's' : ''}: {bad.map((s) => `${s.name} (${s.state})`).join(', ')}.
          </span>
        ) : null}{' '}
        <span>
          {report
            ? 'This is an execution outcome, not a mathematical result: claims that did not finish are reported as not established, never as refuted.'
            : 'This is an execution outcome, not a mathematical result.'}
        </span>
      </div>
    </section>
  );
}

/** The workspace result area: staleness, execution problems, the instant preview and both claim chains. */
export function ResultsPanel({
  run,
  inputs,
  experiment,
  preview,
  source = 'live',
}: {
  run: Run | undefined;
  inputs: WorkspaceInputs;
  experiment?: ExperimentReport | null;
  /** Browser diagnostics for the inputs (debounced by the caller); computed here when absent. */
  preview?: PreviewItem[];
  source?: 'live' | 'replay';
}) {
  const computed = useMemo(() => (preview ? null : previewItems(inputs)), [preview, inputs]);
  const items = preview ?? computed ?? [];
  const field = displayFieldOf(inputs.design);
  const stale = run ? isStale(inputs, run.inputs) : false;
  const checkLabel = source === 'live' ? 'Check with Lean' : 'Show the recorded check';
  if (!run) {
    return (
      <LivePreview
        items={items}
        field={field}
        note={
          source === 'live'
            ? 'Computed in this browser as you edit, with no proof. Check to get Lean certificates for these exact values.'
            : 'Computed in this browser as you edit, with no proof. Lean runs on the local service; this page shows recorded runs.'
        }
        action={
          <button type="button" className="btn btn-primary" onClick={() => checkNow()} aria-keyshortcuts="Control+Enter Meta+Enter">
            <IconPlay size={12} /> {checkLabel}
          </button>
        }
      />
    );
  }
  const report = run.report && run.report.kind === 'analysis' ? (run.report as AnalysisReport) : null;
  if (run.state === 'unavailable') {
    return (
      <UnverifiedPreview
        inputs={inputs}
        reason="Lean certificates and native timing run on the local service (npx cryptificate serve)."
      />
    );
  }
  const active = isActive(run);
  return (
    <div className="stack-lg">
      {stale && run.source === 'replay' && !active ? (
        <UnverifiedPreview
          inputs={inputs}
          reason="You changed the inputs. The results below belong to the earlier version."
        />
      ) : null}
      {stale && run.source === 'live' ? (
        <div className="banner banner-warn" role="status">
          <IconWarning />
          <div className="banner-body">
            {active ? (
              <strong>The running check is for an earlier version of the inputs.</strong>
            ) : (
              <>
                <strong>These results are from an earlier version of the inputs.</strong> They no longer describe what is
                in the editor.
              </>
            )}
          </div>
          <button type="button" className="btn btn-primary" onClick={() => checkNow()}>
            <IconRefresh /> {active ? 'Check the current inputs' : 'Re-check'}
          </button>
        </div>
      ) : null}
      {/* The workspace action bar shows this run's status and its one Stop button; here are its steps. */}
      <RunDetails run={run} className="panel" stopWhere="Stop in the run bar at the top of the workspace" />
      {active && !stale ? (
        <LivePreview
          items={items}
          field={field}
          note="Computed in this browser. The Lean result for these inputs replaces it when it arrives."
        />
      ) : stale && run.source === 'live' ? (
        <LivePreview
          items={items}
          field={field}
          note="Computed in this browser for the inputs in the editor. Check them to replace this with Lean evidence."
        />
      ) : null}
      <ExecutionProblems report={report} run={run} />
      {!active && !stale && !report ? (
        <LivePreview
          items={items}
          field={field}
          note="Computed in this browser. Lean did not check these inputs: the run ended before a result."
          action={
            <button type="button" className="btn btn-primary" onClick={() => checkNow()} aria-keyshortcuts="Control+Enter Meta+Enter">
              <IconPlay size={12} /> {source === 'live' ? 'Check again' : checkLabel}
            </button>
          }
        />
      ) : null}
      {report ? (
        <div className={stale ? 'stale' : undefined} aria-label={stale ? 'Results from an earlier version' : undefined}>
          {stale ? <p className="stale-label">From an earlier version</p> : null}
          <ProvenanceLine report={report} run={run} />
          <ClaimChains report={report} inputs={run.inputs} experiment={experiment} />
        </div>
      ) : null}
    </div>
  );
}
