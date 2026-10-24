import { useMemo } from 'react';
import { isStale, normalizeAnalysisRequest, type WorkspaceInputs } from '../lib/canonical';
import { downloadJson } from '../lib/download';
import { previewDesign, previewEquivalence, type PreviewItem } from '../lib/preview';
import type { AnalysisReport, Claim, ClaimId, ExperimentReport, FieldName } from '../lib/types';
import { startRun } from '../state/actions';
import type { Run } from '../state/store';
import { ClaimCard, MissingClaimCard, PreviewCard } from './ClaimCard';
import { IconDownload, IconPreview, IconRefresh, IconWarning } from './icons';
import { RunProgress, isActive } from './RunProgress';

const DESIGN_CLAIMS: Record<FieldName, { id: ClaimId; title: string }[]> = {
  gf256: [
    { id: 'matrix.mds', title: 'Matrix is MDS (branch number 5)' },
    { id: 'offsets.dispersion', title: 'Row offsets spread every column' },
    { id: 'sbox.bijective', title: 'S-box is a permutation' },
    { id: 'activity.bound', title: 'Active S-box lower bound' },
  ],
  bn254: [
    { id: 'external.mds', title: 'External matrix is MDS' },
    { id: 'internal.invertible', title: 'Internal matrix is invertible' },
    { id: 'sbox.bijective', title: 'Power map is a permutation' },
    { id: 'activity.outer', title: 'Active S-box bound in full rounds' },
  ],
};

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

function previewItems(inputs: WorkspaceInputs): PreviewItem[] {
  const items = previewDesign(inputs.design);
  if (inputs.program) {
    const eq = previewEquivalence(inputs.design, inputs.program, inputs.target);
    if (eq) items.push(eq);
  }
  return items;
}

export function UnverifiedPreview({ inputs, reason }: { inputs: WorkspaceInputs; reason: string }) {
  const items = useMemo(() => previewItems(inputs), [inputs]);
  const field = inputs.design.field;
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
      {items.length ? (
        <div className="grid-2">
          <Chain title="Design guarantees" subtitle="computed in the browser">
            {items
              .filter((i) => i.chain === 'design')
              .map((i) => (
                <PreviewCard key={i.id} item={i} field={field} />
              ))}
          </Chain>
          <Chain title="Implementation correspondence" subtitle="computed in the browser">
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
      ) : (
        <p className="muted">Fix the highlighted inputs to see the results.</p>
      )}
    </div>
  );
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
  const field = report.inputs?.design?.field ?? inputs.design.field;
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
    (c) => !DESIGN_CLAIMS[field].some((d) => d.id === c.id) && !IMPLEMENTATION_CLAIMS.some((d) => d.id === c.id),
  );
  return (
    <div className="grid-2">
      <Chain title="Design guarantees" subtitle="what the design promises">
        {DESIGN_CLAIMS[field].map(render)}
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
    </p>
  );
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
        <strong>Execution: {state}.</strong> {EXECUTION_TEXT[state] ?? ''}{' '}
        {bad.length ? (
          <span>
            Affected step{bad.length > 1 ? 's' : ''}: {bad.map((s) => `${s.name} (${s.state})`).join(', ')}.
          </span>
        ) : null}{' '}
        <span>
          This is an execution outcome, not a mathematical result: claims that did not finish are reported as not
          established, never as refuted.
        </span>
      </div>
    </section>
  );
}

/** The workspace result area: staleness, execution problems and both claim chains. */
export function ResultsPanel({
  run,
  inputs,
  experiment,
}: {
  run: Run | undefined;
  inputs: WorkspaceInputs;
  experiment?: ExperimentReport | null;
}) {
  const stale = run ? isStale(inputs, run.inputs) : false;
  if (!run) {
    return (
      <div className="panel">
        <p className="muted">
          No results yet. <strong>Check</strong> the design and circuit to see which guarantees hold and whether the
          circuit implements the design.
        </p>
      </div>
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
  return (
    <div className="stack-lg">
      {stale ? (
        run.source === 'replay' ? (
          <UnverifiedPreview
            inputs={inputs}
            reason="You changed the inputs. The results below belong to the earlier version."
          />
        ) : (
          <div className="banner banner-warn" role="status">
            <IconWarning />
            <div className="banner-body">
              <strong>These results are from an earlier version of the inputs.</strong> They no longer describe what is
              in the editor.
            </div>
            <button type="button" className="btn btn-primary" onClick={() => startRun('analysis')}>
              <IconRefresh /> Re-check
            </button>
          </div>
        )
      ) : null}
      {isActive(run) ? (
        <div className="panel">
          <RunProgress run={run} />
        </div>
      ) : null}
      <ExecutionProblems report={report} run={run} />
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
