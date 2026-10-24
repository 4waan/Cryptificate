#!/usr/bin/env node
// Records genuine runs from a running Cryptificate service for the replay site
// and the examples directory.
//
//   node scripts/record-runs.mjs [--url http://127.0.0.1:4173] [--only name,name]
//
// For each run below the script submits the inputs from examples/designs and
// examples/programs over the HTTP API, waits for the job to finish, and saves
//
//   examples/bundles/<name>/report.json
//   examples/bundles/<name>/<name>.tar.gz      (the evidence bundle)
//
// and copies both into apps/web/public/recorded/<name>/, listed in
// apps/web/public/recorded/index.json. Local paths are replaced by
// placeholders; a file that still holds a path or a wall-clock timestamp is
// reported and the script exits non-zero. Timing runs wait until the machine
// is idle (1-minute load average below --max-load) before they are submitted.
// Start the service with an empty CRYPTIFICATE_HOME so analyses are checked
// afresh rather than answered from the proof cache.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { loadavg, homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const RUNS = [
  {
    name: 'beat-the-reference',
    title: 'Quick experiment: AES MixColumns against the textbook shared-sum circuit',
    kind: 'experiment',
    story: 1,
    design: 'aes',
    program: 'aes-known-shared-sum',
    profile: 'quick',
  },
  {
    name: 'aes-shared-sum',
    title: 'AES MixColumns with the textbook shared-sum circuit',
    kind: 'analysis',
    story: 2,
    design: 'aes',
    program: 'aes-known-shared-sum',
  },
  {
    name: 'aes-wrong-wire',
    title: 'AES MixColumns with one wire of the shared-sum circuit moved',
    kind: 'analysis',
    story: 2,
    design: 'aes',
    program: 'aes-wrong-wire',
  },
  {
    name: 'identity',
    title: 'Identity matrix with the identity circuit',
    kind: 'analysis',
    story: 3,
    design: 'identity',
    program: 'identity',
  },
  {
    name: 'poseidon2-exponent5',
    title: 'Poseidon2-style BN254 design, S-box x^5, external shared-sum circuit',
    kind: 'analysis',
    story: 4,
    design: 'poseidon2-bn254',
    program: 'poseidon2-external-shared-sum',
    target: 'external',
  },
  {
    name: 'poseidon2-exponent3',
    title: 'Poseidon2-style BN254 design, S-box x^3, external shared-sum circuit',
    kind: 'analysis',
    story: 4,
    design: 'poseidon2-exponent3',
    program: 'poseidon2-external-shared-sum',
    target: 'external',
  },
  {
    name: 'aes-row-scaled',
    title: 'AES with its first row doubled, [04 06 02 02]',
    kind: 'analysis',
    story: null,
    design: 'aes-row-scaled',
  },
  {
    name: 'repeated-offsets',
    title: 'AES MixColumns with a repeated row offset',
    kind: 'analysis',
    story: null,
    design: 'repeated-offsets',
  },
];

const TERMINAL = new Set(['completed', 'failed', 'timeout', 'cancelled', 'invalid']);

function parseArgs(argv) {
  const out = { url: 'http://127.0.0.1:4173', only: null, maxLoad: 1.0, loadWaitS: 600 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--url') out.url = next().replace(/\/+$/, '');
    else if (a === '--only') out.only = new Set(next().split(',').filter(Boolean));
    else if (a === '--max-load') out.maxLoad = Number(next());
    else if (a === '--load-wait') out.loadWaitS = Number(next());
    else if (a === '-h' || a === '--help') {
      console.log('usage: node scripts/record-runs.mjs [--url URL] [--only name,...] [--max-load 1.0] [--load-wait seconds]');
      console.log(`runs: ${RUNS.map((r) => r.name).join(', ')}`);
      process.exit(0);
    } else throw new Error(`unknown argument ${a}`);
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function requestFor(run) {
  const design = readJson(join(ROOT, 'examples/designs', `${run.design}.json`));
  const body = { design };
  if (run.program) body.program = readJson(join(ROOT, 'examples/programs', `${run.program}.json`));
  if (run.kind === 'analysis') {
    if (run.program && run.target) body.target = run.target;
  } else {
    body.profile = run.profile ?? 'quick';
  }
  return body;
}

async function api(base, path, init) {
  const res = await fetch(`${base}${path}`, init);
  if (!res.ok && res.status !== 202) {
    const text = await res.text();
    const err = new Error(`${init?.method ?? 'GET'} ${path}: HTTP ${res.status} ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return res;
}

async function waitForIdleMachine(maxLoad, waitS) {
  const start = Date.now();
  for (;;) {
    const load = loadavg()[0];
    if (load < maxLoad) return load;
    if ((Date.now() - start) / 1000 > waitS) {
      throw new Error(`1-minute load average stayed at ${load.toFixed(2)} (limit ${maxLoad}); not timing on a busy machine`);
    }
    process.stdout.write(`  waiting for an idle machine (load ${load.toFixed(2)})\n`);
    await sleep(15000);
  }
}

async function submit(base, run) {
  const path = run.kind === 'analysis' ? '/api/analyses' : '/api/experiments';
  const body = JSON.stringify(requestFor(run));
  for (;;) {
    try {
      const res = await api(base, path, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
      return (await res.json()).job;
    } catch (e) {
      if (e.status !== 429) throw e;
      await sleep(5000);
    }
  }
}

async function waitForJob(base, id) {
  for (;;) {
    const job = await (await api(base, `/api/jobs/${id}`)).json();
    if (TERMINAL.has(job.state)) return job;
    await sleep(1000);
  }
}

/** Absolute paths that must not appear in recorded files, longest first. */
function localPaths(jobId) {
  const paths = [ROOT, homedir(), process.env.CRYPTIFICATE_HOME, process.env.TMPDIR, '/tmp']
    .filter((p) => typeof p === 'string' && p.length > 1)
    .map((p) => [p, p === ROOT ? '<repo>' : p === homedir() ? '~' : '<tmp>']);
  return { paths: paths.sort((a, b) => b[0].length - a[0].length), jobId };
}

function scrubText(text, { paths, jobId }) {
  let s = text;
  // Job directories first: <state>/jobs/<id> -> <job>.
  s = s.replace(new RegExp(`[^\\s"'\`]*/jobs/${jobId}`, 'g'), '<job>');
  for (const [from, to] of paths) s = s.split(from).join(to);
  return s;
}

const TIMESTAMP = /\b(19|20)\d\d-[01]\d-[0-3]\d([T ][0-2]\d:[0-5]\d)?/;
const ABSOLUTE = /(^|[\s"'=(:])\/(home|root|tmp|Users|var\/folders)\//m;

function problems(name, text) {
  const out = [];
  const t = TIMESTAMP.exec(text);
  if (t) out.push(`${name}: looks like a date: ${t[0]}`);
  const a = ABSOLUTE.exec(text);
  if (a) out.push(`${name}: holds an absolute path near ${JSON.stringify(text.slice(Math.max(0, a.index - 20), a.index + 40))}`);
  return out;
}

function isText(name, data) {
  if (/\.(gz|png|jpg|bin|olean|ilean)$/i.test(name)) return false;
  return !data.subarray(0, 4096).includes(0);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const tarJs = join(ROOT, 'apps/server/dist/src/tar.js');
  if (!existsSync(tarJs)) throw new Error('build the server first: npm run build -w packages/schema -w apps/server');
  const { readTarGz, createTarGz } = await import(tarJs);

  const caps = await (await api(opts.url, '/api/capabilities')).json();
  console.log(`service ${opts.url}: ${JSON.stringify(caps).slice(0, 160)}`);

  const publicDir = join(ROOT, 'apps/web/public/recorded');
  const indexPath = join(publicDir, 'index.json');
  const previous = existsSync(indexPath) ? readJson(indexPath) : { version: 1, entries: [] };
  const entries = new Map((previous.entries ?? []).map((e) => [e.id, e]));
  const issues = [];

  for (const run of RUNS) {
    if (opts.only && !opts.only.has(run.name)) continue;
    console.log(`${run.name}: ${run.kind}`);
    if (run.kind === 'experiment') {
      const load = await waitForIdleMachine(opts.maxLoad, opts.loadWaitS);
      console.log(`  load average before timing: ${load.toFixed(2)}`);
    }
    const started = Date.now();
    const submitted = await submit(opts.url, run);
    const job = await waitForJob(opts.url, submitted.id);
    console.log(`  job ${job.id}: ${job.state} after ${((Date.now() - started) / 1000).toFixed(1)} s`);
    if (!job.report) {
      issues.push(`${run.name}: job ${job.state} without a report`);
      continue;
    }
    const scrub = localPaths(job.id);
    const reportText = scrubText(`${JSON.stringify(job.report, null, 2)}\n`, scrub);
    issues.push(...problems(`${run.name}/report.json`, reportText));

    let bundle = null;
    if (job.bundle) {
      const gz = Buffer.from(await (await api(opts.url, `/api/jobs/${job.id}/bundle`)).arrayBuffer());
      const files = readTarGz(gz);
      const cleaned = [];
      for (const [path, data] of files) {
        if (isText(path, data)) {
          const text = scrubText(data.toString('utf8'), scrub);
          issues.push(...problems(`${run.name}.tar.gz:${path}`, text));
          cleaned.push({ path, data: text });
        } else cleaned.push({ path, data });
      }
      bundle = createTarGz(cleaned);
    }

    const exampleDir = join(ROOT, 'examples/bundles', run.name);
    const siteDir = join(publicDir, run.name);
    for (const dir of [exampleDir, siteDir]) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'report.json'), reportText);
      if (bundle) writeFileSync(join(dir, `${run.name}.tar.gz`), bundle);
    }
    const entry = { id: run.name, kind: run.kind, title: run.title, story: run.story, report: `${run.name}/report.json` };
    if (bundle) entry.bundle = `${run.name}/${run.name}.tar.gz`;
    entries.set(run.name, entry);
    summarize(run.name, job.report);
  }

  const ordered = [
    ...RUNS.map((r) => entries.get(r.name)).filter(Boolean),
    ...[...entries.values()].filter((e) => !RUNS.some((r) => r.name === e.id)),
  ].map(({ story, ...rest }) => (story == null ? rest : { ...rest, story }));
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(indexPath, `${JSON.stringify({ version: 1, entries: ordered }, null, 2)}\n`);

  if (issues.length) {
    console.error('problems in recorded files:');
    for (const i of issues) console.error(`  ${i}`);
    process.exitCode = 1;
  }
}

function summarize(name, report) {
  if (report.kind === 'analysis') {
    const claims = (report.claims ?? []).map((c) => `${c.id}=${c.status}`).join(' ');
    console.log(`  ${name}: ${claims}`);
  } else {
    const m = report.measurements;
    const primary = (m?.comparisons ?? []).filter((c) => c.primary ?? c.bytes === 65536);
    const ratios = primary.map((c) => `s${c.session} ${c.candidate}/${c.baseline} ${c.ratio.toFixed(3)} [${c.ci95[0].toFixed(3)}, ${c.ci95[1].toFixed(3)}]`);
    console.log(`  ${name}: verdict ${m?.verdict ?? 'not timed'}; ${ratios.join('; ')}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
