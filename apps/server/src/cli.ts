#!/usr/bin/env node
/**
 * cryptificate serve | check | experiment | verify
 */
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { validateAnalysisRequest, validateExperimentRequest } from '@cryptificate/schema';
import type { AnalysisReport, AnalysisRequest, ExperimentReport, ExperimentRequest, ProgramTarget, Report } from '@cryptificate/schema';
import { buildBundle } from './bundle.js';
import { ANALYSIS_BUDGET_MS, ANALYSIS_STEPS, runAnalysis } from './analysis.js';
import { JobContext } from './context.js';
import type { PipelineEnv } from './context.js';
import { EXPERIMENT_STEPS, experimentBudgetMs, runExperiment } from './experiment.js';
import { formatAnalysis, formatExperiment, makeStyle, stepLine, table } from './format.js';
import { JobManager } from './jobs.js';
import { makeEnv } from './env.js';
import { resolvePaths } from './paths.js';
import { killAll } from './proc.js';
import { createApp } from './server.js';
import { readToolchain } from './toolchain.js';
import { verifyBundle } from './verify.js';

const USAGE = `Usage: cryptificate <command> [options]

Commands:
  serve [--port 4173] [--host 127.0.0.1] [--allow-origin URL]
        Run the local service and web UI.
  check <design.json> [--program p.json] [--target matrix|external|internal] [--json out.json]
        [--bundle out.tar.gz] [--no-cache]
        Check a design (and optionally a circuit) and print the claims.
  experiment <design.json> [--program p.json] [--profile quick|research] [--seed HEX] [--json out.json]
        [--bundle out.tar.gz]
        Search, check and measure circuits for the design's matrix.
  verify <bundle.tar.gz> [--native] [--keep] [--json out.json]
        Re-derive a bundle's claims with the installed engine and Lean checker.

<design.json> may hold a CandidateDesign or a full request object.
Environment: CRYPTIFICATE_HOME (state directory), CRYPTIFICATE_ENGINE, CRYPTIFICATE_LAKE.
`;

function fail(message: string, code = 2): never {
  process.stderr.write(`cryptificate: ${message}\n`);
  process.exit(code);
}

function readJsonFile(path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    fail(`cannot read ${path}: ${(e as NodeJS.ErrnoException).code ?? (e as Error).message}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    fail(`${path} is not valid JSON`);
  }
}

function buildRequest(designPath: string, programPath: string | undefined): Record<string, unknown> {
  const doc = readJsonFile(designPath);
  const req: Record<string, unknown> =
    doc && typeof doc === 'object' && !Array.isArray(doc) && 'design' in doc ? { ...(doc as Record<string, unknown>) } : { design: doc };
  if (programPath) req['program'] = readJsonFile(programPath);
  return req;
}

function progress(ctx: JobContext, quiet: boolean): () => void {
  const seen = new Map<string, string>();
  return () => {
    if (quiet) return;
    for (const s of ctx.steps) {
      const key = `${s.state}`;
      if (s.state === 'pending' || seen.get(s.name) === key) continue;
      seen.set(s.name, key);
      process.stderr.write(`  ${stepLine(s)}\n`);
    }
  };
}

async function writeBundle(env: PipelineEnv, dir: string, report: Report, out: string): Promise<void> {
  let inputs: unknown;
  try {
    inputs = JSON.parse(readFileSync(join(dir, 'inputs.json'), 'utf8')) as unknown;
  } catch {
    inputs = undefined;
  }
  const gz = buildBundle({ jobDir: dir, report, toolchain: await env.toolchain(), paths: env.paths, inputs });
  writeFileSync(resolve(out), gz);
  process.stderr.write(`bundle: ${resolve(out)}\n`);
}

function newRunDir(env: PipelineEnv): { id: string; dir: string } {
  const id = randomBytes(16).toString('hex');
  const dir = join(env.paths.jobsDir, id);
  mkdirSync(dir, { recursive: true });
  return { id, dir };
}

function onInterrupt(controller: AbortController): void {
  let count = 0;
  process.on('SIGINT', () => {
    count++;
    if (count > 1) {
      killAll();
      process.exit(130);
    }
    process.stderr.write('\nstopping (completed checkpoints are kept)...\n');
    controller.abort();
  });
}

async function cmdCheck(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      program: { type: 'string' },
      target: { type: 'string' },
      json: { type: 'string' },
      bundle: { type: 'string' },
      'no-cache': { type: 'boolean' },
      quiet: { type: 'boolean', short: 'q' },
    },
  });
  if (positionals.length !== 1) fail('check needs exactly one design file\n\n' + USAGE);
  const req = buildRequest(positionals[0]!, values.program);
  if (values.target) req['target'] = values.target as ProgramTarget;
  const v = validateAnalysisRequest(req);
  if (!v.ok) fail(`invalid request:\n${v.errors.map((e) => `  ${e.path}: ${e.message}`).join('\n')}`);
  const env = makeEnv();
  if (values['no-cache']) env.noCache = true;
  const { id, dir } = newRunDir(env);
  writeFileSync(join(dir, 'request.json'), `${JSON.stringify(v.value, null, 2)}\n`);
  const controller = new AbortController();
  onInterrupt(controller);
  let update: () => void = () => {};
  const ctx = new JobContext(id, dir, controller.signal, env.analysisBudgetMs ?? ANALYSIS_BUDGET_MS, ANALYSIS_STEPS, () => update());
  update = progress(ctx, values.quiet ?? false);
  if (!values.quiet) process.stderr.write(`analysis ${id}\n`);
  const result = await runAnalysis(env, ctx, v.value as AnalysisRequest);
  const style = makeStyle(process.stdout);
  if (result.state === 'invalid' || !result.report) {
    fail(`the engine rejected the request: ${result.error?.path ? `${result.error.path}: ` : ''}${result.error?.message ?? 'unknown error'}`, 2);
  }
  const report = result.report as AnalysisReport;
  process.stdout.write(`${formatAnalysis(report, style)}\n`);
  if (values.json) writeFileSync(resolve(values.json), `${JSON.stringify(report, null, 2)}\n`);
  if (values.bundle) await writeBundle(env, dir, report, values.bundle);
  if (!values.quiet) process.stderr.write(`job directory: ${dir}\n`);
  return result.state === 'completed' ? 0 : 1;
}

async function cmdExperiment(argv: string[]): Promise<number> {
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
  const req = buildRequest(positionals[0]!, values.program);
  delete req['target'];
  req['profile'] = values.profile;
  if (values.seed) req['seed'] = values.seed;
  const v = validateExperimentRequest(req);
  if (!v.ok) fail(`invalid request:\n${v.errors.map((e) => `  ${e.path}: ${e.message}`).join('\n')}`);
  const env = makeEnv();
  const { id, dir } = newRunDir(env);
  writeFileSync(join(dir, 'request.json'), `${JSON.stringify(v.value, null, 2)}\n`);
  const controller = new AbortController();
  onInterrupt(controller);
  let update: () => void = () => {};
  const ctx = new JobContext(id, dir, controller.signal, experimentBudgetMs(v.value.profile), EXPERIMENT_STEPS, () => update());
  update = progress(ctx, values.quiet ?? false);
  if (!values.quiet) process.stderr.write(`experiment ${id} (${v.value.profile})\n`);
  const result = await runExperiment(env, ctx, v.value as ExperimentRequest);
  if (result.state === 'invalid' || !result.report) {
    fail(`the engine rejected the request: ${result.error?.message ?? 'unknown error'}`, 2);
  }
  process.stdout.write(`${formatExperiment(result.report as ExperimentReport, makeStyle(process.stdout))}\n`);
  if (values.json) writeFileSync(resolve(values.json), `${JSON.stringify(result.report, null, 2)}\n`);
  if (values.bundle) await writeBundle(env, dir, result.report, values.bundle);
  if (!values.quiet) process.stderr.write(`job directory: ${dir}\n`);
  return result.state === 'completed' ? 0 : 1;
}

async function cmdVerify(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { native: { type: 'boolean' }, keep: { type: 'boolean' }, json: { type: 'string' } },
  });
  if (positionals.length !== 1) fail('verify needs exactly one bundle\n\n' + USAGE);
  const env = makeEnv();
  const style = makeStyle(process.stdout);
  let result;
  try {
    result = await verifyBundle(env, resolve(positionals[0]!), {
      native: values.native ?? false,
      keep: values.keep ?? false,
      log: (l) => process.stderr.write(`${l}\n`),
    });
  } catch (e) {
    fail(`cannot verify ${positionals[0]}: ${(e as Error).message}`);
  }
  const lines = [
    `${style.bold('Bundle')} ${result.kind} ${result.id}`,
    `inputs  recorded ${result.inputDigest.recorded}`,
  ];
  if (result.inputDigest.recomputed) lines.push(`        recomputed ${result.inputDigest.recomputed}`);
  lines.push(
    '',
    table(
      ['subject', 'claim', 'recorded', 'recomputed', 'result'],
      result.rows.map((r) => [r.subject, r.claim, r.recorded, r.recomputed, style.status(r.result, r.result)]),
    ),
    '',
    ...result.notes,
    '',
    result.ok ? style.status('match', 'All re-checked claims match.') : style.status('mismatch', 'Some claims do not match or could not be re-checked.'),
  );
  process.stdout.write(`${lines.join('\n')}\n`);
  if (values.json) writeFileSync(resolve(values.json), `${JSON.stringify(result, null, 2)}\n`);
  return result.ok ? 0 : 1;
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

export async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case 'serve':
      return cmdServe(rest);
    case 'check':
      return cmdCheck(rest);
    case 'experiment':
      return cmdExperiment(rest);
    case 'verify':
      return cmdVerify(rest);
    case undefined:
    case '-h':
    case '--help':
    case 'help':
      process.stdout.write(USAGE);
      return cmd === undefined ? 2 : 0;
    case '--version':
    case 'version': {
      const tc = await readToolchain(resolvePaths());
      process.stdout.write(`${tc.checker}\n`);
      return 0;
    }
    default:
      process.stderr.write(`cryptificate: unknown command "${cmd}"\n\n${USAGE}`);
      return 2;
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    process.stderr.write(`cryptificate: ${(e as Error).message}\n`);
    process.exitCode = 1;
  },
);
