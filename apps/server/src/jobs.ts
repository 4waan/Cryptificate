/**
 * Job model: opaque random ids, one directory per job, one heavy worker and
 * a short queue. Jobs move through queued -> running -> one of the
 * execution states; partial reports are visible while a job runs.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LIMITS, TERMINAL_JOB_STATES } from '@cryptificate/schema';
import type { AnalysisRequest, ExperimentRequest, Job, JobKind, JobState, JobSummary, Origin, Report, Step } from '@cryptificate/schema';
import { ANALYSIS_BUDGET_MS, ANALYSIS_STEPS, runAnalysis } from './analysis.js';
import { JobContext } from './context.js';
import type { PipelineEnv, PipelineResult } from './context.js';
import { EXPERIMENT_STEPS, experimentBudgetMs, runExperiment } from './experiment.js';

export const JOB_ID = /^[0-9a-f]{32}$/;

export interface JobRecord {
  id: string;
  kind: JobKind;
  state: JobState;
  origin: Origin;
  steps: Step[];
  report: Report | null;
  error?: { code: string; message: string; path?: string };
  request: AnalysisRequest | ExperimentRequest;
  dir: string;
  controller: AbortController;
  ctx?: JobContext;
}

export class QueueFullError extends Error {
  constructor() {
    super('the job queue is full');
  }
}

export type Pipeline = (env: PipelineEnv, ctx: JobContext, request: never) => Promise<PipelineResult>;

export interface JobManagerOptions {
  env: PipelineEnv;
  maxQueued?: number;
  /** Replace the pipelines (tests). */
  pipelines?: Partial<Record<JobKind, (env: PipelineEnv, ctx: JobContext, request: unknown) => Promise<PipelineResult>>>;
  budgets?: Partial<Record<JobKind, number>>;
}

function isTerminal(state: JobState): boolean {
  return TERMINAL_JOB_STATES.includes(state);
}

export class JobManager {
  private readonly jobs = new Map<string, JobRecord>();
  private readonly queue: JobRecord[] = [];
  private running: JobRecord | null = null;
  private readonly maxQueued: number;
  private idleWaiters: Array<() => void> = [];

  constructor(private readonly opts: JobManagerOptions) {
    this.maxQueued = opts.maxQueued ?? LIMITS.maxQueued;
    mkdirSync(opts.env.paths.jobsDir, { recursive: true });
  }

  /** Load finished jobs from earlier runs of the service. */
  loadExisting(limit = 200): number {
    const dir = this.opts.env.paths.jobsDir;
    let names: string[];
    try {
      names = readdirSync(dir).filter((n) => JOB_ID.test(n));
    } catch {
      return 0;
    }
    const withTime = names
      .map((n) => {
        try {
          return { n, t: statSync(join(dir, n, 'job.json')).mtimeMs };
        } catch {
          return null;
        }
      })
      .filter((x): x is { n: string; t: number } => x !== null)
      .sort((a, b) => b.t - a.t)
      .slice(0, limit);
    let loaded = 0;
    for (const { n } of withTime) {
      try {
        const saved = JSON.parse(readFileSync(join(dir, n, 'job.json'), 'utf8')) as Job & { request?: unknown };
        const request = JSON.parse(readFileSync(join(dir, n, 'request.json'), 'utf8')) as AnalysisRequest | ExperimentRequest;
        const rec: JobRecord = {
          id: n,
          kind: saved.kind,
          state: saved.state,
          origin: saved.origin,
          steps: saved.steps ?? [],
          report: saved.report ?? null,
          request,
          dir: join(dir, n),
          controller: new AbortController(),
        };
        if (saved.error) rec.error = saved.error;
        if (!isTerminal(rec.state)) {
          rec.state = 'failed';
          rec.error = { code: 'interrupted', message: 'the service stopped while this job was running' };
          this.persist(rec);
        }
        this.jobs.set(n, rec);
        loaded++;
      } catch {
        // skip unreadable job directories
      }
    }
    return loaded;
  }

  get(id: string): JobRecord | undefined {
    return JOB_ID.test(id) ? this.jobs.get(id) : undefined;
  }

  queuedCount(): number {
    return this.queue.length;
  }

  submit(kind: JobKind, request: AnalysisRequest | ExperimentRequest): JobRecord {
    if (this.queue.length >= this.maxQueued && this.running !== null) throw new QueueFullError();
    if (this.queue.length >= this.maxQueued + 1) throw new QueueFullError();
    let id: string;
    do id = randomBytes(16).toString('hex');
    while (this.jobs.has(id) || existsSync(join(this.opts.env.paths.jobsDir, id)));
    const dir = join(this.opts.env.paths.jobsDir, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'request.json'), `${JSON.stringify(request, null, 2)}\n`);
    const steps = (kind === 'analysis' ? ANALYSIS_STEPS : EXPERIMENT_STEPS).map((name) => ({ name, state: 'pending' as const }));
    const rec: JobRecord = { id, kind, state: 'queued', origin: 'live', steps, report: null, request, dir, controller: new AbortController() };
    this.jobs.set(id, rec);
    this.queue.push(rec);
    this.persist(rec);
    queueMicrotask(() => this.pump());
    return rec;
  }

  stop(id: string): JobRecord | undefined {
    const rec = this.get(id);
    if (!rec) return undefined;
    if (rec.state === 'queued') {
      const i = this.queue.indexOf(rec);
      if (i >= 0) this.queue.splice(i, 1);
      rec.state = 'cancelled';
      rec.steps = rec.steps.map((s) => ({ ...s, state: 'not_run' }));
      this.persist(rec);
    } else if (rec.state === 'running') {
      rec.controller.abort();
    }
    return rec;
  }

  /** Stop everything (service shutdown). */
  stopAll(): void {
    for (const rec of [...this.queue]) this.stop(rec.id);
    if (this.running) this.running.controller.abort();
  }

  /** Resolves when no job is running or queued. */
  idle(): Promise<void> {
    if (!this.running && this.queue.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  summary(rec: JobRecord): JobSummary {
    return { id: rec.id, kind: rec.kind, state: rec.state, origin: rec.origin };
  }

  view(rec: JobRecord): Job {
    const steps = rec.ctx ? rec.ctx.steps.map((s) => ({ ...s })) : rec.steps;
    const job: Job = {
      ...this.summary(rec),
      steps,
      report: rec.ctx?.report ?? rec.report,
      bundle: isTerminal(rec.state) && rec.state !== 'invalid' && (rec.ctx?.report ?? rec.report) !== null,
    };
    if (rec.state === 'queued') job.queuePosition = this.queue.indexOf(rec) + 1;
    if (rec.error) job.error = rec.error;
    return job;
  }

  private persist(rec: JobRecord): void {
    const p = join(rec.dir, 'job.json');
    const tmp = `${p}.tmp`;
    try {
      writeFileSync(tmp, `${JSON.stringify(this.view(rec), null, 2)}\n`);
      renameSync(tmp, p);
    } catch {
      // the job directory may have been removed
    }
  }

  private pump(): void {
    if (this.running) return;
    const next = this.queue.shift();
    if (!next) {
      const waiters = this.idleWaiters;
      this.idleWaiters = [];
      waiters.forEach((w) => w());
      return;
    }
    this.running = next;
    void this.execute(next).finally(() => {
      this.running = null;
      this.pump();
    });
  }

  private async execute(rec: JobRecord): Promise<void> {
    const budget =
      this.opts.budgets?.[rec.kind] ??
      (rec.kind === 'analysis' ? this.opts.env.analysisBudgetMs ?? ANALYSIS_BUDGET_MS : experimentBudgetMs((rec.request as ExperimentRequest).profile));
    let lastPersist = 0;
    const ctx = new JobContext(rec.id, rec.dir, rec.controller.signal, budget, rec.steps.map((s) => s.name), () => {
      rec.origin = ctx.origin;
      const now = performance.now();
      if (now - lastPersist > 250) {
        lastPersist = now;
        this.persist(rec);
      }
    });
    rec.ctx = ctx;
    rec.state = 'running';
    this.persist(rec);
    let result: PipelineResult;
    try {
      const custom = this.opts.pipelines?.[rec.kind];
      if (custom) result = await custom(this.opts.env, ctx, rec.request);
      else if (rec.kind === 'analysis') result = await runAnalysis(this.opts.env, ctx, rec.request as AnalysisRequest);
      else result = await runExperiment(this.opts.env, ctx, rec.request as ExperimentRequest);
    } catch (e) {
      ctx.closeRemaining('not_run');
      result = { state: 'failed', report: ctx.report, error: { code: 'internal', message: (e as Error).message.slice(0, 300) } };
    }
    if (rec.controller.signal.aborted && result.state !== 'invalid') result.state = 'cancelled';
    rec.state = result.state;
    rec.report = result.report ?? ctx.report;
    rec.origin = ctx.origin;
    rec.steps = ctx.steps.map((s) => ({ ...s }));
    if (result.error) rec.error = result.error;
    rec.ctx = undefined;
    this.persist(rec);
  }
}
