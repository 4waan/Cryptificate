import type {
  AnalysisRequest,
  Capabilities,
  ExperimentRequest,
  Job,
  JobKind,
  JobSummary,
  Report,
  Step,
} from '../lib/types';

/** Client for the local Cryptificate service (same origin, /api/...). */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly path?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const API = '/api';

async function readError(res: Response): Promise<ApiError> {
  let code = `http_${res.status}`;
  let message = res.statusText || `Request failed with status ${res.status}`;
  let path: string | undefined;
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string; path?: string } };
    if (body.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
      path = body.error.path;
    }
  } catch {
    // Body was not JSON; keep the status text.
  }
  if (res.status === 429) message = 'The service is busy: two jobs are already waiting. Try again when one finishes.';
  return new ApiError(message, res.status, code, path);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (!res.ok) throw await readError(res);
  return (await res.json()) as T;
}

export async function getCapabilities(signal?: AbortSignal): Promise<Capabilities> {
  const caps = await request<Capabilities>('/capabilities', { signal });
  if (!caps || typeof caps !== 'object' || typeof caps.version !== 'string') {
    throw new ApiError('Unexpected capabilities response', 200, 'bad_response');
  }
  return caps;
}

export async function createJob(kind: JobKind, body: AnalysisRequest | ExperimentRequest): Promise<JobSummary> {
  const path = kind === 'analysis' ? '/analyses' : '/experiments';
  const res = await request<{ job?: JobSummary } & Partial<JobSummary>>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const job = res.job ?? (res as JobSummary);
  if (!job || typeof job.id !== 'string')
    throw new ApiError('The service did not return a job id', 200, 'bad_response');
  return job;
}

/** Reads a job. Tolerates the report and steps being nested or at the top level. */
export async function getJob(id: string): Promise<Job> {
  const raw = await request<Record<string, unknown>>(`/jobs/${encodeURIComponent(id)}`);
  return parseJob(raw);
}

export function parseJob(raw: Record<string, unknown>): Job {
  const inner = (raw.job && typeof raw.job === 'object' ? raw.job : raw) as Record<string, unknown>;
  const report = (inner.report ?? raw.report ?? null) as Report | null;
  const steps = (inner.steps ?? raw.steps ?? report?.execution?.steps ?? []) as Step[];
  return {
    id: String(inner.id ?? ''),
    kind: (inner.kind ?? report?.kind ?? 'analysis') as JobKind,
    state: (inner.state ?? 'running') as Job['state'],
    origin: (inner.origin ?? report?.provenance?.origin ?? 'live') as Job['origin'],
    steps: Array.isArray(steps) ? steps : [],
    report,
    queuePosition: typeof inner.queuePosition === 'number' ? inner.queuePosition : undefined,
    error: inner.error as Job['error'],
    bundle: inner.bundle === true,
  };
}

export async function stopJob(id: string): Promise<void> {
  await request<unknown>(`/jobs/${encodeURIComponent(id)}/stop`, { method: 'POST' });
}

export function bundleUrl(id: string): string {
  return `${API}/jobs/${encodeURIComponent(id)}/bundle`;
}

export function isTerminal(state: string): boolean {
  return state !== 'queued' && state !== 'running';
}
