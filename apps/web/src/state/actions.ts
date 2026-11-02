import { ApiError, bundleUrl, createJob, getCapabilities, getJob, isTerminal, stopJob } from '../data/api';
import { findRecording, recordedUrl } from '../data/replay';
import { normalizeAnalysisRequest, normalizeExperimentRequest, type WorkspaceInputs } from '../lib/canonical';
import { validateProgram } from '../lib/circuit';
import { debounce } from '../lib/debounce';
import { validateDesign } from '../lib/design';
import { record, redo as redoHistory, undo as undoHistory } from '../lib/history';
import type { Preset } from '../lib/library';
import { readSavedWorkspace, writeSavedWorkspace, type SavedWorkspace } from '../lib/persist';
import { decodeShare, encodeShare, shareUrl, ShareError } from '../lib/share';
import { sameSnapshot, type Snapshot } from '../lib/snapshot';
import type { CandidateDesign, ExperimentProfile, JobKind, Program, ProgramTarget } from '../lib/types';
import {
  dataSource,
  getState,
  isReplayBuild,
  setState,
  snapshotOf,
  subscribe,
  updateRun,
  workspaceInputs,
  type AppState,
  type Run,
  type View,
} from './store';

let counter = 0;
const pollers = new Map<string, number>();
const POLL_MS = 800;

export function setView(view: View): void {
  setState({ view });
  if (typeof window !== 'undefined' && !window.location.hash.startsWith(`#/${view}`)) {
    window.location.hash = view === 'story' ? `#/story/${getState().storyStep}` : `#/${view}`;
  }
}

/**
 * Who changed the workspace: the user (editors, presets, imports), a share
 * link, or a story step. Story changes never count as user edits. When a
 * story step or a share link replaces user edits, those edits are kept in
 * `replaced` (and saved with the workspace) so they can be restored.
 */
export type Origin = 'user' | 'story' | 'shared';

/** `replaced.by` for edits a share link replaced. */
export const SHARED_LINK = 'A shared link';

export interface EditOptions {
  origin?: Origin;
  /** Edits in the same group within a short burst form one undo step; null always starts a new step. */
  group?: string | null;
  /** Names the story step in the "replaced" notice. */
  label?: string;
}

function commit(next: Snapshot, { origin = 'user', group = null, label }: EditOptions = {}): void {
  const s = getState();
  const before = snapshotOf(s);
  if (sameSnapshot(before, next)) return;
  const patch: Partial<AppState> = {
    design: next.design,
    program: next.program,
    target: next.target,
    history: record(s.history, before, Date.now(), group),
  };
  if (origin === 'story') {
    if (s.dirty) patch.replaced = { inputs: before, by: label ?? 'A story step' };
    patch.dirty = false;
  } else if (origin === 'shared') {
    // The shared inputs become the user's workspace; earlier edits stay restorable.
    if (s.dirty) patch.replaced = { inputs: before, by: label ?? SHARED_LINK };
    patch.dirty = true;
  } else {
    patch.dirty = true;
  }
  setState(patch);
}

/**
 * Replaces the design. `group` names what is being edited (for example one
 * matrix cell) so a burst of keystrokes there is one undo step; pass null
 * for a discrete change such as a paste.
 */
export function setDesign(design: CandidateDesign, options: { origin?: Origin; group?: string | null } = {}): void {
  const group = options.group === undefined ? 'design' : options.group;
  commit({ ...snapshotOf(getState()), design }, { origin: options.origin, group });
}

export function setProgram(program: Program | null, origin: Origin = 'user'): void {
  commit({ ...snapshotOf(getState()), program }, { origin, group: program ? 'program' : null });
}

export function setTarget(target: ProgramTarget, origin: Origin = 'user'): void {
  commit({ ...snapshotOf(getState()), target }, { origin });
}

export function setHighlight(highlight: number[]): void {
  setState({ highlight });
}

/** Loads structured inputs into the workspace (story steps, presets, imports, share links). Always one undo step. */
export function loadInputs(
  inputs: { design: CandidateDesign; program: Program | null; target?: ProgramTarget },
  options: Omit<EditOptions, 'group'> = {},
): void {
  commit(
    {
      design: inputs.design,
      program: inputs.program,
      target: inputs.target ?? (inputs.design.field === 'gf256' ? 'matrix' : 'external'),
    },
    { ...options, group: null },
  );
}

export function announce(text: string): void {
  setState((s) => ({ announcement: { text, n: s.announcement.n + 1 } }));
}

export function applyPreset(preset: Preset): void {
  loadInputs(preset.apply(snapshotOf(getState())));
  announce(`Loaded ${preset.label}. Undo restores the previous inputs.`);
}

export function undo(): boolean {
  const s = getState();
  const r = undoHistory(s.history, snapshotOf(s));
  if (!r) return false;
  setState({ ...r.value, history: r.history, dirty: true });
  announce('Undone.');
  return true;
}

export function redo(): boolean {
  const s = getState();
  const r = redoHistory(s.history, snapshotOf(s));
  if (!r) return false;
  setState({ ...r.value, history: r.history, dirty: true });
  announce('Redone.');
  return true;
}

/** Brings back the edits a story step replaced. */
export function restoreReplaced(): void {
  const r = getState().replaced;
  if (!r) return;
  loadInputs(r.inputs);
  setState({ replaced: undefined });
  announce('Your earlier workspace is back.');
}

export function dismissReplaced(): void {
  setState({ replaced: undefined });
}

export function clearNotice(): void {
  setState({ notice: undefined });
}

/* ---------------- persistence ---------------- */

function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function savedOf(s: AppState): SavedWorkspace {
  return { inputs: snapshotOf(s), dirty: s.dirty, ...(s.replaced ? { replaced: s.replaced } : {}) };
}

/** Restores the workspace saved in this browser, if any. */
export function restoreWorkspace(storage: Pick<Storage, 'getItem'> | null = browserStorage()): boolean {
  const saved = readSavedWorkspace(storage);
  if (!saved) return false;
  setState({ ...saved.inputs, dirty: saved.dirty, replaced: saved.replaced });
  return true;
}

/** Saves the workspace 300 ms after each change, and when the page is hidden. Returns a stop function. */
export function startPersistence(storage: Pick<Storage, 'getItem' | 'setItem'> | null = browserStorage()): () => void {
  const save = debounce((w: SavedWorkspace) => {
    const ok = writeSavedWorkspace(storage, w);
    const status = ok ? 'saved' : 'unavailable';
    if (getState().storage !== status) setState({ storage: status });
  }, 300);
  let last = getState();
  const unsubscribe = subscribe(() => {
    const s = getState();
    if (
      s.design === last.design &&
      s.program === last.program &&
      s.target === last.target &&
      s.dirty === last.dirty &&
      s.replaced === last.replaced
    ) {
      return;
    }
    last = s;
    save.call(savedOf(s));
  });
  const flush = () => save.flush();
  if (typeof window !== 'undefined') window.addEventListener('pagehide', flush);
  return () => {
    unsubscribe();
    save.flush();
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', flush);
  };
}

/* ---------------- share links ---------------- */

/** A link that opens the workspace with the current design and circuit. */
export async function makeShareLink(): Promise<string> {
  const token = await encodeShare(snapshotOf(getState()));
  return shareUrl(window.location.href.split('#')[0]!, token);
}

/** Loads the inputs a share link carries; on failure the workspace is left alone and a notice says why. */
export async function openShareLink(token: string): Promise<void> {
  try {
    const inputs = await decodeShare(token);
    const before = getState();
    loadInputs(inputs, { origin: 'shared' });
    const after = getState();
    if (after.history === before.history) {
      setState({ notice: undefined });
      announce('The shared link holds the inputs already in your workspace.');
      return;
    }
    // With edits kept, the "Restore my edits" banner says what happened; otherwise a notice offers Undo.
    setState({
      notice:
        after.replaced && after.replaced !== before.replaced
          ? undefined
          : { kind: 'info', text: 'Loaded the design and circuit from a shared link. Undo returns to your previous workspace.' },
    });
  } catch (e) {
    const why = e instanceof ShareError ? e.message : 'The link could not be read.';
    setState({ notice: { kind: 'error', text: `This share link could not be opened. ${why} Your workspace is unchanged.` } });
  }
}

export function inputProblems(inputs: WorkspaceInputs): string[] {
  const problems = validateDesign(inputs.design).map((i) => i.message);
  if (inputs.program) {
    if (inputs.program.field !== inputs.design.field) {
      problems.push('The circuit and the design use different fields.');
    }
    problems.push(...validateProgram(inputs.program, inputs.design.width).map((i) => i.message));
  }
  return problems;
}

/**
 * Starts an analysis or experiment on the current workspace inputs. Live
 * mode submits to the local service and polls; replay mode looks for a
 * recorded run with the same inputs. Returns the run key.
 */
export function startRun(kind: JobKind, profile: ExperimentProfile = 'quick'): string | null {
  const s = getState();
  const inputs = workspaceInputs(s);
  if (inputProblems(inputs).length) return null;
  const key = `run-${++counter}`;
  const source = dataSource(s);
  const run: Run = {
    key,
    kind,
    inputs,
    profile: kind === 'experiment' ? profile : undefined,
    source,
    state: 'submitting',
    steps: [],
    report: null,
  };
  setState((st) => ({ runs: { ...st.runs, [key]: run }, current: { ...st.current, [kind]: key } }));
  if (source === 'live') void runLive(run);
  else void runReplay(run);
  return key;
}

async function runLive(run: Run): Promise<void> {
  try {
    const body =
      run.kind === 'analysis'
        ? normalizeAnalysisRequest({
            design: run.inputs.design,
            program: run.inputs.program ?? undefined,
            target: run.inputs.target,
          })
        : normalizeExperimentRequest({
            design: run.inputs.design,
            program: run.inputs.program ?? undefined,
            profile: run.profile ?? 'quick',
          });
    const job = await createJob(run.kind, body);
    updateRun(run.key, { jobId: job.id, state: job.state ?? 'queued', bundleUrl: bundleUrl(job.id) });
    poll(run.key, job.id);
  } catch (err) {
    const e = err instanceof ApiError ? err : null;
    updateRun(run.key, {
      state: 'failed',
      error: e ? e.message : 'The local service could not be reached.',
      errorPath: e?.path,
    });
    if (!e) void checkConnection();
  }
}

function poll(key: string, jobId: string): void {
  const tick = async () => {
    pollers.delete(key);
    const current = getState().runs[key];
    if (!current || isTerminal(current.state)) return;
    try {
      const job = await getJob(jobId);
      updateRun(key, {
        state: job.state,
        steps: job.steps,
        report: job.report ?? current.report,
        queuePosition: job.queuePosition,
        error: job.error?.message,
        errorPath: job.error?.path,
        bundleUrl: job.bundle ? bundleUrl(jobId) : current.bundleUrl,
      });
      if (!isTerminal(job.state)) pollers.set(key, window.setTimeout(tick, POLL_MS));
    } catch {
      // Keep polling through transient failures; the connection check reports outages.
      pollers.set(key, window.setTimeout(tick, POLL_MS * 3));
    }
  };
  pollers.set(key, window.setTimeout(tick, 250));
}

async function runReplay(run: Run): Promise<void> {
  const match = await findRecording(run.kind, run.inputs);
  if (!match) {
    updateRun(run.key, { state: 'unavailable' });
    return;
  }
  const report = match.report;
  updateRun(run.key, {
    state:
      report.execution?.state === 'running' || report.execution?.state === 'queued'
        ? 'completed'
        : (report.execution?.state ?? 'completed'),
    steps: report.execution?.steps ?? [],
    report,
    recordingId: match.entry.id,
    bundleUrl: match.entry.bundle ? recordedUrl(match.entry.bundle) : undefined,
  });
}

export async function stopRun(key: string): Promise<void> {
  const run = getState().runs[key];
  if (!run || isTerminal(run.state)) return;
  if (run.source === 'live' && run.jobId) {
    try {
      await stopJob(run.jobId);
    } catch (err) {
      updateRun(key, { error: err instanceof Error ? err.message : 'Stop request failed.' });
    }
  } else {
    updateRun(key, { state: 'cancelled' });
  }
}

let connectionTimer: number | undefined;

/** Checks the local service; falls back to recorded runs when it does not answer. */
export async function checkConnection(): Promise<void> {
  if (isReplayBuild()) return;
  window.clearTimeout(connectionTimer);
  if (getState().connection.status !== 'connected') {
    setState((s) => ({ connection: { ...s.connection, status: 'checking' } }));
  }
  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 3000);
    const capabilities = await getCapabilities(controller.signal);
    window.clearTimeout(timeout);
    setState({ connection: { status: 'connected', capabilities } });
  } catch {
    setState({
      connection: { status: 'unreachable', message: 'The local service at 127.0.0.1:4173 did not answer.' },
    });
  }
  connectionTimer = window.setTimeout(() => void checkConnection(), 15000);
}

export function setStoryStep(step: number): void {
  setState({ storyStep: step });
}

export function setStoryRun(slot: string, key: string | null): void {
  setState((s) => {
    const runs = { ...s.story.runs };
    if (key) runs[slot] = key;
    else delete runs[slot];
    return { story: { ...s.story, runs } };
  });
}

export function updateStory(patch: Partial<ReturnType<typeof getState>['story']>): void {
  setState((s) => ({ story: { ...s.story, ...patch } }));
}
