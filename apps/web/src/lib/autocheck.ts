import type { Timers } from './debounce';

/**
 * Auto-check: when switched on, the workspace is checked shortly after the
 * user stops editing. The decision is a pure function of a small view of
 * the app state; the driver adds the idle delay, a minimum interval between
 * submissions, and supersedes an unfinished auto-check whose inputs are out
 * of date (it is stopped before the new one is submitted, so the service's
 * short queue is not filled with checks nobody will read).
 *
 * Results are matched to inputs by digest everywhere in the page, so a
 * late result for superseded inputs is shown as "from an earlier version",
 * never as the result for the current inputs.
 */

/** Idle time after the last edit before an auto-check is submitted. */
export const AUTO_DELAY_MS = 1200;
/** At least this long between two auto-check submissions. */
export const AUTO_MIN_INTERVAL_MS = 2500;

export interface AutoView {
  enabled: boolean;
  /** Auto-check runs only in the workspace. */
  inWorkspace: boolean;
  /** The service connection is still being established. */
  connecting: boolean;
  /** Digest of the current inputs, or null while they have problems. */
  digest: string | null;
  /** The latest analysis of the workspace, if any. */
  last?: { key: string; digest: string | null; active: boolean; auto: boolean; failed: boolean };
  /** An experiment is running: auto-check must not disturb its timing. */
  experimentActive: boolean;
  /** Jobs the service would still accept from this page (see queueRoom). */
  room: number;
}

export type AutoDecision =
  | { kind: 'off' }
  | { kind: 'idle'; reason: string }
  | { kind: 'checking' }
  | { kind: 'run'; digest: string; supersede?: string };

export function decideAutoCheck(v: AutoView): AutoDecision {
  if (!v.enabled) return { kind: 'off' };
  if (!v.inWorkspace) return { kind: 'idle', reason: 'Paused outside the workspace.' };
  if (v.connecting) return { kind: 'idle', reason: 'Waiting for the service.' };
  if (v.digest === null) return { kind: 'idle', reason: 'Waiting for valid inputs.' };
  const last = v.last;
  if (last && last.digest === v.digest) {
    if (last.active) return { kind: 'checking' };
    return {
      kind: 'idle',
      reason: last.failed ? 'The last check did not finish; press Check to try again.' : 'Up to date.',
    };
  }
  if (v.experimentActive) return { kind: 'idle', reason: 'Paused while an experiment runs.' };
  if (last?.active && !last.auto) return { kind: 'idle', reason: 'Waiting for the current check to finish.' };
  const supersede = last?.active && last.auto ? last.key : undefined;
  if (!supersede && v.room <= 0) return { kind: 'idle', reason: 'Waiting for room in the service queue.' };
  return supersede ? { kind: 'run', digest: v.digest, supersede } : { kind: 'run', digest: v.digest };
}

export type AutoReport = { kind: 'off' } | { kind: 'idle'; reason: string } | { kind: 'scheduled'; at: number } | { kind: 'checking' };

export interface AutoDriverDeps {
  read(): AutoView;
  /** Starts an auto-check of the current inputs. */
  start(): void;
  /** Stops an unfinished run (resolves when the stop request is done). */
  stop(key: string): Promise<void>;
  /** Reports what auto-check is doing, for the status text. Called only on change. */
  report(status: AutoReport): void;
  timers?: Timers;
  now?(): number;
  delayMs?: number;
  minIntervalMs?: number;
}

export interface AutoDriver {
  /** Re-evaluates after any state change. Cheap when nothing changed. */
  update(): void;
  /** Drops any scheduled check. */
  dispose(): void;
}

const defaultTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export function createAutoChecker(deps: AutoDriverDeps): AutoDriver {
  const timers = deps.timers ?? defaultTimers;
  const now = deps.now ?? (() => Date.now());
  const delay = deps.delayMs ?? AUTO_DELAY_MS;
  const minInterval = deps.minIntervalMs ?? AUTO_MIN_INTERVAL_MS;
  let handle: unknown = null;
  let scheduled: string | null = null;
  let lastSubmit = Number.NEGATIVE_INFINITY;
  let stopping = false;
  let reported = '';

  const report = (s: AutoReport) => {
    const key = JSON.stringify(s);
    if (key === reported) return;
    reported = key;
    deps.report(s);
  };
  const cancel = () => {
    if (handle !== null) timers.clear(handle);
    handle = null;
    scheduled = null;
  };
  const schedule = (digest: string, ms: number) => {
    cancel();
    scheduled = digest;
    handle = timers.set(() => void fire(), ms);
    report({ kind: 'scheduled', at: now() + ms });
  };

  const update = () => {
    if (stopping) return;
    const d = decideAutoCheck(deps.read());
    if (d.kind !== 'run') {
      cancel();
      report(d.kind === 'idle' ? { kind: 'idle', reason: d.reason } : { kind: d.kind });
      return;
    }
    // Every edit that changes the digest restarts the idle delay.
    if (d.digest !== scheduled) schedule(d.digest, delay);
  };

  const fire = async () => {
    handle = null;
    scheduled = null;
    const d = decideAutoCheck(deps.read());
    if (d.kind !== 'run') return update();
    const wait = lastSubmit + minInterval - now();
    if (wait > 0) return schedule(d.digest, wait);
    if (d.supersede) {
      stopping = true;
      try {
        await deps.stop(d.supersede);
      } catch {
        // The superseded run's result is ignored by digest even if it still arrives.
      } finally {
        stopping = false;
      }
      const again = decideAutoCheck(deps.read());
      if (again.kind !== 'run' || again.digest !== d.digest) return update();
    }
    lastSubmit = now();
    deps.start();
    update();
  };

  return {
    update,
    dispose: () => {
      cancel();
      stopping = false;
    },
  };
}
