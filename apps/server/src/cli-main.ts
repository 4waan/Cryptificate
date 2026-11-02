/**
 * The `cryptificate` command: init | check | serve | experiment | verify | report.
 * The executable is cli.ts; this module holds the commands so tests can call
 * main() with their own pipeline environment and output streams.
 */
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { validateAnalysisRequest, validateExperimentRequest } from '@cryptificate/schema';
import type { AnalysisReport, AnalysisRequest, ExecutionState, ExperimentReport, ExperimentRequest, ProgramTarget, Report } from '@cryptificate/schema';
import { buildBundle } from './bundle.js';
import { ANALYSIS_BUDGET_MS, ANALYSIS_STEPS, runAnalysis } from './analysis.js';
import { JobContext } from './context.js';
import type { PipelineEnv } from './context.js';
import { EXPERIMENT_STEPS, experimentBudgetMs, runExperiment } from './experiment.js';
import { formatExperiment, makeStyle, stepLine } from './format.js';
import type { Style } from './format.js';
import { NoMatchError, expandInputs } from './glob.js';
import { JobManager } from './jobs.js';
import { makeEnv } from './env.js';
import { resolvePaths } from './paths.js';
import { EXIT_ERROR, FAIL_ON, UsageError, parseClaimList, parseFailOn } from './policy.js';
import type { FailOn } from './policy.js';
import { DEFAULT_ACTION, planInit, posixRelative, writePlan } from './init.js';
import type { CiChoice } from './init.js';
import { DEFAULT_PRESET, MODEL_IDS, PRESETS, findPreset } from './presets.js';
import type { ModelChoice, Preset } from './presets.js';
import { choose, confirm, makeAsker } from './prompt.js';
import { killAll } from './proc.js';
import { CONFIG_FILE, findConfig, loadConfig } from './project.js';
import type { LoadedConfig } from './project.js';
import { runLean } from './leanrun.js';
import {
  checkToJUnit,
  checkToMarkdown,
  checkToSarif,
  checkToText,
  evaluateCheckEntry,
  evaluateVerifyEntry,
  makeCheckRun,
  makeVerifyRun,
  toJson,
  toSarifText,
  verifyToJUnit,
  verifyToMarkdown,
  verifyToSarif,
  verifyToText,
} from './report-formats.js';
import type { CheckEntry, CheckInput, CheckRun, GateRun, VerifyEntry, VerifyRun } from './report-formats.js';
import { createApp } from './server.js';
import { readTarGz } from './tar.js';
import { readToolchain } from './toolchain.js';
import { verifyBundle } from './verify.js';
import type { VerifyResult } from './verify.js';

const USAGE = `Usage: cryptificate <command> [options]

Commands:
  init [dir] [--model aes-like|hades] [--preset NAME] [--circuit|--no-circuit]
        [--fail-on POLICY] [--ci github|none] [--action OWNER/REPO@REF] [--yes] [--force]
        Scaffold cryptificate.json, a starting design under cryptificate/ and a GitHub
        workflow. Asks on a terminal unless --yes; never overwrites a file without --force.
        Presets: ${PRESETS.map((p) => `${p.id} (${p.model})`).join(', ')}.
  check [<design.json|glob>...] [--config cryptificate.json] [--program p.json]
        [--target matrix|external|internal] [--json out.json] [--bundle out.tar.gz]
        [--bundle-dir DIR] [--no-cache] [GATE OPTIONS]
        Check designs (and optionally a circuit) and print the claims. Without inputs, the
        inputs and options come from the nearest cryptificate.json (this directory or a
        parent); options on the command line override it.
  serve [--port 4173] [--host 127.0.0.1] [--allow-origin URL]
        Run the local service and web UI.
  experiment <design.json> [--program p.json] [--profile quick|research] [--seed HEX] [--json out.json]
        [--bundle out.tar.gz]
        Search, check and measure circuits for the design's matrix.
  verify <bundle.tar.gz|glob>... [--native] [--keep] [--json out.json] [GATE OPTIONS]
        Re-derive bundles' claims with the installed engine and Lean checker.
  report <result.json|report.json|bundle.tar.gz|glob>... [GATE OPTIONS]
        Render saved results (check or verify --format json output, a report.json or a
        bundle) in another format, without running anything.

Gate options (check, verify, report):
  --format text|json|sarif|junit|markdown   output format (default text)
  --output FILE         write the formatted result to FILE; the text result goes to stdout
  --fail-on none|refuted|not-established|any
                        claim statuses that fail the run (default none; report keeps the
                        policy recorded in a check or verify result)
  --claims ID[,ID...]   restrict the policy to these claim ids (an unknown id is an error)
  --no-step-summary     do not append Markdown to $GITHUB_STEP_SUMMARY

<design.json> may hold a CandidateDesign or a full request object. Patterns are expanded by
cryptificate (*, ?, [..], **); --program, --json and --bundle need a single input.
Exit status (check, verify, report): 0 passed; 1 the policy failed (an in-scope claim has a
rejected status, or verify re-checked a claim that differs from the bundle); 2 usage error,
unreadable or invalid input, a run or re-run that failed, timed out or was stopped, a verify
that could re-check nothing or whose mismatch came from a missing tool, or, under a policy,
an in-scope claim left unchecked because the engine, Lean or the native toolchain was
unavailable, a --claims id an input does not carry, or (verify) an in-scope claim verify
does not re-check. experiment: 0 completed, 1 failed, timed out or stopped, 2 invalid.
init: 0 written, 1 declined at the prompt, 2 usage error or a file exists (nothing written).
Environment: CRYPTIFICATE_HOME (state directory), CRYPTIFICATE_ENGINE, CRYPTIFICATE_LAKE,
GITHUB_STEP_SUMMARY.
`;

export interface Output {
  write(s: string): unknown;
  isTTY?: boolean;
}

export interface Input extends NodeJS.ReadableStream {
  isTTY?: boolean;
}

export interface CliDeps {
  /** Pipeline environment factory (default: this checkout). */
  env?: () => PipelineEnv;
  stdout?: Output;
  stderr?: Output;
  /** Where init reads its answers (default process.stdin). */
  stdin?: () => Input;
  /** Environment variables consulted (GITHUB_STEP_SUMMARY). */
  environ?: Record<string, string | undefined>;
  cwd?: string;
  /** Install SIGINT handlers (default true). */
  signals?: boolean;
}

interface Io {
  env: () => PipelineEnv;
  stdout: Output;
  stderr: Output;
  stdin: () => Input;
  environ: Record<string, string | undefined>;
  cwd: string;
  signals: boolean;
}

function fail(message: string): never {
  throw new UsageError(message);
}

class InputError extends Error {}

function readJsonFile(path: string, cwd: string): unknown {
  let text: string;
  try {
    text = readFileSync(resolve(cwd, path), 'utf8');
  } catch (e) {
    throw new InputError(`cannot read ${path}: ${(e as NodeJS.ErrnoException).code ?? (e as Error).message}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new InputError(`${path} is not valid JSON`);
  }
}

function isRequestDoc(doc: unknown): doc is Record<string, unknown> {
  return Boolean(doc && typeof doc === 'object' && !Array.isArray(doc) && 'design' in doc);
}

function buildRequest(designPath: string, programPath: string | undefined, cwd: string): { req: Record<string, unknown>; input: CheckInput } {
  const doc = readJsonFile(designPath, cwd);
  const asRequest = isRequestDoc(doc);
  const req: Record<string, unknown> = asRequest ? { ...doc } : { design: doc };
  const input: CheckInput = { file: designPath, designPointer: asRequest ? '/design' : '', programPointer: asRequest && 'program' in doc ? '/program' : null };
  if (programPath) {
    req['program'] = readJsonFile(programPath, cwd);
    input.programFile = programPath;
    input.programPointer = '';
  }
  return { req, input };
}

function progress(ctx: JobContext, quiet: boolean, stderr: Output): () => void {
  const seen = new Map<string, string>();
  return () => {
    if (quiet) return;
    for (const s of ctx.steps) {
      const key = `${s.state}`;
      if (s.state === 'pending' || seen.get(s.name) === key) continue;
      seen.set(s.name, key);
      stderr.write(`  ${stepLine(s)}\n`);
    }
  };
}

async function writeBundle(env: PipelineEnv, dir: string, report: Report, out: string, stderr: Output): Promise<void> {
  let inputs: unknown;
  try {
    inputs = JSON.parse(readFileSync(join(dir, 'inputs.json'), 'utf8')) as unknown;
  } catch {
    inputs = undefined;
  }
  const gz = buildBundle({ jobDir: dir, report, toolchain: await env.toolchain(), paths: env.paths, inputs });
  writeFileSync(out, gz);
  stderr.write(`bundle: ${out}\n`);
}

function newRunDir(env: PipelineEnv): { id: string; dir: string } {
  const id = randomBytes(16).toString('hex');
  const dir = join(env.paths.jobsDir, id);
  mkdirSync(dir, { recursive: true });
  return { id, dir };
}

function onInterrupt(controller: AbortController, io: Io): void {
  if (!io.signals) return;
  let count = 0;
  process.on('SIGINT', () => {
    count++;
    if (count > 1) {
      killAll();
      process.exit(130);
    }
    io.stderr.write('\nstopping (completed checkpoints are kept)...\n');
    controller.abort();
  });
}

// ---------------------------------------------------------------------------
// Gate options shared by check, verify and report

const FORMATS = ['text', 'json', 'sarif', 'junit', 'markdown'] as const;
type Format = (typeof FORMATS)[number];

const GATE_OPTIONS = {
  format: { type: 'string' },
  output: { type: 'string', short: 'o' },
  'fail-on': { type: 'string' },
  claims: { type: 'string', multiple: true },
  'no-step-summary': { type: 'boolean' },
} as const;

interface GateOptions {
  format: Format;
  output: string | undefined;
  failOn: FailOn | undefined;
  claims: Set<string> | null;
  stepSummary: boolean;
}

function gateOptions(values: { format?: string; output?: string; 'fail-on'?: string; claims?: string[]; 'no-step-summary'?: boolean }): GateOptions {
  const format = (values.format ?? 'text') as Format;
  if (!FORMATS.includes(format)) fail(`--format must be one of ${FORMATS.join(', ')} (got "${values.format}")`);
  return {
    format,
    output: values.output,
    failOn: values['fail-on'] === undefined ? undefined : parseFailOn(values['fail-on']),
    claims: parseClaimList(values.claims),
    stepSummary: !(values['no-step-summary'] ?? false),
  };
}

function expand(patterns: string[], io: Io, what: string): string[] {
  if (patterns.length === 0) fail(`${what}\n\n${USAGE}`);
  try {
    return expandInputs(patterns, io.cwd);
  } catch (e) {
    if (e instanceof NoMatchError) fail(e.message);
    throw e;
  }
}

function textOf(run: GateRun, style: Style): string {
  return run.command === 'check' ? checkToText(run, style) : verifyToText(run, style);
}

export function render(run: GateRun, format: Format, cwd: string, style: Style): string {
  const read = (p: string): string | null => {
    try {
      return readFileSync(p, 'utf8');
    } catch {
      return null;
    }
  };
  switch (format) {
    case 'text':
      return `${textOf(run, style)}\n`;
    case 'json':
      return toJson(run);
    case 'sarif':
      return toSarifText(run.command === 'check' ? checkToSarif(run, { cwd, read }) : verifyToSarif(run, { cwd, read }));
    case 'junit':
      return run.command === 'check' ? checkToJUnit(run) : verifyToJUnit(run);
    case 'markdown':
      return run.command === 'check' ? checkToMarkdown(run) : verifyToMarkdown(run);
  }
}

const PLAIN: Style = { bold: (s) => s, dim: (s) => s, status: (_s, t = _s) => t };

/** Write the result where the options say, and the GitHub step summary when asked. */
function emit(run: GateRun, opts: GateOptions, io: Io): void {
  if (opts.output) {
    const target = resolve(io.cwd, opts.output);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, render(run, opts.format, io.cwd, PLAIN));
    io.stdout.write(render(run, 'text', io.cwd, makeStyle(io.stdout)));
    io.stderr.write(`${opts.format}: ${target}\n`);
  } else {
    io.stdout.write(render(run, opts.format, io.cwd, opts.format === 'text' ? makeStyle(io.stdout) : PLAIN));
  }
  const summary = io.environ['GITHUB_STEP_SUMMARY'];
  if (opts.stepSummary && summary) {
    try {
      appendFileSync(summary, `${render(run, 'markdown', io.cwd, PLAIN)}\n`);
    } catch (e) {
      io.stderr.write(`cryptificate: cannot write the step summary ${summary}: ${(e as Error).message}\n`);
    }
  }
}

/** A file name under --bundle-dir that no earlier input of this run took. */
function bundleName(input: string, taken: Set<string>): string {
  const stem = basename(input).replace(/\.json$/i, '') || 'bundle';
  let name = `${stem}.tar.gz`;
  for (let k = 2; taken.has(name); k++) name = `${stem}-${k}.tar.gz`;
  taken.add(name);
  return name;
}

async function cmdCheck(argv: string[], io: Io): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      program: { type: 'string' },
      target: { type: 'string' },
      json: { type: 'string' },
      bundle: { type: 'string' },
      'bundle-dir': { type: 'string' },
      'no-cache': { type: 'boolean' },
      config: { type: 'string' },
      quiet: { type: 'boolean', short: 'q' },
      ...GATE_OPTIONS,
    },
  });
  const quiet = values.quiet ?? false;
  // cryptificate.json: named with --config, or looked up when no input is given.
  let project: LoadedConfig | null = null;
  if (values.config !== undefined) project = loadConfig(resolve(io.cwd, values.config), values.config);
  else if (positionals.length === 0) {
    const found = findConfig(io.cwd);
    if (found) project = loadConfig(found, relative(io.cwd, found) || CONFIG_FILE);
  }
  if (positionals.length === 0 && !project) {
    fail(`check needs at least one design file, or a ${CONFIG_FILE} in this directory or a parent (cryptificate init writes one)\n\n${USAGE}`);
  }
  const cfg = project?.config;
  // Inputs from the command line are relative to the working directory; inputs
  // from the file, and the paths it names, to the file's directory. Paths given
  // as options always stay relative to the working directory.
  const fromConfig = positionals.length === 0 && project !== null;
  const runCwd = fromConfig ? project!.dir : io.cwd;
  const flagPath = (p: string | undefined): string | undefined => (p === undefined ? undefined : resolve(io.cwd, p));
  const cfgPath = (p: string | undefined): string | undefined => (p === undefined || !project ? undefined : resolve(project.dir, p));
  if (project && !quiet) io.stderr.write(`config: ${relative(io.cwd, project.path) || CONFIG_FILE}${fromConfig ? '' : ' (inputs from the command line)'}\n`);
  const gate = gateOptions({
    format: values.format ?? cfg?.format,
    output: flagPath(values.output) ?? cfgPath(cfg?.output),
    'fail-on': values['fail-on'] ?? cfg?.failOn,
    claims: values.claims ?? cfg?.claims,
    'no-step-summary': values['no-step-summary'],
  });
  const failOn = gate.failOn ?? 'none';
  const target = values.target ?? cfg?.target;
  const runIo: Io = { ...io, cwd: runCwd };
  const files = expand(fromConfig ? cfg!.inputs : positionals, runIo, 'check needs at least one design file');
  const program = values.program === undefined ? undefined : relative(runCwd, resolve(io.cwd, values.program));
  const jsonOut = flagPath(values.json);
  const bundleOut = flagPath(values.bundle);
  if (files.length > 1) {
    if (program) fail('--program needs a single design file; put "program" in each request file instead');
    if (jsonOut) fail('--json needs a single design file; use --format json --output FILE for several');
    if (bundleOut) fail('--bundle needs a single design file; use --bundle-dir DIR for several');
  }
  const env = io.env();
  if (values['no-cache']) env.noCache = true;
  const controller = new AbortController();
  onInterrupt(controller, io);
  const bundleDir = flagPath(values['bundle-dir']) ?? cfgPath(cfg?.bundleDir) ?? null;
  if (bundleDir) mkdirSync(bundleDir, { recursive: true });
  const taken = new Set<string>();
  const entries: CheckEntry[] = [];

  for (const file of files) {
    let input: CheckInput = { file, designPointer: '', programPointer: null };
    const error = (message: string): void => {
      io.stderr.write(`cryptificate: ${file}: ${message}\n`);
      entries.push(evaluateCheckEntry({ input, state: 'error', report: null, error: message }, failOn, gate.claims));
    };
    let req: Record<string, unknown>;
    try {
      ({ req, input } = buildRequest(file, program, runCwd));
    } catch (e) {
      if (!(e instanceof InputError)) throw e;
      error(e.message);
      continue;
    }
    if (target) req['target'] = target as ProgramTarget;
    const v = validateAnalysisRequest(req);
    if (!v.ok) {
      error(`invalid request:\n${v.errors.map((e) => `  ${e.path}: ${e.message}`).join('\n')}`);
      continue;
    }
    const { id, dir } = newRunDir(env);
    writeFileSync(join(dir, 'request.json'), `${JSON.stringify(v.value, null, 2)}\n`);
    let update: () => void = () => {};
    const ctx = new JobContext(id, dir, controller.signal, env.analysisBudgetMs ?? ANALYSIS_BUDGET_MS, ANALYSIS_STEPS, () => update());
    update = progress(ctx, quiet, io.stderr);
    if (!quiet) io.stderr.write(`analysis ${id}${files.length > 1 ? ` (${file})` : ''}\n`);
    const result = await runAnalysis(env, ctx, v.value as AnalysisRequest);
    if (result.state === 'invalid' || !result.report) {
      error(`the engine rejected the request: ${result.error?.path ? `${result.error.path}: ` : ''}${result.error?.message ?? 'unknown error'}`);
      continue;
    }
    const report = result.report as AnalysisReport;
    const entry = evaluateCheckEntry({ input, state: result.state, report, ...(result.error ? { error: result.error.message } : {}) }, failOn, gate.claims);
    entries.push(entry);
    if (jsonOut) writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`);
    if (bundleOut) await writeBundle(env, dir, report, bundleOut, io.stderr);
    if (bundleDir) await writeBundle(env, dir, report, join(bundleDir, bundleName(file, taken)), io.stderr);
    if (!quiet) io.stderr.write(`job directory: ${dir}\n`);
  }
  const run = makeCheckRun(entries, failOn, gate.claims);
  emit(run, gate, runIo);
  return run.exitCode;
}

async function cmdExperiment(argv: string[], io: Io): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      program: { type: 'string' },
      profile: { type: 'string', default: 'quick' },
      seed: { type: 'string' },
      json: { type: 'string' },
      bundle: { type: 'string' },
      quiet: { type: 'boolean', short: 'q' },
    },
  });
  if (positionals.length !== 1) fail('experiment needs exactly one design file\n\n' + USAGE);
  let req: Record<string, unknown>;
  try {
    ({ req } = buildRequest(positionals[0]!, values.program, io.cwd));
  } catch (e) {
    if (e instanceof InputError) fail(e.message);
    throw e;
  }
  delete req['target'];
  req['profile'] = values.profile;
  if (values.seed) req['seed'] = values.seed;
  const v = validateExperimentRequest(req);
  if (!v.ok) fail(`invalid request:\n${v.errors.map((e) => `  ${e.path}: ${e.message}`).join('\n')}`);
  const env = io.env();
  const { id, dir } = newRunDir(env);
  writeFileSync(join(dir, 'request.json'), `${JSON.stringify(v.value, null, 2)}\n`);
  const controller = new AbortController();
  onInterrupt(controller, io);
  let update: () => void = () => {};
  const ctx = new JobContext(id, dir, controller.signal, experimentBudgetMs(v.value.profile), EXPERIMENT_STEPS, () => update());
  update = progress(ctx, values.quiet ?? false, io.stderr);
  if (!values.quiet) io.stderr.write(`experiment ${id} (${v.value.profile})\n`);
  const result = await runExperiment(env, ctx, v.value as ExperimentRequest);
  if (result.state === 'invalid' || !result.report) {
    fail(`the engine rejected the request: ${result.error?.message ?? 'unknown error'}`);
  }
  io.stdout.write(`${formatExperiment(result.report as ExperimentReport, makeStyle(io.stdout))}\n`);
  if (values.json) writeFileSync(resolve(io.cwd, values.json), `${JSON.stringify(result.report, null, 2)}\n`);
  if (values.bundle) await writeBundle(env, dir, result.report, resolve(io.cwd, values.bundle), io.stderr);
  if (!values.quiet) io.stderr.write(`job directory: ${dir}\n`);
  return result.state === 'completed' ? 0 : 1;
}

async function cmdVerify(argv: string[], io: Io): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { native: { type: 'boolean' }, keep: { type: 'boolean' }, json: { type: 'string' }, ...GATE_OPTIONS },
  });
  const gate = gateOptions(values);
  const failOn = gate.failOn ?? 'none';
  const bundles = expand(positionals, io, 'verify needs at least one bundle');
  if (bundles.length > 1 && values.json) fail('--json needs a single bundle; use --format json --output FILE for several');
  const env = io.env();
  const entries: VerifyEntry[] = [];
  for (const bundle of bundles) {
    let result: VerifyResult;
    try {
      if (bundles.length > 1) io.stderr.write(`verifying ${bundle}\n`);
      result = await verifyBundle(env, resolve(io.cwd, bundle), {
        native: values.native ?? false,
        keep: values.keep ?? false,
        log: (l) => io.stderr.write(`${l}\n`),
      });
    } catch (e) {
      const message = `cannot verify ${bundle}: ${(e as Error).message}`;
      io.stderr.write(`cryptificate: ${message}\n`);
      entries.push(evaluateVerifyEntry({ bundle, result: null, error: message }, failOn, gate.claims));
      continue;
    }
    entries.push(evaluateVerifyEntry({ bundle, result }, failOn, gate.claims));
    if (values.json) writeFileSync(resolve(io.cwd, values.json), `${JSON.stringify(result, null, 2)}\n`);
  }
  const run = makeVerifyRun(entries, failOn, gate.claims);
  emit(run, gate, io);
  return run.exitCode;
}

/** A saved result read by `report`, before the policy is applied. */
type Loaded =
  | { kind: 'check'; entries: CheckEntry[]; failOn: FailOn; claims: string[] | null; recorded?: boolean }
  | { kind: 'verify'; entries: VerifyEntry[]; failOn: FailOn; claims: string[] | null; recorded?: boolean };

function loadSaved(file: string, cwd: string): Loaded {
  const path = resolve(cwd, file);
  let doc: unknown;
  let input: CheckInput = { file, designPointer: '/inputs/design', programPointer: null };
  const errorEntry = (message: string): Loaded => ({
    kind: 'check',
    entries: [{ input, state: 'error', error: message, report: null, outcome: 'error', violations: [], unavailable: [] }],
    failOn: 'none',
    claims: null,
  });
  try {
    if (/\.(tar\.gz|tgz)$/i.test(file)) {
      const files = readTarGz(readFileSync(path));
      const report = files.get('report.json');
      if (!report) return errorEntry(`${file} holds no report.json`);
      doc = JSON.parse(report.toString('utf8')) as unknown;
    } else {
      doc = readJsonFile(file, cwd);
    }
  } catch (e) {
    return errorEntry(e instanceof InputError ? e.message : `cannot read ${file}: ${(e as Error).message}`);
  }
  const o = (doc && typeof doc === 'object' ? doc : {}) as Record<string, unknown>;
  if (o['format'] === 'cryptificate-check/v1' && Array.isArray(o['results'])) {
    return { kind: 'check', entries: o['results'] as CheckEntry[], failOn: parseFailOn(o['failOn'] as string), claims: (o['claims'] as string[] | null) ?? null, recorded: true };
  }
  if (o['format'] === 'cryptificate-verify/v1' && Array.isArray(o['results'])) {
    return { kind: 'verify', entries: o['results'] as VerifyEntry[], failOn: parseFailOn(o['failOn'] as string), claims: (o['claims'] as string[] | null) ?? null, recorded: true };
  }
  if (o['kind'] === 'analysis' && Array.isArray(o['claims']) && o['execution'] && o['inputs']) {
    const report = doc as AnalysisReport;
    input = { file, designPointer: '/inputs/design', programPointer: report.inputs.program ? '/inputs/program' : null };
    const state = report.execution.state;
    const terminal: ExecutionState[] = ['completed', 'failed', 'timeout', 'cancelled', 'invalid'];
    return {
      kind: 'check',
      entries: [{ input, state: terminal.includes(state as ExecutionState) ? (state as ExecutionState) : 'error', report, outcome: 'pass', violations: [], unavailable: [] }],
      failOn: 'none',
      claims: null,
    };
  }
  if (o['kind'] === 'experiment') return errorEntry(`${file} is an experiment report; report renders analysis reports and check or verify results`);
  return errorEntry(`${file} is not a check or verify result, an analysis report or a bundle`);
}

async function cmdReport(argv: string[], io: Io): Promise<number> {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { ...GATE_OPTIONS } });
  const gate = gateOptions(values);
  const files = expand(positionals, io, 'report needs at least one result file');
  const loaded = files.map((f) => loadSaved(f, io.cwd));
  const kinds = new Set(loaded.map((l) => l.kind));
  if (kinds.size > 1) fail('report cannot mix verify results with check results, reports or bundles');
  // Without --fail-on or --claims, keep the policy of the first saved check or verify result.
  const saved = loaded.find((l) => l.recorded);
  const failOn: FailOn = gate.failOn ?? (gate.claims === null && saved ? saved.failOn : 'none');
  const claims = gate.failOn === undefined && gate.claims === null && saved?.claims ? new Set(saved.claims) : gate.claims;
  let run: GateRun;
  if (kinds.has('verify')) {
    const entries = loaded.flatMap((l) => l.entries as VerifyEntry[]).map((e) => evaluateVerifyEntry({ bundle: e.bundle, result: e.result, ...(e.error !== undefined ? { error: e.error } : {}) }, failOn, claims));
    run = makeVerifyRun(entries, failOn, claims);
  } else {
    const entries = loaded.flatMap((l) => l.entries as CheckEntry[]).map((e) => evaluateCheckEntry(e, failOn, claims));
    run = makeCheckRun(entries, failOn, claims);
  }
  emit(run, gate, io);
  return run.exitCode;
}

// ---------------------------------------------------------------------------
// init

const MODEL_CHOICES = Object.keys(MODEL_IDS) as ModelChoice[];
const CI_CHOICES: readonly CiChoice[] = ['github', 'none'];

async function cmdInit(argv: string[], io: Io): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      model: { type: 'string' },
      preset: { type: 'string' },
      circuit: { type: 'boolean' },
      'no-circuit': { type: 'boolean' },
      'fail-on': { type: 'string' },
      ci: { type: 'string' },
      action: { type: 'string' },
      yes: { type: 'boolean', short: 'y' },
      force: { type: 'boolean' },
    },
  });
  if (positionals.length > 1) fail('init takes at most one directory');
  const dir = resolve(io.cwd, positionals[0] ?? '.');
  if (existsSync(dir) && !statSync(dir).isDirectory()) fail(`${positionals[0]} is not a directory`);
  let model = values.model as ModelChoice | undefined;
  if (model !== undefined && !MODEL_CHOICES.includes(model)) fail(`--model must be one of ${MODEL_CHOICES.join(', ')} (got "${values.model}")`);
  let preset: Preset | undefined;
  if (values.preset !== undefined) {
    preset = findPreset(values.preset);
    if (!preset) fail(`unknown preset "${values.preset}"; the presets are ${PRESETS.map((p) => `${p.id} (${p.model})`).join(', ')}`);
    if (model && preset.model !== model) fail(`preset ${preset.id} is a ${preset.model} design, not ${model}`);
  }
  if (values.circuit && values['no-circuit']) fail('--circuit and --no-circuit exclude each other');
  let failOn = values['fail-on'] === undefined ? undefined : parseFailOn(values['fail-on']);
  let ci = values.ci as CiChoice | undefined;
  if (ci !== undefined && !CI_CHOICES.includes(ci)) fail(`--ci must be one of ${CI_CHOICES.join(', ')} (got "${values.ci}")`);
  const action = values.action ?? DEFAULT_ACTION;
  if (!/^[\w.-]+\/[\w.-]+(\/[\w./-]+)?@[\w./-]+$/.test(action) && !action.startsWith('./')) fail(`--action must look like OWNER/REPO@REF (got "${action}")`);

  const stdin = io.stdin();
  const interactive = Boolean(stdin.isTTY) && !values.yes;
  const asker = interactive ? makeAsker(stdin, io.stdout) : null;
  const cancelled = (): number => {
    io.stderr.write('\ncryptificate: init cancelled; nothing was written\n');
    return EXIT_ERROR;
  };
  try {
    if (asker) {
      io.stdout.write(`Set up Cryptificate in ${dir}\n`);
      if (!model && !preset) {
        const a = await choose(asker, 'Design model: aes-like (GF(2^8) SPN) or hades (Poseidon2-style over BN254)', MODEL_CHOICES, 'aes-like', io.stdout);
        if (a === null) return cancelled();
        model = a as ModelChoice;
      }
      if (!preset) {
        const m = model ?? 'aes-like';
        const ids = PRESETS.filter((p) => p.model === m).map((p) => p.id);
        const a = await choose(asker, 'Starting design', ids, DEFAULT_PRESET[m], io.stdout);
        if (a === null) return cancelled();
        preset = findPreset(a);
      }
    }
    model ??= preset?.model ?? 'aes-like';
    preset ??= findPreset(DEFAULT_PRESET[model])!;
    let circuit = values.circuit ? true : values['no-circuit'] ? false : undefined;
    if (circuit && !preset.program) fail(`preset ${preset.id} has no reference circuit; add "program" to the design file yourself, or use --no-circuit`);
    if (circuit === undefined && asker && preset.program) {
      const a = await confirm(asker, `Also check the reference circuit ${preset.program.name ?? 'of this preset'} (adds circuit equivalence and native correctness)?`, false, io.stdout);
      if (a === null) return cancelled();
      circuit = a;
    }
    circuit ??= false;
    if (failOn === undefined && asker) {
      const a = await choose(asker, 'Fail the check on', FAIL_ON, 'refuted', io.stdout);
      if (a === null) return cancelled();
      failOn = a as FailOn;
    }
    failOn ??= 'refuted';
    if (ci === undefined && asker) {
      const a = await confirm(asker, 'Write a GitHub Actions workflow (code scanning upload of the SARIF result)?', true, io.stdout);
      if (a === null) return cancelled();
      ci = a ? 'github' : 'none';
    }
    ci ??= 'github';

    const plan = planInit({ dir, model, preset, circuit, failOn, ci, action });
    const shown = (p: string): string => posixRelative(io.cwd, p);
    const existing = plan.files.filter((f) => f.exists);
    if (existing.length > 0 && !values.force) {
      io.stderr.write(`cryptificate: init would overwrite ${existing.map((f) => shown(f.path)).join(', ')}; nothing was written (use --force to overwrite)\n`);
      return EXIT_ERROR;
    }
    if (asker) {
      io.stdout.write(`\nFiles to write:\n${plan.files.map((f) => `  ${shown(f.path)}${f.exists ? ' (overwrite)' : ''}`).join('\n')}\n`);
      const a = await confirm(asker, 'Write these files?', true, io.stdout);
      if (a === null) return cancelled();
      if (!a) {
        io.stderr.write('cryptificate: nothing was written\n');
        return 1;
      }
    }
    writePlan(plan);
    const design = shown(join(dir, ...plan.designFile.split('/')));
    const config = shown(join(dir, CONFIG_FILE));
    const workflow = plan.files.find((f) => f.path.endsWith(join('.github', 'workflows', 'cryptificate.yml')));
    const lines = [
      `${asker ? '\n' : ''}Wrote ${preset.id} (${MODEL_IDS[model]})${circuit ? ' with its circuit' : ''}, policy --fail-on ${failOn}:`,
      ...plan.files.map((f) => `  ${shown(f.path)}${f.exists ? ' (overwritten)' : ''}`),
      '',
      'Next steps:',
      `  1. Edit ${design} to describe your design${circuit ? ' and circuit' : ''}.`,
      `  2. Run cryptificate doctor, then cryptificate check${posixRelative(io.cwd, dir) === '.' ? '' : ` in ${shown(dir)}`}: it reads ${config} and exits`,
      '     0 when the policy holds, 1 when a claim violates it, 2 when a design could not be checked.',
      workflow
        ? `  3. Commit ${config}, ${shown(join(dir, 'cryptificate'))}/ and ${shown(workflow.path)}; pull requests that change them run the check and show refuted claims in code scanning.`
        : `  3. Commit ${config} and ${shown(join(dir, 'cryptificate'))}/.`,
    ];
    if (workflow && !plan.gitRoot) lines.push(`  Note: ${shown(dir) === '.' ? 'this directory' : shown(dir)} is not in a git repository yet; GitHub reads workflows from .github/workflows at the repository root.`);
    if (workflow && /@main$/.test(action)) lines.push(`  Pin the action to a commit SHA in ${shown(workflow.path)} (or rerun with --action OWNER/REPO@SHA) for a reproducible gate.`);
    io.stdout.write(`${lines.join('\n')}\n`);
    return 0;
  } finally {
    asker?.close();
  }
}

async function cmdServe(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      port: { type: 'string', default: process.env['PORT'] ?? '4173' },
      host: { type: 'string', default: '127.0.0.1' },
      'allow-origin': { type: 'string', multiple: true },
    },
  });
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) fail(`invalid port ${values.port}`);
  const host = values.host ?? '127.0.0.1';
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    process.stderr.write(
      `warning: binding to ${host}. The service has no authentication; anyone who can reach this address can run jobs.\n`,
    );
  }
  const env = makeEnv();
  const jobs = new JobManager({ env });
  const loaded = jobs.loadExisting();
  const origins = [...(values['allow-origin'] ?? []), ...(process.env['CRYPTIFICATE_ALLOWED_ORIGINS'] ?? '').split(',').filter(Boolean)];
  const server = createApp({ env, jobs, host, port, allowedOrigins: origins, webDist: env.paths.webDist });
  await new Promise<void>((res, rej) => {
    server.once('error', rej);
    server.listen(port, host, () => res());
  });
  const addr = server.address();
  const actualPort = addr && typeof addr === 'object' ? addr.port : port;
  const tc = await env.toolchain();
  const subs = await env.engine.subcommands();
  const shown = host.includes(':') ? `[${host}]` : host;
  process.stdout.write(
    [
      `Cryptificate ${tc.version} listening on http://${shown}:${actualPort}/`,
      `  engine: ${env.engine.available ? `available (${subs.join(', ') || 'no subcommands found'})` : 'not built'}`,
      `  lean:   ${env.lake ? `lake found, toolchain ${tc.leanToolchain}` : 'not installed'}`,
      `  state:  ${env.paths.home}${loaded ? ` (${loaded} earlier job(s) loaded)` : ''}`,
      '',
    ].join('\n'),
  );
  if (env.lake) warmLean(env);
  const shutdown = (): void => {
    jobs.stopAll();
    killAll();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return new Promise(() => {});
}

/**
 * Loads the certificate library once in the background, so that the first
 * job after the machine starts does not spend its Lean time limit reading the
 * library from a cold disk. The result is not used.
 */
function warmLean(env: PipelineEnv): void {
  const dir = join(env.paths.home, 'warmup');
  const file = join(dir, 'Warm.lean');
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, 'import Cryptificate\n');
  } catch {
    return;
  }
  void runLean({ lake: env.lake, leanDir: env.paths.leanDir, file, timeoutMs: 600_000, replacements: env.replacements }).catch(() => undefined);
}

export async function main(argv: string[], deps: CliDeps = {}): Promise<number> {
  const io: Io = {
    env: deps.env ?? (() => makeEnv()),
    stdout: deps.stdout ?? process.stdout,
    stderr: deps.stderr ?? process.stderr,
    stdin: deps.stdin ?? (() => process.stdin),
    environ: deps.environ ?? process.env,
    cwd: deps.cwd ?? process.cwd(),
    signals: deps.signals ?? true,
  };
  const [cmd, ...rest] = argv;
  try {
    switch (cmd) {
      case 'init':
        return await cmdInit(rest, io);
      case 'serve':
        return await cmdServe(rest);
      case 'check':
        return await cmdCheck(rest, io);
      case 'experiment':
        return await cmdExperiment(rest, io);
      case 'verify':
        return await cmdVerify(rest, io);
      case 'report':
        return await cmdReport(rest, io);
      case undefined:
      case '-h':
      case '--help':
      case 'help':
        io.stdout.write(USAGE);
        return cmd === undefined ? EXIT_ERROR : 0;
      case '--version':
      case 'version': {
        const tc = await readToolchain(resolvePaths());
        io.stdout.write(`${tc.checker}\n`);
        return 0;
      }
      default:
        io.stderr.write(`cryptificate: unknown command "${cmd}"\n\n${USAGE}`);
        return EXIT_ERROR;
    }
  } catch (e) {
    // parseArgs reports unknown or malformed options with these codes
    const code = (e as { code?: string }).code ?? '';
    if (e instanceof UsageError || code.startsWith('ERR_PARSE_ARGS')) {
      io.stderr.write(`cryptificate: ${(e as Error).message}\n`);
      return EXIT_ERROR;
    }
    throw e;
  }
}
