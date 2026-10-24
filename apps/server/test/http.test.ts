import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { rmSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AnalysisReport, Job } from '@cryptificate/schema';
import type { JobContext, PipelineEnv, PipelineResult } from '../src/context.js';
import { JobManager } from '../src/jobs.js';
import { checkRequestOrigin, createApp, makeOriginPolicy } from '../src/server.js';
import { readTarGz } from '../src/tar.js';
import { AES_DESIGN, makeFixture } from './helpers.js';

interface Res {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  json<T = Record<string, unknown>>(): T;
}

function call(port: number, method: string, path: string, opts: { body?: string | Buffer; headers?: Record<string, string> } = {}): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers: { ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}), ...opts.headers } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body, json: <T>() => JSON.parse(body.toString('utf8')) as T });
      });
    });
    req.on('error', (e: NodeJS.ErrnoException) => {
      // the server may close the connection after a 413 before the upload finishes
      if (e.code === 'EPIPE' || e.code === 'ECONNRESET') resolve({ status: -1, headers: {}, body: Buffer.alloc(0), json: () => ({}) as never });
      else reject(e);
    });
    if (opts.body !== undefined) req.end(opts.body);
    else req.end();
  });
}

/** A pipeline that runs until stopped or released, publishing a partial report. */
function blockingPipeline(release: Promise<void>) {
  return async (_env: PipelineEnv, ctx: JobContext): Promise<PipelineResult> => {
    ctx.start('validate');
    ctx.finish('validate', 'completed');
    ctx.start('lean');
    const partial: AnalysisReport = {
      kind: 'analysis',
      id: ctx.id,
      inputDigest: `sha256:${'0'.repeat(64)}`,
      inputs: { design: AES_DESIGN },
      claims: [],
      execution: { state: 'running', steps: ctx.executionSteps() },
      provenance: { origin: 'live', checker: 'cryptificate test', toolchain: { lean: 'v', mathlib: 'm', widetrail: 'w', rustc: 'r' } },
    };
    ctx.setReport(partial);
    await new Promise<void>((resolve) => {
      ctx.signal.addEventListener('abort', () => resolve(), { once: true });
      void release.then(resolve);
    });
    if (ctx.cancelled) {
      ctx.closeRemaining('cancelled');
      const r = { ...partial, execution: { state: 'cancelled' as const, steps: ctx.executionSteps() } };
      ctx.setReport(r);
      return { state: 'cancelled', report: r };
    }
    ctx.finish('lean', 'completed');
    ctx.closeRemaining('not_run');
    const r = { ...partial, execution: { state: 'completed' as const, steps: ctx.executionSteps() } };
    ctx.setReport(r);
    return { state: 'completed', report: r };
  };
}

async function start(pipeline?: ReturnType<typeof blockingPipeline>): Promise<{ server: Server; port: number; jobs: JobManager; root: string; close: () => Promise<void> }> {
  const { root, env } = makeFixture();
  const jobs = new JobManager({ env, ...(pipeline ? { pipelines: { analysis: pipeline, experiment: pipeline } } : {}) });
  const server = createApp({ env, jobs, host: '127.0.0.1', port: 0, webDist: null });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;
  return {
    server,
    port,
    jobs,
    root,
    close: async () => {
      jobs.stopAll();
      await jobs.idle();
      await new Promise<void>((r) => server.close(() => r()));
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test('origin policy: loopback Host required, cross-origin writes rejected', () => {
  const policy = makeOriginPolicy('127.0.0.1', 4173);
  const ok = (method: string, headers: Record<string, string>) => checkRequestOrigin({ method, headers }, policy);
  assert.equal(ok('GET', { host: '127.0.0.1:4173' }), null);
  assert.equal(ok('GET', { host: 'localhost:4173' }), null);
  assert.equal(ok('GET', { host: '[::1]:4173' }), null);
  assert.notEqual(ok('GET', { host: 'attacker.example:4173' }), null);
  assert.notEqual(ok('GET', {}), null);
  assert.equal(ok('POST', { host: '127.0.0.1:4173' }), null);
  assert.equal(ok('POST', { host: '127.0.0.1:4173', origin: 'http://127.0.0.1:4173' }), null);
  assert.equal(ok('POST', { host: 'localhost:4173', origin: 'http://localhost:4173' }), null);
  assert.notEqual(ok('POST', { host: '127.0.0.1:4173', origin: 'http://evil.example' }), null);
  assert.notEqual(ok('POST', { host: '127.0.0.1:4173', origin: 'http://127.0.0.1:5173' }), null);
  assert.notEqual(ok('POST', { host: '127.0.0.1:4173', origin: 'null' }), null);
  assert.notEqual(ok('POST', { host: '127.0.0.1:4173', 'sec-fetch-site': 'cross-site' }), null);
  const dev = makeOriginPolicy('127.0.0.1', 4173, ['http://localhost:5173']);
  assert.equal(checkRequestOrigin({ method: 'POST', headers: { host: '127.0.0.1:4173', origin: 'http://localhost:5173' } }, dev), null);
});

test('HTTP: validation, content type, body limit and same-origin', async () => {
  const s = await start(blockingPipeline(new Promise(() => {})));
  try {
    const caps = await call(s.port, 'GET', '/api/capabilities');
    assert.equal(caps.status, 200);
    assert.equal(caps.json<{ limits: { maxBodyBytes: number } }>().limits.maxBodyBytes, 262144);

    const bad = await call(s.port, 'POST', '/api/analyses', { body: JSON.stringify({ design: { ...AES_DESIGN, matrix: [[2]] } }) });
    assert.equal(bad.status, 400);
    assert.equal(bad.json<{ error: { code: string } }>().error.code, 'invalid-request');
    assert.ok(bad.json<{ errors: unknown[] }>().errors.length > 0);

    const numbers = await call(s.port, 'POST', '/api/analyses', { body: JSON.stringify({ design: { ...AES_DESIGN, matrix: AES_DESIGN.matrix.map((r) => r.map((e) => Number(e))) } }) });
    assert.equal(numbers.status, 400);

    assert.equal((await call(s.port, 'POST', '/api/analyses', { body: '{not json' })).status, 400);
    assert.equal((await call(s.port, 'POST', '/api/analyses', { body: '{}', headers: { 'content-type': 'text/plain' } })).status, 415);

    const big = await call(s.port, 'POST', '/api/analyses', { body: Buffer.alloc(300 * 1024, 0x20) });
    assert.ok(big.status === 413 || big.status === -1, `status ${big.status}`);
    const declared = await call(s.port, 'POST', '/api/analyses', { body: '{}', headers: { 'content-length': String(1024 * 1024) } }).catch(() => ({ status: 413 }) as Res);
    assert.ok(declared.status === 413 || declared.status === -1);

    const cross = await call(s.port, 'POST', '/api/analyses', { body: JSON.stringify({ design: AES_DESIGN }), headers: { origin: 'http://evil.example' } });
    assert.equal(cross.status, 403);
    const rebinding = await call(s.port, 'GET', '/api/capabilities', { headers: { host: `evil.example:${s.port}` } });
    assert.equal(rebinding.status, 403);

    assert.equal((await call(s.port, 'GET', '/api/jobs/ffffffffffffffffffffffffffffffff')).status, 404);
    assert.equal((await call(s.port, 'GET', '/api/jobs/../../etc/passwd')).status, 404);
    assert.equal((await call(s.port, 'DELETE', '/api/jobs')).status, 405);
  } finally {
    await s.close();
  }
});

test('HTTP: one worker, two queued, 429 beyond; stop keeps checkpoints; bundles', async () => {
  let release!: () => void;
  const released = new Promise<void>((r) => (release = r));
  const s = await start(blockingPipeline(released));
  try {
    const body = JSON.stringify({ design: AES_DESIGN });
    const origin = { origin: `http://127.0.0.1:${s.port}` };
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await call(s.port, 'POST', '/api/analyses', { body, headers: origin });
      assert.equal(r.status, 202, `job ${i}`);
      const job = r.json<{ job: { id: string; kind: string; state: string; origin: string } }>().job;
      assert.match(job.id, /^[0-9a-f]{32}$/);
      assert.equal(job.kind, 'analysis');
      assert.equal(job.origin, 'live');
      ids.push(job.id);
      await new Promise((r2) => setTimeout(r2, 20));
    }
    const full = await call(s.port, 'POST', '/api/analyses', { body });
    assert.equal(full.status, 429);
    assert.equal(full.headers['retry-after'], '30');

    const running = (await call(s.port, 'GET', `/api/jobs/${ids[0]}`)).json<Job>();
    assert.equal(running.state, 'running');
    assert.ok(running.report, 'partial report visible while running');
    assert.ok(running.steps.some((st) => st.name === 'validate' && st.state === 'completed'));
    assert.equal(running.bundle, false);
    assert.equal((await call(s.port, 'GET', `/api/jobs/${ids[0]}/bundle`)).status, 409);
    const queued = (await call(s.port, 'GET', `/api/jobs/${ids[2]}`)).json<Job>();
    assert.equal(queued.state, 'queued');
    assert.equal(queued.queuePosition, 2);

    // stop a queued job, then the running one
    assert.equal((await call(s.port, 'POST', `/api/jobs/${ids[2]}/stop`)).status, 200);
    assert.equal((await call(s.port, 'GET', `/api/jobs/${ids[2]}`)).json<Job>().state, 'cancelled');
    assert.equal((await call(s.port, 'POST', `/api/jobs/${ids[0]}/stop`)).status, 200);
    for (let i = 0; i < 50; i++) {
      if ((await call(s.port, 'GET', `/api/jobs/${ids[0]}`)).json<Job>().state === 'cancelled') break;
      await new Promise((r) => setTimeout(r, 20));
    }
    const stopped = (await call(s.port, 'GET', `/api/jobs/${ids[0]}`)).json<Job>();
    assert.equal(stopped.state, 'cancelled');
    assert.ok(stopped.steps.some((st) => st.name === 'validate' && st.state === 'completed'), 'completed checkpoint kept');
    assert.ok(stopped.steps.some((st) => st.name === 'lean' && st.state === 'cancelled'));

    // the second job now runs; release it and fetch its bundle
    release();
    await s.jobs.idle();
    const done = (await call(s.port, 'GET', `/api/jobs/${ids[1]}`)).json<Job>();
    assert.equal(done.state, 'completed');
    assert.equal(done.bundle, true);
    const b1 = await call(s.port, 'GET', `/api/jobs/${ids[1]}/bundle`);
    assert.equal(b1.status, 200);
    assert.equal(b1.headers['content-type'], 'application/gzip');
    const b2 = await call(s.port, 'GET', `/api/jobs/${ids[1]}/bundle`);
    assert.ok(b1.body.equals(b2.body), 'bundle bytes are stable');
    const files = readTarGz(b1.body);
    assert.ok(files.has('inputs.json') && files.has('report.json') && files.has('VERIFY.md'));
    // the cancelled job still has a bundle with its completed checkpoints
    assert.equal((await call(s.port, 'GET', `/api/jobs/${ids[0]}/bundle`)).status, 200);
  } finally {
    await s.close();
  }
});
