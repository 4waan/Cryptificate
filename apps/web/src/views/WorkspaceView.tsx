import { useMemo } from 'react';
import { CircuitEditor } from '../components/CircuitEditor';
import { ComputedMatrix, circuitFromDesign, generateCircuit } from '../components/ComputedMatrix';
import { DesignEditor } from '../components/DesignEditor';
import { IconCircuit, IconInfo, IconPlay, IconPlus, IconTrash, IconUndo, IconWarning } from '../components/icons';
import { ImportExport } from '../components/ImportExport';
import { ResultsPanel } from '../components/ResultsPanel';
import { RunProgress, isActive } from '../components/RunProgress';
import { WorkspaceToolbar } from '../components/WorkspaceToolbar';
import { isStale } from '../lib/canonical';
import { aesSharedSum, hadesSharedSum, identityProgram } from '../lib/presets';
import type { ExperimentReport } from '../lib/types';
import {
  clearNotice,
  dismissReplaced,
  inputProblems,
  restoreReplaced,
  setProgram,
  setView,
  startRun,
  undo,
} from '../state/actions';
import { dataSource, useAppState } from '../state/store';

/** Notices above the editors: a loaded share link, or edits a story step replaced. */
function WorkspaceNotices() {
  const replaced = useAppState((s) => s.replaced);
  const notice = useAppState((s) => s.notice);
  if (!replaced && !notice) return null;
  return (
    <div className="stack" style={{ gap: 12, marginBottom: 24 }}>
      {notice ? (
        <div className={`banner ${notice.kind === 'error' ? 'banner-bad' : 'banner-warn'}`} role="status">
          {notice.kind === 'error' ? <IconWarning /> : <IconInfo />}
          <div className="banner-body">
            <span>{notice.text}</span>
          </div>
          {notice.kind === 'info' ? (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                undo();
                clearNotice();
              }}
            >
              <IconUndo size={14} /> Undo
            </button>
          ) : null}
          <button type="button" className="btn btn-sm btn-quiet" onClick={clearNotice}>
            Dismiss
          </button>
        </div>
      ) : null}
      {replaced ? (
        <div className="banner banner-warn" role="status">
          <IconInfo />
          <div className="banner-body">
            <strong>{replaced.by} loaded its own inputs into the workspace.</strong>{' '}
            <span>Your earlier edits were kept and can be brought back.</span>
          </div>
          <button type="button" className="btn btn-sm" onClick={restoreReplaced}>
            Restore my edits
          </button>
          <button type="button" className="btn btn-sm btn-quiet" onClick={dismissReplaced}>
            Keep the story inputs
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function WorkspaceView() {
  const design = useAppState((s) => s.design);
  const program = useAppState((s) => s.program);
  const target = useAppState((s) => s.target);
  const highlight = useAppState((s) => s.highlight);
  const announcement = useAppState((s) => s.announcement);
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
          <IconPlay size={12} /> {source === 'live' ? 'Check design and circuit' : 'Show the check'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={problems.length > 0 || isActive(experiment)}
          onClick={() => startRun('experiment', 'quick')}
        >
          {source === 'live' ? 'Run quick experiment' : 'Show the quick experiment'}
        </button>
        {analysis?.report && !isActive(analysis) ? (
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => document.getElementById('results-heading')?.scrollIntoView({ block: 'start' })}
          >
            Jump to results
          </button>
        ) : null}
        <div className="actionbar-status">
          {problems.length ? (
            <span className="error-text">
              {problems.length} input {problems.length === 1 ? 'problem' : 'problems'} to fix before checking
            </span>
          ) : busy ? (
            <RunProgress run={(isActive(analysis) ? analysis : experiment)!} compact />
          ) : source === 'replay' ? null : (
            <span className="muted">Runs on the local service; Lean and native timing happen on this machine.</span>
          )}
        </div>
      </div>

      <WorkspaceToolbar field={design.field} problems={problems.length} />
      <WorkspaceNotices />
      <p className="visually-hidden" role="status" aria-live="polite" key={announcement.n}>
        {announcement.text}
      </p>

      <div className="grid-inputs">
        <DesignEditor design={design} target={target} />
        {program ? (
          <div className="stack-lg">
            <CircuitEditor program={program} onChange={setProgram} highlight={highlight} designWidth={design.width} />
            <ComputedMatrix
              design={design}
              target={target}
              program={program}
              searchLabel={source === 'live' ? 'Search for cheaper circuits' : 'Show the recorded search'}
              searchDisabled={problems.length > 0 || isActive(experiment)}
              onSearch={() => {
                if (startRun('experiment', 'quick')) setView('experiments');
              }}
            />
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
                className="btn btn-primary"
                disabled={!circuitFromDesign(design, target)}
                onClick={() => generateCircuit(design, target)}
              >
                <IconCircuit size={14} /> Generate from matrix
              </button>
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
