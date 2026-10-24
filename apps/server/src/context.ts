/**
 * What a pipeline (analysis or experiment) sees of the job running it.
 * The same pipelines run inside the HTTP service and directly from the CLI.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Origin, Report, Step, StepState } from '@cryptificate/schema';
import type { Engine } from './engine.js';
import type { Paths } from './paths.js';
import type { ToolchainInfo } from './toolchain.js';

export interface PipelineEnv {
  paths: Paths;
  engine: Engine;
  /** `lake` launcher, or null when Lean is not installed. */
  lake: string | null;
  toolchain: () => Promise<ToolchainInfo>;
  /** Disable the proof cache (verification always re-checks). */
  noCache?: boolean;
  /** Skip native correctness (verification without --native). */
  skipNative?: boolean;
  replacements: Array<[string, string]>;
  /** Overrides for tests: Lean wall-clock limit and analysis budget. */
  leanTimeoutMs?: number;
  analysisBudgetMs?: number;
}

export interface PipelineResult {
  state: 'completed' | 'failed' | 'timeout' | 'cancelled' | 'invalid';
  report: Report | null;
  error?: { code: string; message: string; path?: string };
}

export class JobContext {
  readonly steps: Step[];
  private readonly startedAt = new Map<string, number>();
  private readonly deadline: number;
  origin: Origin = 'live';
  report: Report | null = null;

  constructor(
    readonly id: string,
    readonly dir: string,
    readonly signal: AbortSignal,
    budgetMs: number,
    stepNames: readonly string[],
    private readonly onChange: () => void = () => {},
  ) {
    this.deadline = performance.now() + budgetMs;
    this.steps = stepNames.map((name) => ({ name, state: 'pending' as StepState }));
    mkdirSync(dir, { recursive: true });
  }

  remainingMs(): number {
    return Math.max(0, Math.floor(this.deadline - performance.now()));
  }

  get cancelled(): boolean {
    return this.signal.aborted;
  }

  private find(name: string): Step {
    let s = this.steps.find((x) => x.name === name);
    if (!s) {
      s = { name, state: 'pending' };
      this.steps.push(s);
    }
    return s;
  }

  start(name: string, detail?: string): void {
    const s = this.find(name);
    s.state = 'running';
    if (detail !== undefined) s.detail = detail;
    else delete s.detail;
    delete s.ms;
    this.startedAt.set(name, performance.now());
    this.onChange();
  }

  finish(name: string, state: StepState, detail?: string): void {
    const s = this.find(name);
    s.state = state;
    const t0 = this.startedAt.get(name);
    if (t0 !== undefined) s.ms = Math.round(performance.now() - t0);
    if (detail !== undefined) s.detail = detail;
    this.onChange();
  }

  /** Mark every step that has not started as not run (or skipped). */
  closeRemaining(state: 'not_run' | 'skipped' | 'cancelled', detail?: string): void {
    for (const s of this.steps) {
      if (s.state === 'pending') {
        s.state = state;
        if (detail !== undefined) s.detail = detail;
      } else if (s.state === 'running') {
        s.state = state === 'cancelled' ? 'cancelled' : 'not_run';
        const t0 = this.startedAt.get(s.name);
        if (t0 !== undefined) s.ms = Math.round(performance.now() - t0);
        if (detail !== undefined) s.detail = detail;
      }
    }
    this.onChange();
  }

  setReport(report: Report): void {
    this.report = report;
    this.onChange();
  }

  setOrigin(origin: Origin): void {
    this.origin = origin;
    this.onChange();
  }

  /** Write a file below the job directory. */
  write(rel: string, data: string | Buffer): string {
    const p = join(this.dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, data);
    return p;
  }

  writeJson(rel: string, value: unknown): string {
    return this.write(rel, `${JSON.stringify(value, null, 2)}\n`);
  }

  /** Steps as recorded in reports (pending steps omitted). */
  executionSteps(): Step[] {
    return this.steps.filter((s) => s.state !== 'pending').map((s) => ({ ...s }));
  }
}
