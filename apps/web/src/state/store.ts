import { useSyncExternalStore } from 'react';
import type { WorkspaceInputs } from '../lib/canonical';
import { emptyHistory, type History } from '../lib/history';
import type { Timings } from '../lib/progress';
import type { Snapshot } from '../lib/snapshot';
import type { EndMark } from '../lib/signals';
import { aesDesign, aesSharedSum } from '../lib/presets';
import type {
  Capabilities,
  CandidateDesign,
  ExperimentProfile,
  JobKind,
  JobState,
  Program,
  ProgramTarget,
  Report,
  Step,
} from '../lib/types';

export type View = 'story' | 'workspace' | 'experiments';
export type Theme = 'system' | 'light' | 'dark';

/**
 * A run's state: the service's job states, plus 'submitting' (request in
 * flight), 'retrying' (the service was busy; resubmitting at `retryAt`)
 * and 'unavailable' (replay mode found no recording).
 */
export type RunState = JobState | 'submitting' | 'retrying' | 'unavailable';

/** One submitted analysis or experiment, live or replayed. */
export interface Run {
  key: string;
  kind: JobKind;
  inputs: WorkspaceInputs;
  profile?: ExperimentProfile;
  source: 'live' | 'replay';
  jobId?: string;
  state: RunState;
  steps: Step[];
  report: Report | null;
  error?: string;
  errorPath?: string;
  bundleUrl?: string;
  queuePosition?: number;
  recordingId?: string;
  /** Started by auto-check rather than a button or shortcut. */
  auto?: boolean;
  /** Client clock (ms) when the run was started and when it ended. */
  startedAt?: number;
  finishedAt?: number;
  /** Client clock (ms) when each step was first seen running. */
  stepStarts?: Record<string, number>;
  /** While 'retrying': when the next submission goes out, and how many have been refused. */
  retryAt?: number;
  attempts?: number;
}

export type ConnectionStatus = 'checking' | 'connected' | 'unreachable' | 'replay-build';

/** Per-browser settings, saved in localStorage (lib/prefs.ts). */
export interface Prefs {
  /** Check the workspace automatically shortly after edits stop. Off by default. */
  autoCheck: boolean;
  /** Desktop notification when a run finishes while the page is hidden (needs permission). */
  notify: boolean;
  /** A short, quiet tone when a run finishes. Off by default. */
  sound: boolean;
}

/** What auto-check is doing, for the switch's status text. */
export type AutoStatus =
  | { kind: 'off' }
  | { kind: 'idle'; reason: string }
  | { kind: 'scheduled'; at: number }
  | { kind: 'checking' };

/** The open overlay: the shortcuts help, the command palette or the Alerts popover. */
export type Overlay = 'help' | 'palette' | 'alerts' | null;

export interface AppState {
  view: View;
  storyStep: number;
  design: CandidateDesign;
  program: Program | null;
  target: ProgramTarget;
  /** Instruction indices the circuit editor highlights. */
  highlight: number[];
  runs: Record<string, Run>;
  /** Latest run of each kind started from the workspace or the story. */
  current: { analysis?: string; experiment?: string };
  connection: {
    status: ConnectionStatus;
    capabilities?: Capabilities;
    message?: string;
    /** When unreachable: client clock (ms) of the next automatic attempt. */
    nextAttemptAt?: number;
  };
  prefs: Prefs;
  auto: AutoStatus;
  /** The open overlay. While one is open, the window key handler leaves Escape and "?" to it. */
  overlay: Overlay;
  /** Recent durations of finished runs in this browser, for the progress estimate. */
  timings: Timings;
  /** A run finished while the page was in the background; shown in the tab title until the page is back. */
  attention: EndMark | null;
  theme: Theme;
  /** Undo/redo over the workspace inputs. */
  history: History<Snapshot>;
  /** The user changed the workspace since a story step last loaded it. */
  dirty: boolean;
  /** Workspace edits a story step or a share link replaced, kept so they can be restored. */
  replaced?: { inputs: Snapshot; by: string };
  /** A message for the workspace: a loaded share link, or why one failed. */
  notice?: { kind: 'info' | 'error'; text: string };
  /** Whether the workspace is saved in this browser. */
  storage: 'idle' | 'saved' | 'unavailable';
  /** Polite announcement for screen readers; `n` makes repeats announce again. */
  announcement: { text: string; n: number };
  story: {
    runs: Record<string, string>;
    prediction: number | null;
    revealed: boolean;
    rewired: boolean;
  };
}

type Listener = () => void;

const replayBuild = import.meta.env.VITE_REPLAY === '1';

export const initialState = (): AppState => ({
  view: 'story',
  storyStep: 1,
  design: aesDesign(),
  program: aesSharedSum(),
  target: 'matrix',
  highlight: [],
  runs: {},
  current: {},
  connection: { status: replayBuild ? 'replay-build' : 'checking' },
  theme: 'system',
  prefs: { autoCheck: false, notify: false, sound: false },
  auto: { kind: 'off' },
  overlay: null,
  timings: {},
  attention: null,
  history: emptyHistory<Snapshot>(),
  dirty: false,
  storage: 'idle',
  announcement: { text: '', n: 0 },
  story: { runs: {}, prediction: null, revealed: false, rewired: false },
});

let state: AppState = initialState();
const listeners = new Set<Listener>();

export function getState(): AppState {
  return state;
}

export function setState(update: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void {
  const patch = typeof update === 'function' ? update(state) : update;
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function updateRun(key: string, patch: Partial<Run>): void {
  setState((s) => {
    const prev = s.runs[key];
    if (!prev) return {};
    return { runs: { ...s.runs, [key]: { ...prev, ...patch } } };
  });
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppState<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state),
  );
}

export function isReplayBuild(): boolean {
  return replayBuild;
}

/** Live when the local service answers; otherwise recorded runs. */
export function dataSource(s: AppState): 'live' | 'replay' {
  return s.connection.status === 'connected' ? 'live' : 'replay';
}

/** The editable inputs as one value: what undo, persistence and share links carry. */
export function snapshotOf(s: AppState): Snapshot {
  return { design: s.design, program: s.program, target: s.target };
}

export function workspaceInputs(s: AppState): WorkspaceInputs {
  return { design: s.design, program: s.program, target: s.program ? s.target : undefined };
}

/** True while a run is in its native timing step: decorative motion pauses. */
export function isTimingStep(run: Run | undefined): boolean {
  if (!run || (run.state !== 'running' && run.state !== 'queued')) return false;
  return run.steps.some((st) => st.state === 'running' && /tim|bench|measur/i.test(st.name));
}
