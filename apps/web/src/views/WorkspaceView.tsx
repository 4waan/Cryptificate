import { useEffect, useMemo, useRef, useState } from 'react';
import { CircuitEditor } from '../components/CircuitEditor';
import { ComputedMatrix, circuitFromDesign, generateCircuit } from '../components/ComputedMatrix';
import { DesignEditor } from '../components/DesignEditor';
import { IconCircuit, IconInfo, IconPlay, IconPlus, IconTrash, IconUndo, IconWarning } from '../components/icons';
import { ImportExport } from '../components/ImportExport';
import { LiveChecks, currentReport, previewItems } from '../components/LiveChecks';
import { modLabel } from '../components/Overlays';
import { AlertsMenu, AutoCheckSwitch } from '../components/RunControls';
import { ServiceCard } from '../components/ServiceCard';
import { ResultsPanel } from '../components/ResultsPanel';
import { RunProgress, isActive } from '../components/RunProgress';
import { WorkspaceToolbar } from '../components/WorkspaceToolbar';
import { findRecording } from '../data/replay';
import { isStale, type WorkspaceInputs } from '../lib/canonical';
import { matrixDiff } from '../lib/circuit';
import { targetMatrix } from '../lib/design';
import { useDebouncedValue } from '../lib/useDebounced';
import { aesSharedSum, hadesSharedSum, identityProgram } from '../lib/presets';
import type { ExperimentReport } from '../lib/types';
import {
  canCheck,
  checkNow,
  clearNotice,
  dismissReplaced,
  inputProblems,
  SHARED_LINK,
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
            {replaced.by === SHARED_LINK ? 'Keep the shared inputs' : 'Keep the story inputs'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * One polite live region that stays mounted. A new announcement first
 * clears the text, then sets it on the next frame, so screen readers
 * speak repeated and back-to-back messages.
 */
function Announcer() {
  const announcement = useAppState((s) => s.announcement);
  const [text, setText] = useState('');
  useEffect(() => {
    if (!announcement.text) return;
    setText('');
    const frame = requestAnimationFrame(() => setText(announcement.text));
    return () => cancelAnimationFrame(frame);
  }, [announcement]);
  return (
    <p className="visually-hidden" role="status" aria-live="polite">
      {text}
    </p>
  );
}

/** In replay mode, whether a recorded quick experiment exists for these inputs (null while looking). */
function useRecordedSearch(inputs: WorkspaceInputs, enabled: boolean): boolean | null {
  const [found, setFound] = useState<{ inputs: WorkspaceInputs; ok: boolean } | null>(null);
  const latest = useRef(inputs);
  latest.current = inputs;
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void findRecording('experiment', inputs).then((m) => {
      if (live && latest.current === inputs) setFound({ inputs, ok: m !== null });
    });
    return () => {
      live = false;
    };
  }, [inputs, enabled]);
  if (!enabled) return null;
  return found && found.inputs === inputs ? found.ok : null;
}

export function WorkspaceView() {
  const design = useAppState((s) => s.design);
  const program = useAppState((s) => s.program);
  const target = useAppState((s) => s.target);
  const highlight = useAppState((s) => s.highlight);
  const runs = useAppState((s) => s.runs);
  const current = useAppState((s) => s.current);
  const source = useAppState(dataSource);
  const connection = useAppState((s) => s.connection);
  const checkable = useAppState((s) => canCheck(s));
  const showServiceCard =
    connection.status === 'unreachable' || (connection.status === 'checking' && connection.message !== undefined);

  const inputs = useMemo(() => ({ design, program, target: program ? target : undefined }), [design, program, target]);
  const problems = useMemo(() => inputProblems(inputs), [inputs]);
  const analysis = current.analysis ? runs[current.analysis] : undefined;
  const experiment = current.experiment ? runs[current.experiment] : undefined;
  const busy = isActive(analysis) || isActive(experiment);
  const canGenerate = useMemo(() => circuitFromDesign(design, target) !== null, [design, target]);
  const recorded = useRecordedSearch(inputs, source === 'replay' && program !== null && problems.length === 0);
  const circuitDiffers = useMemo(() => {
    if (!program || program.field !== design.field || program.width !== design.width) return false;
    const d = matrixDiff(targetMatrix(design, target), program);
    return d !== null && d.cells.length > 0;
  }, [design, program, target]);
  let searchLabel = 'Search for cheaper circuits';
  let searchNote: string | undefined;
  if (source === 'replay') {
    searchLabel =
      recorded === false ? 'No recorded search for these inputs' : recorded === null ? 'Looking for a recorded search…' : 'Show the recorded search';
    if (recorded === false && problems.length === 0) {
      searchNote = 'This static build only replays recorded runs, and none matches these inputs. Run the local service to search any design.';
    }
  }
  if (!searchNote && circuitDiffers) {
    searchNote = 'Your circuit does not compute the matrix, so the search starts from the matrix alone and leaves your circuit out of the comparison.';
  }
  // Browser diagnostics, recomputed shortly after the inputs settle.
  const settled = useDebouncedValue(inputs, 150);
  const preview = useMemo(() => previewItems(settled), [settled]);
  const leanReport = currentReport(analysis, inputs);
  const mod = modLabel();
  const experimentReport =
    experiment?.report?.kind === 'experiment' && !isStale(inputs, experiment.inputs)
      ? (experiment.report as ExperimentReport)
      : null;

  return (
    <div>
      <h1 className="visually-hidden">Workspace</h1>
      {showServiceCard ? <ServiceCard connection={connection} /> : null}
      <div className="actionbar" role="region" aria-label="Run">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!checkable}
          onClick={() => checkNow()}
          aria-keyshortcuts="Control+Enter Meta+Enter"
          title={`${mod}+Enter`}
        >
          <IconPlay size={12} /> {source === 'live' ? 'Check design and circuit' : 'Show the check'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={problems.length > 0 || isActive(experiment)}
          onClick={() => startRun('experiment', 'quick')}
          aria-keyshortcuts="Control+Shift+Enter Meta+Shift+Enter"
          title={`${mod}+Shift+Enter`}
        >
          {source === 'live' ? 'Run quick experiment' : 'Show the quick experiment'}
        </button>
        <AutoCheckSwitch source={source} />
        <AlertsMenu />
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
          ) : null}
        </div>
        <LiveChecks items={preview} report={leanReport} problems={problems.length} />
      </div>

      <WorkspaceToolbar field={design.field} problems={problems.length} />
      <WorkspaceNotices />
      <Announcer />

      <div className="grid-inputs">
        <DesignEditor design={design} target={target} />
        {program ? (
          <div className="stack-lg">
            <CircuitEditor program={program} onChange={setProgram} highlight={highlight} designWidth={design.width} />
            <ComputedMatrix
              design={design}
              target={target}
              program={program}
              searchLabel={searchLabel}
              searchNote={searchNote}
              searchDisabled={problems.length > 0 || isActive(experiment) || (source === 'replay' && recorded !== true)}
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
                disabled={!canGenerate}
                aria-describedby={canGenerate ? undefined : 'generate-why'}
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
            {canGenerate ? null : (
              <p id="generate-why" className="small muted" style={{ marginTop: 8 }}>
                Fix the matrix cells to generate a circuit from the matrix.
              </p>
            )}
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
        <ResultsPanel run={analysis} inputs={inputs} experiment={experimentReport} preview={preview} source={source} />
      </section>
    </div>
  );
}
