import { stopRun } from '../state/actions';
import type { Run } from '../state/store';
import { IconStop } from './icons';

const STATE_TEXT: Record<string, string> = {
  submitting: 'Submitting',
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  timeout: 'Timed out',
  cancelled: 'Stopped',
  invalid: 'Rejected as invalid input',
  unavailable: 'No recorded run for these inputs',
};

const STEP_TEXT: Record<string, string> = {
  validate: 'Validate inputs',
  diagnose: 'Diagnose',
  'emit-lean': 'Generate Lean',
  lean: 'Lean check',
  audit: 'Audit axioms',
  search: 'Search',
  equivalence: 'Equivalence proofs',
  codegen: 'Generate Rust',
  compile: 'Compile',
  correctness: 'Native correctness',
  timing: 'Native timing',
  confirm: 'Confirmation sessions',
};

export function stepLabel(name: string): string {
  return STEP_TEXT[name] ?? name.replace(/[-_]/g, ' ');
}

export function runStateText(run: Run): string {
  if (run.state === 'queued' && run.queuePosition) return `Queued (position ${run.queuePosition})`;
  return STATE_TEXT[run.state] ?? run.state;
}

export function isActive(run: Run | undefined): boolean {
  return !!run && (run.state === 'submitting' || run.state === 'queued' || run.state === 'running');
}

/** Status line, progress steps and a stop button for one run. */
export function RunProgress({ run, compact = false }: { run: Run; compact?: boolean }) {
  const active = isActive(run);
  const what = run.kind === 'analysis' ? 'Analysis' : `Experiment (${run.profile ?? 'quick'})`;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row" role="status" aria-live="polite">
        {active ? <span className="spinner" aria-hidden="true" /> : null}
        <span>
          <strong>{what}:</strong> {runStateText(run)}
          {run.source === 'replay' && run.recordingId ? (
            <span className="muted"> · recorded run “{run.recordingId}”</span>
          ) : null}
        </span>
        {active ? (
          <button type="button" className="btn btn-sm" onClick={() => void stopRun(run.key)}>
            <IconStop size={12} /> Stop
          </button>
        ) : null}
      </div>
      {!compact && run.steps.length ? (
        <ol className="progress-steps" aria-label="Steps">
          {run.steps.map((st) => (
            <li key={st.name} data-state={st.state}>
              {st.state === 'running' ? <span className="spinner" aria-hidden="true" /> : null}
              <span>{stepLabel(st.name)}</span>
              <span className="muted">
                {st.state === 'completed' && st.ms !== undefined
                  ? `${(st.ms / 1000).toFixed(st.ms < 10000 ? 1 : 0)} s`
                  : st.state === 'running'
                    ? 'running'
                    : st.state.replace('_', ' ')}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      {run.error ? (
        <p className="error-text">
          {run.error}
          {run.errorPath ? <span className="mono"> ({run.errorPath})</span> : null}
        </p>
      ) : null}
    </div>
  );
}
