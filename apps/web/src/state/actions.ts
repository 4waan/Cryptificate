import { ApiError, bundleUrl, createJob, getCapabilities, getJob, isTerminal, stopJob } from '../data/api';
import { findRecording, recordedUrl } from '../data/replay';
import { normalizeAnalysisRequest, normalizeExperimentRequest, type WorkspaceInputs } from '../lib/canonical';
import { validateProgram } from '../lib/circuit';
import { validateDesign } from '../lib/design';
import type { CandidateDesign, ExperimentProfile, JobKind, Program, ProgramTarget } from '../lib/types';
import { dataSource, getState, isReplayBuild, setState, updateRun, workspaceInputs, type Run, type View } from './store';

let counter = 0;
const pollers = new Map<string, number>();
const POLL_MS = 800;

export function setView(view: View): void {
  setState({ view });
}

export function setDesign(design: CandidateDesign): void {
  setState({ design });
}

export function setProgram(program: Program | null): void {
  setState({ program });
}

export function setTarget(target: ProgramTarget): void {
  setState({ target });
}

export function setHighlight(highlight: number[]): void {
  setState({ highlight });
}

/** Loads structured inputs into the workspace (used by story steps and imports). */
export function loadInputs(inputs: { design: CandidateDesign; program: Program | null; target?: ProgramTarget }): void {
  setState({
    design: inputs.design,
    program: inputs.program,
    target: inputs.target ?? (inputs.design.field === 'gf256' ? 'matrix' : 'external'),
  });
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
    state: report.execution?.state === 'running' || report.execution?.state === 'queued' ? 'completed' : (report.execution?.state ?? 'completed'),
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
