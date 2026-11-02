import { budgetMs, estimate, estimateText, formatDuration, timingKey, typicalMs, type Estimate, type Timings } from '../lib/progress';
import { BUSY_MAX_ATTEMPTS, secondsUntil } from '../lib/retry';
import type { Capabilities, Step } from '../lib/types';
import { useNow } from '../lib/useNow';
import { retryNow, runIsActive, stopRun } from '../state/actions';
import { isTimingStep, useAppState, type Run } from '../state/store';
import { IconRefresh, IconStop } from './icons';

const STATE_TEXT: Record<string, string> = {
  submitting: 'Submitting',
  retrying: 'Service busy, waiting to retry',
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  timeout: 'Timed out',
  cancelled: 'Stopped',
  invalid: 'Rejected as invalid input',
  unavailable: 'No result for these inputs yet',
};

const STEP_TEXT: Record<string, string> = {
  validate: 'Validate inputs',
  diagnose: 'Diagnose',
  'emit-lean': 'Generate Lean',
  lean: 'Lean check',
  native: 'Native correctness',
  report: 'Report',
  search: 'Search',
  equivalence: 'Equivalence proofs',
  'native-correctness': 'Native correctness',
  'benchmark-1': 'Timing, session 1',
  'benchmark-2': 'Timing, session 2',
  'benchmark-3': 'Timing, session 3',
};

/** Human label for a pipeline step; "lean:c1" reads "Lean check (c1)". */
export function stepLabel(name: string): string {
  const [base = name, sub] = name.split(':');
  const label = STEP_TEXT[base] ?? base.replace(/[-_]/g, ' ');
  return sub ? `${label} (${sub})` : label;
}

export function runStateText(run: Run, now: number = Date.now()): string {
  if (run.state === 'queued' && run.queuePosition) return `Queued (position ${run.queuePosition})`;
  if (run.state === 'retrying') {
    const left = run.retryAt !== undefined ? secondsUntil(run.retryAt, now) : 0;
    return `Service busy, retrying in ${left} s`;
  }
  return STATE_TEXT[run.state] ?? run.state;
}

export function isActive(run: Run | undefined): boolean {
  return runIsActive(run);
}

/** Elapsed time and the estimate for a run, as shown beside its state. */
export function runTiming(
  run: Run,
  now: number,
  capabilities: Capabilities | undefined,
  timings: Timings,
): { elapsed: string; estimate: Estimate | null; text: string } | null {
  if (run.startedAt === undefined || run.source !== 'live') return null;
  const end = run.finishedAt ?? now;
  const elapsedMs = end - run.startedAt;
  if (!isActive(run)) return { elapsed: formatDuration(elapsedMs), estimate: null, text: `took ${formatDuration(elapsedMs)}` };
  const e = estimate(elapsedMs, typicalMs(timings, timingKey(run.kind, run.profile)), budgetMs(capabilities, run.kind, run.profile));
  const more = estimateText(e);
  return { elapsed: formatDuration(elapsedMs), estimate: e, text: more ? `${formatDuration(elapsedMs)} · ${more}` : formatDuration(elapsedMs) };
}

function stepTime(st: Step, run: Run, now: number): string {
  if (st.state === 'completed' && st.ms !== undefined) return formatDuration(st.ms);
  if (st.state === 'running') {
    const since = run.stepStarts?.[st.name];
    return since !== undefined ? formatDuration(now - since) : 'running';
  }
  return st.state.replace('_', ' ');
}

/** Status line, elapsed time and estimate, progress steps and a stop button for one run. */
export function RunProgress({ run, compact = false, now: fixedNow }: { run: Run; compact?: boolean; now?: number }) {
  const active = isActive(run);
  const capabilities = useAppState((s) => s.connection.capabilities);
  const timings = useAppState((s) => s.timings);
  // Elapsed time stops updating while native code is being timed, so the page stays still.
  const ticking = active && fixedNow === undefined && !isTimingStep(run);
  const clock = useNow(ticking, 500);
  const now = fixedNow ?? clock;
  const what = run.kind === 'analysis' ? (run.auto ? 'Auto-check' : 'Analysis') : `Experiment (${run.profile ?? 'quick'})`;
  const timing = runTiming(run, now, capabilities, timings);
  const fraction = active && run.state === 'running' ? timing?.estimate?.fraction : undefined;
  return (
    <div className="stack run-progress" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 'var(--space-2) var(--space-3)' }}>
        {active ? <span className="spinner" aria-hidden="true" /> : null}
        <span role="status" aria-live="polite" aria-atomic="true">
          <strong>{what}:</strong> {run.state === 'retrying' ? 'Service busy, waiting to retry' : runStateText(run, now)}
        </span>
        {timing ? (
          <span className="run-time small muted mono" title="Measured in this browser; approximate">
            {run.state === 'retrying' && run.retryAt !== undefined
              ? `retry in ${secondsUntil(run.retryAt, now)} s`
              : timing.text}
          </span>
        ) : null}
        {run.state === 'retrying' ? (
          <button type="button" className="btn btn-sm" onClick={() => retryNow(run.key)}>
            <IconRefresh size={12} /> Retry now
          </button>
        ) : null}
        {active ? (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void stopRun(run.key)}
            aria-keyshortcuts="Escape"
            title="Stop (Esc)"
          >
            <IconStop size={12} /> Stop
          </button>
        ) : null}
      </div>
      {fraction !== undefined && !compact ? (
        <div
          className="run-bar"
          role="progressbar"
          aria-label="Estimated progress, from earlier runs in this browser"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fraction * 100)}
        >
          <span style={{ width: `${Math.round(fraction * 100)}%` }} />
        </div>
      ) : null}
      {!compact && run.steps.length ? (
        <ol className="progress-steps" aria-label="Steps">
          {run.steps.map((st) => (
            <li key={st.name} data-state={st.state} title={st.detail}>
              {st.state === 'running' ? <span className="spinner" aria-hidden="true" /> : null}
              <span>{stepLabel(st.name)}</span>
              <span className="muted">{stepTime(st, run, now)}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {run.state === 'retrying' && !compact ? (
        <p className="small muted">
          The service runs one job at a time and keeps a short queue, and both are full. This{' '}
          {run.kind === 'analysis' ? 'check' : 'experiment'} is submitted again automatically (attempt{' '}
          {(run.attempts ?? 0) + 1} of {BUSY_MAX_ATTEMPTS + 1}).
        </p>
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
