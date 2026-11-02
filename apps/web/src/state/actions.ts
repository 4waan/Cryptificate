import { ApiError, bundleUrl, createJob, getCapabilities, getJob, isTerminal, stopJob } from '../data/api';
import { findRecording, recordedUrl } from '../data/replay';
import { createAutoChecker, type AutoView } from '../lib/autocheck';
import { inputsDigest, isStale, normalizeAnalysisRequest, normalizeExperimentRequest, type WorkspaceInputs } from '../lib/canonical';
import { validateProgram } from '../lib/circuit';
import { debounce } from '../lib/debounce';
import { validateDesign } from '../lib/design';
import { record, redo as redoHistory, undo as undoHistory } from '../lib/history';
import type { Preset } from '../lib/library';
import { readSavedWorkspace, writeSavedWorkspace, type SavedWorkspace } from '../lib/persist';
import { readPrefs, writePrefs } from '../lib/prefs';
import { BUSY_MAX_ATTEMPTS, BUSY_MAX_RETRIES, busyRetryDelayMs, queueRoom } from '../lib/retry';
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
  type Overlay,
  type Prefs,
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
  // What is on screen now is what this browser holds, so the toolbar can say it is saved.
  setState({ ...saved.inputs, dirty: saved.dirty, replaced: saved.replaced, storage: 'saved' });
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

/* ---------------- runs ---------------- */

const retryTimers = new Map<string, number>();

export interface StartOptions {
  /** Started by auto-check. */
  auto?: boolean;
}

/** Whether a run has not reached an end state yet (including a pending resubmission). */
export function runIsActive(run: Run | undefined): boolean {
  return !!run && ['submitting', 'retrying', 'queued', 'running'].includes(run.state);
}

/** Sets a run's state, stamping the end time when it ends. */
function settle(key: string, patch: Partial<Run>): void {
  const prev = getState().runs[key];
  if (!prev) return;
  const ended = patch.state !== undefined && !runIsActive({ ...prev, ...patch }) && runIsActive(prev);
  updateRun(key, ended ? { ...patch, finishedAt: Date.now(), retryAt: undefined } : patch);
}

/**
 * Starts an analysis or experiment on the current workspace inputs. Live
 * mode submits to the local service and polls; replay mode looks for a
 * recorded run with the same inputs. Returns the run key.
 */
export function startRun(kind: JobKind, profile: ExperimentProfile = 'quick', options: StartOptions = {}): string | null {
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
    startedAt: Date.now(),
    ...(options.auto ? { auto: true } : {}),
  };
  setState((st) => ({ runs: { ...st.runs, [key]: run }, current: { ...st.current, [kind]: key } }));
  if (source === 'live') void submitLive(key);
  else void runReplay(run);
  return key;
}

async function submitLive(key: string): Promise<void> {
  const run = getState().runs[key];
  if (!run) return;
  let job;
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
    job = await createJob(run.kind, body);
  } catch (err) {
    const e = err instanceof ApiError ? err : null;
    const latest = getState().runs[key];
    if (!latest || latest.state === 'cancelled') return;
    if (e?.status === 429) {
      // `attempts` counts the refusals so far; the next submission is number attempts + 1.
      const attempt = (latest.attempts ?? 0) + 1;
      if (attempt <= BUSY_MAX_RETRIES) {
        const delay = busyRetryDelayMs(attempt, e.retryAfter);
        updateRun(key, { state: 'retrying', attempts: attempt, retryAt: Date.now() + delay, error: undefined });
        retryTimers.set(key, window.setTimeout(() => resubmit(key), delay));
        return;
      }
      settle(key, {
        state: 'failed',
        attempts: attempt,
        error: `The service stayed busy for all ${BUSY_MAX_ATTEMPTS} attempts, so nothing was checked. Try again when its current job finishes.`,
      });
      return;
    }
    settle(key, {
      state: 'failed',
      error: e ? e.message : 'The local service could not be reached.',
      errorPath: e?.path,
    });
    if (!e) void checkConnection();
    return;
  }
  const latest = getState().runs[key];
  if (latest?.state === 'cancelled') {
    // Stopped while the request was in flight: stop the job it created too.
    void stopJob(job.id).catch(() => undefined);
    updateRun(key, { jobId: job.id });
    return;
  }
  updateRun(key, { jobId: job.id, state: job.state ?? 'queued', bundleUrl: bundleUrl(job.id), retryAt: undefined });
  poll(key, job.id);
}

function resubmit(key: string): void {
  retryTimers.delete(key);
  const run = getState().runs[key];
  if (!run || run.state !== 'retrying') return;
  updateRun(key, { state: 'submitting', retryAt: undefined });
  void submitLive(key);
}

/** Resubmits a run that is waiting out a busy service now, instead of at its retry time. */
export function retryNow(key: string): void {
  const t = retryTimers.get(key);
  if (t !== undefined) window.clearTimeout(t);
  resubmit(key);
}

function poll(key: string, jobId: string): void {
  const tick = async () => {
    pollers.delete(key);
    const current = getState().runs[key];
    if (!current || isTerminal(current.state)) return;
    try {
      const job = await getJob(jobId);
      const now = Date.now();
      const stepStarts = { ...(getState().runs[key]?.stepStarts ?? {}) };
      for (const st of job.steps) if (st.state === 'running' && stepStarts[st.name] === undefined) stepStarts[st.name] = now;
      settle(key, {
        state: job.state,
        steps: job.steps,
        report: job.report ?? current.report,
        queuePosition: job.queuePosition,
        error: job.error?.message,
        errorPath: job.error?.path,
        bundleUrl: job.bundle ? bundleUrl(jobId) : current.bundleUrl,
        stepStarts,
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
  if (getState().runs[run.key]?.state === 'cancelled') return;
  if (!match) {
    settle(run.key, { state: 'unavailable' });
    return;
  }
  const report = match.report;
  settle(run.key, {
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
  if (!run) return;
  if (run.state === 'retrying' || run.state === 'submitting') {
    // Nothing is running on the service yet (or the job id is not known): stop locally;
    // a job created by an in-flight request is stopped when its id arrives.
    const t = retryTimers.get(key);
    if (t !== undefined) window.clearTimeout(t);
    retryTimers.delete(key);
    settle(key, { state: 'cancelled' });
    return;
  }
  if (isTerminal(run.state)) return;
  if (run.source === 'live' && run.jobId) {
    try {
      await stopJob(run.jobId);
    } catch (err) {
      updateRun(key, { error: err instanceof Error ? err.message : 'Stop request failed.' });
    }
  } else {
    settle(key, { state: 'cancelled' });
  }
}

/**
 * Checks the inputs in the editor (the Check button, Ctrl/Cmd+Enter). An
 * unfinished check of an earlier version is stopped first; a check of
 * these exact inputs already under way is left alone.
 */
export function checkNow(): string | null {
  const s = getState();
  const prev = s.current.analysis ? s.runs[s.current.analysis] : undefined;
  if (prev && runIsActive(prev)) {
    if (!isStale(workspaceInputs(s), prev.inputs)) return null;
    void stopRun(prev.key);
  }
  return startRun('analysis');
}

/** Whether Check would start something now: valid inputs, not already being checked. */
export function canCheck(s: AppState = getState()): boolean {
  const inputs = workspaceInputs(s);
  if (inputProblems(inputs).length) return false;
  const prev = s.current.analysis ? s.runs[s.current.analysis] : undefined;
  return !(prev && runIsActive(prev) && !isStale(inputs, prev.inputs));
}

/**
 * The run Escape and the Stop command act on: the running job the current
 * view shows first (the experiment on Experiments, the check in the
 * workspace, the story's own runs in the story), else any other running job.
 */
export function activeRunKey(s: AppState = getState()): string | undefined {
  const story = Object.values(s.story.runs);
  const { analysis, experiment } = s.current;
  const keys =
    s.view === 'experiments'
      ? [experiment, analysis, ...story]
      : s.view === 'story'
        ? [...story, analysis, experiment]
        : [analysis, experiment, ...story];
  return keys.find((k) => k !== undefined && runIsActive(s.runs[k]));
}

/** The running job Escape would stop, in words: "the check" or "the experiment". */
export function runNoun(run: Pick<Run, 'kind'>): string {
  return run.kind === 'analysis' ? 'the check' : 'the experiment';
}

/* ---------------- connection ---------------- */

let connectionTimer: number | undefined;
let failures = 0;

/** Seconds between automatic connection attempts: quick at first, then every 15 s. */
export function reconnectDelayMs(failuresSoFar: number): number {
  return [3000, 5000, 10000][failuresSoFar - 1] ?? 15000;
}

/** Checks the local service; falls back to recorded runs when it does not answer. */
export async function checkConnection(): Promise<void> {
  if (isReplayBuild()) return;
  window.clearTimeout(connectionTimer);
  if (getState().connection.status !== 'connected') {
    setState((s) => ({ connection: { ...s.connection, status: 'checking', nextAttemptAt: undefined } }));
  }
  let delay = 15000;
  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 3000);
    const capabilities = await getCapabilities(controller.signal);
    window.clearTimeout(timeout);
    failures = 0;
    setState({ connection: { status: 'connected', capabilities } });
  } catch {
    failures++;
    delay = reconnectDelayMs(failures);
    setState({
      connection: {
        status: 'unreachable',
        message: 'The local service at 127.0.0.1:4173 did not answer.',
        nextAttemptAt: Date.now() + delay,
      },
    });
  }
  connectionTimer = window.setTimeout(() => void checkConnection(), delay);
}

/* ---------------- preferences ---------------- */

export function restorePrefs(storage: Pick<Storage, 'getItem'> | null = browserStorage()): void {
  setState({ prefs: readPrefs(storage) });
}

export function setPrefs(patch: Partial<Prefs>, storage: Pick<Storage, 'setItem'> | null = browserStorage()): void {
  const prefs = { ...getState().prefs, ...patch };
  setState({ prefs });
  writePrefs(storage, prefs);
}

export function setOverlay(overlay: Overlay): void {
  setState({ overlay });
}

/* ---------------- auto-check ---------------- */

let digestMemo: { inputs: WorkspaceInputs | null; digest: string | null } = { inputs: null, digest: null };
const runDigests = new WeakMap<WorkspaceInputs, string | null>();

function currentDigest(s: AppState): string | null {
  if (digestMemo.inputs && digestMemo.inputs.design === s.design && digestMemo.inputs.program === s.program && digestMemo.inputs.target === (s.program ? s.target : undefined)) {
    return digestMemo.digest;
  }
  const inputs = workspaceInputs(s);
  const digest = inputProblems(inputs).length ? null : inputsDigest(inputs);
  digestMemo = { inputs, digest };
  return digest;
}

function runDigest(run: Run): string | null {
  if (!runDigests.has(run.inputs)) runDigests.set(run.inputs, inputsDigest(run.inputs));
  return runDigests.get(run.inputs) ?? null;
}

/** The slice of state auto-check decides on. */
export function autoView(s: AppState = getState()): AutoView {
  const last = s.current.analysis ? s.runs[s.current.analysis] : undefined;
  const live = Object.values(s.runs).filter((r) => r.source === 'live' && runIsActive(r)).length;
  return {
    enabled: s.prefs.autoCheck,
    inWorkspace: s.view === 'workspace',
    connecting: s.connection.status === 'checking' && !s.connection.capabilities,
    digest: currentDigest(s),
    last: last
      ? {
          key: last.key,
          digest: runDigest(last),
          active: runIsActive(last),
          auto: last.auto === true,
          failed: ['failed', 'timeout', 'cancelled', 'invalid'].includes(last.state),
          unavailable: last.state === 'unavailable',
        }
      : undefined,
    experimentActive: Object.values(s.runs).some((r) => r.kind === 'experiment' && runIsActive(r)),
    room: dataSource(s) === 'live' ? queueRoom(s.connection.capabilities?.limits?.maxQueued, live) : Infinity,
  };
}

/** Runs auto-check against the store. Returns a stop function. */
export function startAutoCheck(): () => void {
  const driver = createAutoChecker({
    read: () => autoView(getState()),
    start: () => void startRun('analysis', 'quick', { auto: true }),
    stop: (key) => stopRun(key),
    report: (auto) => setState({ auto }),
  });
  const unsubscribe = subscribe(() => driver.update());
  driver.update();
  return () => {
    unsubscribe();
    driver.dispose();
  };
}

/* ---------------- story ---------------- */

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
