import { useMemo, useState } from 'react';
import { MeasurementChart, RatioChart, type RatioRow, type VariantSeries } from '../components/charts';
import {
  IconDownload,
  IconNotEstablished,
  IconPlay,
  IconProved,
  IconRefresh,
  IconRefuted,
  IconWarning,
  StatusPill,
} from '../components/icons';
import { ExecutionProblems, UnverifiedPreview } from '../components/ResultsPanel';
import { RunProgress, isActive } from '../components/RunProgress';
import { isStale } from '../lib/canonical';
import { circuitStats } from '../lib/circuit';
import { bestCandidate, candidateLabel, labelForId, savingsSummary, THRESHOLD } from '../lib/experiment';
import { formatBytes } from '../lib/stats';
import type { ExperimentProfile, ExperimentReport, MeasurementVerdict } from '../lib/types';
import { inputProblems, startRun } from '../state/actions';
import { dataSource, useAppState, type Run } from '../state/store';

const VERDICT_ICON: Record<MeasurementVerdict, JSX.Element> = {
  'locally confirmed': <IconProved size={18} />,
  inconclusive: <IconNotEstablished size={18} />,
  'no improvement': <IconRefuted size={18} />,
};

export function VerdictLine({ report }: { report: ExperimentReport }) {
  const m = report.measurements;
  if (!m) return <p className="muted">No timing in this run.</p>;
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="verdict">
        {VERDICT_ICON[m.verdict]}
        Timing verdict: {m.verdict}
      </span>
      <p className="small muted">
        Measured on {m.machine.cpu}, {m.machine.os}, {m.machine.ramMiB.toLocaleString('en-US')} MiB RAM,{' '}
        {m.machine.rustc}
        {m.machine.flags ? `, flags ${m.machine.flags}` : ''}. Applies to this machine only.
      </p>
    </div>
  );
}

export function SavingsCallout({ report }: { report: ExperimentReport }) {
  const s = savingsSummary(report);
  if (!s.structural) {
    return <p className="muted">No verified search candidate to compare with the reference in this run.</p>;
  }
  return (
    <div className="stack" style={{ gap: 6 }}>
      <p>
        <strong>Structure:</strong> {s.structural}
      </p>
      {s.timing ? (
        <p>
          <strong>Timing:</strong> {s.timing}
        </p>
      ) : null}
    </div>
  );
}

export function CandidatesTable({ report, limit }: { report: ExperimentReport; limit?: number }) {
  const best = bestCandidate(report);
  const shortlist = new Set(report.search?.shortlist ?? []);
  const field = report.candidates[0]?.program.field ?? 'gf256';
  const rows = limit ? report.candidates.slice(0, limit) : report.candidates;
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label="Candidates">
      <table className="data">
        <caption className="visually-hidden">Candidates</caption>
        <thead>
          <tr>
            <th scope="col">Variant</th>
            <th scope="col" className="num">
              {field === 'gf256' ? 'XORs' : 'Additions'}
            </th>
            {field === 'gf256' ? (
              <th scope="col" className="num">
                xtimes
              </th>
            ) : null}
            <th scope="col" className="num">
              Other muls
            </th>
            <th scope="col" className="num">
              Depth
            </th>
            <th scope="col">Equivalence</th>
            <th scope="col">Native correctness</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const s = circuitStats(c.program);
            return (
              <tr key={c.id} data-highlight={best?.id === c.id ? 'true' : undefined}>
                <th scope="row">
                  {candidateLabel(c)}
                  {shortlist.has(c.id) ? <span className="muted small"> · shortlisted</span> : null}
                  {best?.id === c.id ? <span className="small"> · cheapest verified</span> : null}
                </th>
                <td className="num">{s.adds}</td>
                {field === 'gf256' ? <td className="num">{s.xtimes}</td> : null}
                <td className="num">{s.otherMuls}</td>
                <td className="num">{s.depth}</td>
                <td>
                  <StatusPill status={c.equivalence.status} short />
                </td>
                <td>
                  {c.native ? (
                    c.native.passed ? (
                      <span title={`Generated Rust passed ${c.native.cases} correctness cases`}>
                        Passed {c.native.cases.toLocaleString('en-US')} cases
                      </span>
                    ) : (
                      <span className="error-text">Failed (not timed)</span>
                    )
                  ) : (
                    <span className="muted">Not run</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function HistoryTable({ report }: { report: ExperimentReport }) {
  const [all, setAll] = useState(false);
  const history = report.search?.history ?? [];
  const shortlist = new Set(report.search?.shortlist ?? []);
  const shown = all ? history : history.slice(0, 25);
  if (!report.search) return <p className="muted">No search in this run.</p>;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <p className="small muted">
        {report.search.generated.toLocaleString('en-US')} circuits generated, {history.length} recorded, seed{' '}
        <span className="mono">{report.search.seed}</span>. Search output is untrusted until its equivalence is
        Lean-checked.
      </p>
      <div
        className="table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Search history"
        style={{ maxHeight: 420, overflowY: 'auto' }}
      >
        <table className="data">
          <caption className="visually-hidden">Search history</caption>
          <thead>
            <tr>
              <th scope="col">Id</th>
              <th scope="col" className="num">
                add
              </th>
              <th scope="col" className="num">
                mul
              </th>
              <th scope="col" className="num">
                depth
              </th>
              <th scope="col" className="num">
                temps
              </th>
              <th scope="col">Symbolic check</th>
              <th scope="col">Shortlisted</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((h) => (
              <tr key={h.id} data-highlight={shortlist.has(h.id) ? 'true' : undefined}>
                <th scope="row" className="mono">
                  {h.id}
                </th>
                <td className="num">{h.ops.add}</td>
                <td className="num">{h.ops.mul}</td>
                <td className="num">{h.depth}</td>
                <td className="num">{h.temps}</td>
                <td>{h.symbolic === 'pass' ? 'pass' : 'reject'}</td>
                <td>{shortlist.has(h.id) ? 'yes' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {history.length > 25 ? (
        <button type="button" className="btn btn-sm" onClick={() => setAll((a) => !a)} aria-expanded={all}>
          {all ? 'Show first 25' : `Show all ${history.length}`}
        </button>
      ) : null}
    </div>
  );
}

export function MeasurementSection({ report }: { report: ExperimentReport }) {
  const m = report.measurements;
  const best = bestCandidate(report);
  const charts = useMemo(() => {
    if (!m) return [];
    const byBytes = new Map<number, VariantSeries[]>();
    m.workloads.forEach((w, i) => {
      const id = w.candidate ?? `variant-${i}`;
      const label = `${labelForId(report, id)}${w.session !== undefined ? ` · s${w.session}` : ''}`;
      const list = byBytes.get(w.bytes) ?? [];
      list.push({ id: `${id}-${w.session ?? 0}-${i}`, label, emphasis: id === best?.id, workload: w });
      byBytes.set(w.bytes, list);
    });
    return [...byBytes.entries()].sort((a, b) => a[0] - b[0]);
  }, [m, report, best]);
  const ratioGroups = useMemo(() => {
    if (!m) return [];
    const groups = new Map<string, RatioRow[]>();
    m.comparisons.forEach((c, i) => {
      const key = c.bytes !== undefined ? formatBytes(c.bytes) : 'All workloads';
      const list = groups.get(key) ?? [];
      list.push({
        key: `${i}`,
        label: `${labelForId(report, c.candidate)} vs ${labelForId(report, c.baseline).replace(/^Reference /, 'ref. ')} · s${c.session}`,
        emphasis: c.candidate === best?.id,
        comparison: c,
      });
      groups.set(key, list);
    });
    return [...groups.entries()];
  }, [m, report, best]);
  if (!m) return <p className="muted">No measurements in this run.</p>;
  return (
    <div className="stack-lg">
      <VerdictLine report={report} />
      {ratioGroups.map(([key, rows]) => (
        <RatioChart key={key} title={key} rows={rows} threshold={THRESHOLD} />
      ))}
      {charts.map(([bytes, series]) => {
        const cols = series[0]?.workload.columns;
        return (
          <MeasurementChart
            key={bytes}
            title={`${formatBytes(bytes)} workload${cols ? ` (${cols.toLocaleString('en-US')} columns)` : ''}`}
            series={series}
          />
        );
      })}
    </div>
  );
}

function ExperimentBody({ run, report }: { run: Run; report: ExperimentReport }) {
  return (
    <div className="stack-lg">
      <ExecutionProblems report={report} run={run} />
      <section className="panel" aria-labelledby="exp-summary">
        <div className="panel-head">
          <h2 id="exp-summary">Summary</h2>
          <span className="panel-sub">
            profile {report.profile}
            {run.bundleUrl ? (
              <>
                {' · '}
                <a href={run.bundleUrl} download>
                  <IconDownload size={12} /> evidence bundle
                </a>
              </>
            ) : null}
          </span>
        </div>
        <SavingsCallout report={report} />
      </section>
      <section className="panel" aria-labelledby="exp-candidates">
        <div className="panel-head">
          <h2 id="exp-candidates">Candidates</h2>
          <span className="panel-sub">Operation counts are read from each circuit</span>
        </div>
        <CandidatesTable report={report} />
      </section>
      <section className="panel" aria-labelledby="exp-measure">
        <div className="panel-head">
          <h2 id="exp-measure">Measurements</h2>
          <span className="panel-sub">Raw samples, medians, interquartile ranges and paired speedups</span>
        </div>
        <MeasurementSection report={report} />
      </section>
      <section className="panel" aria-labelledby="exp-history">
        <div className="panel-head">
          <h2 id="exp-history">Search history</h2>
        </div>
        <HistoryTable report={report} />
      </section>
    </div>
  );
}

export function ExperimentsView() {
  const design = useAppState((s) => s.design);
  const program = useAppState((s) => s.program);
  const target = useAppState((s) => s.target);
  const runs = useAppState((s) => s.runs);
  const current = useAppState((s) => s.current);
  const source = useAppState(dataSource);
  const [profile, setProfile] = useState<ExperimentProfile>('quick');
  const inputs = useMemo(() => ({ design, program, target: program ? target : undefined }), [design, program, target]);
  const problems = inputProblems(inputs);
  const run = current.experiment ? runs[current.experiment] : undefined;
  const report = run?.report?.kind === 'experiment' ? (run.report as ExperimentReport) : null;
  const stale = run ? isStale(inputs, run.inputs) : false;

  return (
    <div className="stack-lg">
      <div className="panel-head" style={{ marginBottom: 0 }}>
        <h1>Experiments</h1>
        <span className="panel-sub">
          Search for cheaper circuits, prove them equivalent, test and time them natively
        </span>
      </div>
      <div className="actionbar" style={{ marginBottom: 0 }}>
        <div className="segmented" role="radiogroup" aria-label="Profile">
          {(['quick', 'research'] as const).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={profile === p} onClick={() => setProfile(p)}>
              {p === 'quick' ? 'Quick' : 'Research'}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={problems.length > 0 || isActive(run)}
          onClick={() => startRun('experiment', profile)}
        >
          <IconPlay size={12} /> {source === 'live' ? 'Run experiment on workspace inputs' : 'Show recorded experiment'}
        </button>
        <div className="actionbar-status">
          {run ? <RunProgress run={run} compact /> : <span className="muted">No experiment yet.</span>}
        </div>
      </div>
      {problems.length ? (
        <p className="error-text">
          <IconWarning /> Fix the workspace inputs first: {problems[0]}
        </p>
      ) : null}
      {run && isActive(run) ? (
        <div className="panel">
          <RunProgress run={run} />
        </div>
      ) : null}
      {run && stale ? (
        run.source === 'replay' ? (
          <UnverifiedPreview inputs={inputs} reason="The workspace changed since this recorded experiment." />
        ) : (
          <div className="banner banner-warn" role="status">
            <IconWarning />
            <div className="banner-body">
              <strong>This experiment is from an earlier version of the inputs.</strong>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => startRun('experiment', run.profile ?? 'quick')}
            >
              <IconRefresh /> Re-check
            </button>
          </div>
        )
      ) : null}
      {run?.state === 'unavailable' ? (
        <UnverifiedPreview
          inputs={inputs}
          reason="No recorded experiment matches these inputs. Search, native correctness and timing need the local service."
        />
      ) : null}
      {run && report ? (
        <div className={stale ? 'stale' : undefined}>
          {stale ? <p className="stale-label">From an earlier version</p> : null}
          <ExperimentBody run={run} report={report} />
        </div>
      ) : !run ? (
        <div className="panel">
          <p className="muted">
            An experiment searches for circuits that compute the workspace matrix with fewer operations, proves each
            shortlisted circuit equivalent in Lean, tests generated Rust on {`1,021 + 8,192`} columns, and times the
            survivors against the references on this machine.
          </p>
        </div>
      ) : null}
    </div>
  );
}
