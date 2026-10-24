import { useMemo } from 'react';
import { CircuitEditor } from '../components/CircuitEditor';
import { DesignEditor } from '../components/DesignEditor';
import { IconPlay, IconPlus, IconTrash } from '../components/icons';
import { ImportExport } from '../components/ImportExport';
import { ResultsPanel } from '../components/ResultsPanel';
import { RunProgress, isActive } from '../components/RunProgress';
import { isStale } from '../lib/canonical';
import { aesSharedSum, hadesSharedSum, identityProgram } from '../lib/presets';
import type { ExperimentReport } from '../lib/types';
import { inputProblems, setProgram, startRun } from '../state/actions';
import { dataSource, useAppState } from '../state/store';

export function WorkspaceView() {
  const design = useAppState((s) => s.design);
  const program = useAppState((s) => s.program);
  const target = useAppState((s) => s.target);
  const highlight = useAppState((s) => s.highlight);
  const runs = useAppState((s) => s.runs);
  const current = useAppState((s) => s.current);
  const source = useAppState(dataSource);

  const inputs = useMemo(() => ({ design, program, target: program ? target : undefined }), [design, program, target]);
  const problems = useMemo(() => inputProblems(inputs), [inputs]);
  const analysis = current.analysis ? runs[current.analysis] : undefined;
  const experiment = current.experiment ? runs[current.experiment] : undefined;
  const busy = isActive(analysis) || isActive(experiment);
  const experimentReport =
    experiment?.report?.kind === 'experiment' && !isStale(inputs, experiment.inputs)
      ? (experiment.report as ExperimentReport)
      : null;

  return (
    <div>
      <h1 className="visually-hidden">Workspace</h1>
      <div className="actionbar" role="region" aria-label="Run">
        <button
          type="button"
          className="btn btn-primary"
          disabled={problems.length > 0 || isActive(analysis)}
          onClick={() => startRun('analysis')}
        >
          <IconPlay size={12} /> {source === 'live' ? 'Check design and circuit' : 'Show recorded check'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={problems.length > 0 || isActive(experiment)}
          onClick={() => startRun('experiment', 'quick')}
        >
          {source === 'live' ? 'Run quick experiment' : 'Show recorded experiment'}
        </button>
        <div className="actionbar-status">
          {problems.length ? (
            <span className="error-text">
              {problems.length} input {problems.length === 1 ? 'problem' : 'problems'} to fix before checking
            </span>
          ) : busy ? (
            <RunProgress run={(isActive(analysis) ? analysis : experiment)!} compact />
          ) : source === 'replay' ? (
            <span className="muted">Replay mode: results come from recorded runs, never from this browser.</span>
          ) : (
            <span className="muted">Runs on the local service; Lean and native timing happen on this machine.</span>
          )}
        </div>
      </div>

      <div className="grid-inputs">
        <DesignEditor design={design} target={target} />
        {program ? (
          <div className="stack-lg">
            <CircuitEditor program={program} onChange={setProgram} highlight={highlight} designWidth={design.width} />
            <div className="row">
              <button type="button" className="btn btn-sm btn-quiet" onClick={() => setProgram(null)}>
                <IconTrash size={14} /> Check the design without a circuit
              </button>
            </div>
          </div>
        ) : (
          <section className="panel" aria-labelledby="no-circuit">
            <h2 id="no-circuit">Circuit</h2>
            <p className="muted" style={{ margin: '8px 0 16px' }}>
              No circuit: only the design guarantees will be checked.
            </p>
            <div className="row">
              <button
                type="button"
                className="btn"
                onClick={() => setProgram(design.field === 'gf256' ? aesSharedSum() : hadesSharedSum())}
              >
                <IconPlus size={14} /> Shared-sum circuit
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setProgram(identityProgram(design.width, design.field))}
              >
                <IconPlus size={14} /> Identity circuit
              </button>
            </div>
          </section>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <ImportExport inputs={inputs} />
      </div>

      <section style={{ marginTop: 32 }} aria-labelledby="results-heading">
        <div className="panel-head">
          <h2 id="results-heading">Results</h2>
          <span className="panel-sub">Design guarantees on the left, implementation correspondence on the right</span>
        </div>
        <ResultsPanel run={analysis} inputs={inputs} experiment={experimentReport} />
      </section>
    </div>
  );
}
