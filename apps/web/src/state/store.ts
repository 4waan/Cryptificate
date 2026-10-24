import { useSyncExternalStore } from 'react';
import type { WorkspaceInputs } from '../lib/canonical';
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

export type RunState = JobState | 'submitting' | 'unavailable';

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
}

export type ConnectionStatus = 'checking' | 'connected' | 'unreachable' | 'replay-build';

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
  connection: { status: ConnectionStatus; capabilities?: Capabilities; message?: string };
  theme: Theme;
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

export function workspaceInputs(s: AppState): WorkspaceInputs {
  return { design: s.design, program: s.program, target: s.program ? s.target : undefined };
}

/** True while a run is in its native timing step: decorative motion pauses. */
export function isTimingStep(run: Run | undefined): boolean {
  if (!run || (run.state !== 'running' && run.state !== 'queued')) return false;
  return run.steps.some((st) => st.state === 'running' && /tim|bench|measur/i.test(st.name));
}
