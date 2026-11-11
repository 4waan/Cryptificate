/**
 * The OpenAPI description (schemas/openapi.json) against the service: the
 * same routes in both, recorded examples valid against the referenced
 * schemas, every error code the handler can produce documented, and live
 * responses of an in-process service valid against the description.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SchemaRegistry, resolveJsonPointer, validateAnalysisRequest, validateExperimentRequest } from '@cryptificate/schema';
import type { AnalysisReport } from '@cryptificate/schema';
import type { JobContext, PipelineEnv, PipelineResult } from '../src/context.js';
import { JobManager } from '../src/jobs.js';
import { bundleOpenApi, componentName } from '../src/openapi.js';
import { API_ROUTES, createApp, matchApiRoute } from '../src/server.js';
import { AES_DESIGN, makeFixture } from './helpers.js';

const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
const SCHEMAS = join(REPO, 'schemas');
const BASE = 'https://github.com/4waan/Cryptificate/schemas/';
const DOC_URI = `${BASE}openapi.json`;
const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;

type Obj = Record<string, unknown>;

function readJson(file: string): Obj {
  return JSON.parse(readFileSync(file, 'utf8')) as Obj;
}

const spec = readJson(join(SCHEMAS, 'openapi.json'));
const paths = spec['paths'] as Record<string, Obj>;

function registry(doc: Obj = spec, withFiles = true): SchemaRegistry {
  const reg = new SchemaRegistry().add(DOC_URI, doc);
  if (withFiles) {
    for (const f of readdirSync(SCHEMAS).filter((n) => n.endsWith('.schema.json'))) reg.add(BASE + f, readJson(join(SCHEMAS, f)));
  }
  return reg;
}

function escape(s: string): string {
  return s.replace(/~/g, '~0').replace(/\//g, '~1');
}

/** Follow an OpenAPI Reference Object ({"$ref": "#/components/..."}) to its target and pointer. */
function deref(doc: Obj, node: unknown, pointer: string): { node: Obj; pointer: string } {
  let cur = node as Obj;
  let ptr = pointer;
  for (let i = 0; i < 10 && typeof cur['$ref'] === 'string'; i++) {
    const ref = cur['$ref'] as string;
    assert.ok(ref.startsWith('#/'), `${ptr}: non-local reference ${ref}`);
    // the reference is a URI fragment: percent-decode it to get the JSON Pointer
    ptr = decodeURIComponent(ref.slice(1));
    cur = resolveJsonPointer(doc, ptr) as Obj;
    assert.ok(cur, `${pointer}: unresolvable ${ref}`);
  }
  return { node: cur, pointer: ptr };
}

interface Operation {
  method: string;
  path: string;
  op: Obj;
  pointer: string;
}

function operations(doc: Obj = spec): Operation[] {
  const out: Operation[] = [];
  for (const [path, item] of Object.entries(doc['paths'] as Record<string, Obj>)) {
    for (const m of METHODS) {
      if (item[m]) out.push({ method: m.toUpperCase(), path, op: item[m] as Obj, pointer: `/paths/${escape(path)}/${m}` });
    }
  }
  return out;
}

/** JSON Pointer (in `doc`) of the schema for a response, or null if undocumented. */
function responseSchema(doc: Obj, o: Operation, status: number, mediaType: string): { pointer: string | null; documented: boolean } {
  const responses = o.op['responses'] as Obj;
  if (!(String(status) in responses)) return { pointer: null, documented: false };
  const r = deref(doc, responses[String(status)], `${o.pointer}/responses/${status}`);
  const content = (r.node['content'] ?? {}) as Obj;
  const media = content[mediaType] as Obj | undefined;
  if (!media) return { pointer: null, documented: false };
  return { pointer: `${r.pointer}/content/${escape(mediaType)}/schema`, documented: true };
}

test('openapi: the document is OpenAPI 3.1 and versioned like the service', () => {
  assert.equal(spec['openapi'], '3.1.0');
  assert.equal(spec['jsonSchemaDialect'], 'https://json-schema.org/draft/2020-12/schema');
  const pkg = readJson(join(REPO, 'apps', 'server', 'package.json'));
  assert.equal((spec['info'] as Obj)['version'], pkg['version']);
  const ids = operations().map((o) => o.op['operationId']);
  assert.equal(new Set(ids).size, ids.length, 'operationIds are unique');
});

test('openapi: every route the service dispatches is described, and nothing else', () => {
  const described = operations()
    .filter((o) => o.path.startsWith('/api/'))
    .map((o) => `${o.method} ${o.path} ${String(o.op['operationId'])}`)
    .sort();
  const served = API_ROUTES.map((r) => `${r.method} ${r.path} ${r.operationId}`).sort();
  assert.deepEqual(described, served);
  // outside /api/ the description has only the web UI entry point
  const other = operations().filter((o) => !o.path.startsWith('/api/'));
  assert.deepEqual(
    other.map((o) => `${o.method} ${o.path}`),
    ['GET /'],
  );
  assert.deepEqual(other[0]!.op['tags'], ['web']);
  // path parameters are declared for every templated segment
  for (const o of operations()) {
    const names = [...o.path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    const item = paths[o.path]!;
    const params = [...((item['parameters'] ?? []) as unknown[]), ...((o.op['parameters'] ?? []) as unknown[])].map(
      (p) => deref(spec, p, o.pointer).node,
    );
    for (const n of names) assert.ok(params.some((p) => p['name'] === n && p['in'] === 'path' && p['required'] === true), `${o.path}: ${n}`);
  }
});

test('openapi: the route matcher accepts the described paths only', () => {
  const id = 'a'.repeat(32);
  assert.equal(matchApiRoute('GET', `/api/jobs/${id}`)?.params['id'], id);
  assert.equal(matchApiRoute('POST', `/api/jobs/${id}/stop`)?.operationId, 'stopJob');
  assert.equal(matchApiRoute('GET', `/api/jobs/${id}/stop`), null);
  assert.equal(matchApiRoute('GET', '/api/jobs/'), null);
  assert.equal(matchApiRoute('GET', '/api/jobs//bundle'), null);
  assert.equal(matchApiRoute('GET', '/api/capabilities/'), null);
  assert.equal(matchApiRoute('HEAD', '/api/capabilities'), null);
});

test('openapi: every reference resolves and every schema is supported by the validator', () => {
  const reg = registry();
  const walk = (node: unknown, ptr: string, inSchema: boolean): void => {
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${ptr}/${i}`, inSchema));
    if (!node || typeof node !== 'object') return;
    const o = node as Obj;
    if (typeof o['$ref'] === 'string' && !inSchema) deref(spec, o, ptr);
    for (const [k, v] of Object.entries(o)) {
      if (k === 'example' || k === 'examples') continue;
      if (k === 'schema' && !inSchema) {
        reg.assertSupported(`${DOC_URI}#${ptr}/schema`);
        continue;
      }
      walk(v, `${ptr}/${escape(k)}`, inSchema);
    }
  };
  walk(spec, '', false);
  const schemas = ((spec['components'] as Obj)['schemas'] ?? {}) as Obj;
  for (const name of Object.keys(schemas)) reg.assertSupported(`${DOC_URI}#/components/schemas/${name}`);
});

test('openapi: recorded examples validate against the referenced schemas', () => {
  const reg = registry();
  let checked = 0;
  for (const o of operations()) {
    const body = o.op['requestBody'] as Obj | undefined;
    if (body) {
      const media = (body['content'] as Obj)['application/json'] as Obj;
      for (const [name, e] of Object.entries((media['examples'] ?? {}) as Record<string, Obj>)) {
        const where = `${o.op['operationId']} request ${name}`;
        assert.deepEqual(reg.validate(`${DOC_URI}#${o.pointer}/requestBody/content/application~1json/schema`, e['value']), [], where);
        const v = o.op['operationId'] === 'submitAnalysis' ? validateAnalysisRequest(e['value']) : validateExperimentRequest(e['value']);
        assert.ok(v.ok, `${where}: ${JSON.stringify(v.ok ? null : v.errors)}`);
        checked++;
      }
    }
    for (const status of Object.keys(o.op['responses'] as Obj)) {
      const r = deref(spec, (o.op['responses'] as Obj)[status], `${o.pointer}/responses/${status}`);
      for (const [mediaType, media] of Object.entries((r.node['content'] ?? {}) as Record<string, Obj>)) {
        for (const [name, e] of Object.entries((media['examples'] ?? {}) as Record<string, Obj>)) {
          const issues = reg.validate(`${DOC_URI}#${r.pointer}/content/${escape(mediaType)}/schema`, e['value']);
          assert.deepEqual(issues, [], `${o.op['operationId']} ${status} ${name}`);
          checked++;
        }
      }
    }
  }
  assert.ok(checked >= 25, `${checked} examples checked`);
  // a corrupted example is caught
  const job = (resolveJsonPointer(spec, '/paths/~1api~1jobs~1{id}/get/responses/200/content/application~1json/examples/completed/value') as Obj);
  const broken = { ...job, state: 'finished' };
  assert.ok(reg.validate(`${DOC_URI}#/paths/~1api~1jobs~1{id}/get/responses/200/content/application~1json/schema`, broken).length > 0);
});

test('openapi: every error code the handler can produce is documented', () => {
  const src = readFileSync(join(REPO, 'apps', 'server', 'src', 'server.ts'), 'utf8');
  const codes = new Set<string>();
  const statuses = new Set<number>();
  for (const m of src.matchAll(/(?:sendError\(res, |new HttpError\()(\d{3}), '([a-z-]+)'/g)) {
    statuses.add(Number(m[1]));
    codes.add(m[2]!);
  }
  // the fallback for unknown API paths picks 404 or 405
  for (const m of src.matchAll(/\? (\d{3}) : (\d{3}), \w+ \? '([a-z-]+)' : '([a-z-]+)'/g)) {
    statuses.add(Number(m[1])).add(Number(m[2]));
    codes.add(m[3]!).add(m[4]!);
  }
  for (const c of ['forbidden', 'bad-json', 'invalid-request', 'unsupported-media-type', 'body-too-large', 'not-found', 'method-not-allowed', 'queue-full', 'not-ready', 'internal']) {
    assert.ok(codes.has(c), `the handler source no longer produces ${c}; update this test and the description`);
  }
  const errorSchema = readJson(join(SCHEMAS, 'error.schema.json'));
  for (const c of codes) assert.ok(String(errorSchema['description']).includes(c), `error code ${c} is not documented in error.schema.json`);
  const documented = new Set(operations().flatMap((o) => Object.keys(o.op['responses'] as Obj).map(Number)));
  const info = String((spec['info'] as Obj)['description']);
  for (const s of statuses) assert.ok(documented.has(s) || info.includes(String(s)), `status ${s} is not documented`);
});

test('openapi: the bundled document is self-contained and equivalent', () => {
  const read = (f: string) => readJson(join(SCHEMAS, f)) as never;
  const bundled = bundleOpenApi(spec as never, read) as Obj;
  const text = JSON.stringify(bundled);
  assert.ok(!/"\$ref":"[^#]/.test(text), 'no external references remain');
  assert.ok(!text.includes('"$id"'), 'embedded schemas carry no $id');
  const schemas = (bundled['components'] as Obj)['schemas'] as Obj;
  for (const f of ['job.schema.json', 'capabilities.schema.json', 'error.schema.json', 'analysis-report.schema.json']) {
    assert.ok(schemas[componentName(f)], f);
  }
  // validate the examples against the bundled document alone: no schema files registered
  const reg = registry(bundled, false);
  for (const o of operations(bundled)) {
    for (const status of Object.keys(o.op['responses'] as Obj)) {
      const r = deref(bundled, (o.op['responses'] as Obj)[status], `${o.pointer}/responses/${status}`);
      for (const [mediaType, media] of Object.entries((r.node['content'] ?? {}) as Record<string, Obj>)) {
        reg.assertSupported(`${DOC_URI}#${r.pointer}/content/${escape(mediaType)}/schema`);
        for (const [name, e] of Object.entries((media['examples'] ?? {}) as Record<string, Obj>)) {
          assert.deepEqual(reg.validate(`${DOC_URI}#${r.pointer}/content/${escape(mediaType)}/schema`, e['value']), [], `${o.pointer} ${status} ${name}`);
        }
      }
    }
  }
  assert.throws(() => bundleOpenApi({ a: { $ref: '../secret.json' } }, read), /unexpected schema reference/);
});

interface Res {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

function call(port: number, method: string, path: string, opts: { body?: string | Buffer; headers?: Record<string, string> } = {}): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers: { ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}), ...opts.headers } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'EPIPE' || e.code === 'ECONNRESET') resolve({ status: -1, headers: {}, body: Buffer.alloc(0) });
      else reject(e);
    });
    if (opts.body !== undefined) req.end(opts.body);
    else req.end();
  });
}

/**
 * Checks a live response against the description: its status and media type
 * are documented for the operation, and a JSON body validates against the
 * schema. `seen` records each operation/status pair checked.
 */
function conformer(): { conform: (operationId: string, res: Res) => unknown; seen: Set<string> } {
  const reg = registry();
  const byId = new Map(operations().map((o) => [String(o.op['operationId']), o]));
  const seen = new Set<string>();
  const conform = (operationId: string, res: Res): unknown => {
    const o = byId.get(operationId)!;
    const type = String(res.headers['content-type'] ?? '').split(';')[0]!.trim();
    const { pointer, documented } = responseSchema(spec, o, res.status, type);
    assert.ok(documented, `${operationId}: ${res.status} ${type} is not documented`);
    seen.add(`${operationId} ${res.status}`);
    if (type !== 'application/json') return null;
    const body = JSON.parse(res.body.toString('utf8')) as unknown;
    assert.deepEqual(reg.validate(`${DOC_URI}#${pointer}`, body), [], `${operationId} ${res.status}`);
    return body;
  };
  return { conform, seen };
}

function assertExercised(seen: Set<string>, required: string[]): void {
  for (const s of required) assert.ok(seen.has(s), `not exercised: ${s}`);
}

test('openapi: live responses of the service conform to the description', async () => {
  const { root, env } = makeFixture();
  cpSync(SCHEMAS, join(root, 'schemas'), { recursive: true });
  const jobs = new JobManager({ env });
  const server = createApp({ env, jobs, host: '127.0.0.1', port: 0, webDist: null });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;
  const { conform, seen } = conformer();
  try {
    conform('getCapabilities', await call(port, 'GET', '/api/capabilities'));
    const served = conform('getOpenApi', await call(port, 'GET', '/api/openapi.json')) as Obj;
    assert.equal(served['openapi'], '3.1.0');
    assert.ok(!/"\$ref":"[^#]/.test(JSON.stringify(served)), 'the served document has no external references');
    conform('getWebUi', await call(port, 'GET', '/'));

    conform('submitAnalysis', await call(port, 'POST', '/api/analyses', { body: '{not json' }));
    conform('submitAnalysis', await call(port, 'POST', '/api/analyses', { body: JSON.stringify({ design: { ...AES_DESIGN, rounds: 3 } }) }));
    conform('submitAnalysis', await call(port, 'POST', '/api/analyses', { body: '{}', headers: { 'content-type': 'text/plain' } }));
    // a declared length over the limit is refused before any body is read
    const declared = await call(port, 'POST', '/api/analyses', { body: '', headers: { 'content-length': String(300 * 1024) } });
    assert.equal(declared.status, 413);
    conform('submitAnalysis', declared);
    // an oversized upload may instead see the connection closed before the answer arrives
    const big = await call(port, 'POST', '/api/analyses', { body: Buffer.alloc(300 * 1024, 0x20) });
    if (big.status !== -1) conform('submitAnalysis', big);
    conform('submitExperiment', await call(port, 'POST', '/api/experiments', { body: JSON.stringify({ design: AES_DESIGN, profile: 'fast' }) }));
    conform('submitAnalysis', await call(port, 'POST', '/api/analyses', { body: JSON.stringify({ design: AES_DESIGN }), headers: { origin: 'http://evil.example' } }));
    conform('getCapabilities', await call(port, 'GET', '/api/capabilities', { headers: { host: `evil.example:${port}` } }));

    const accepted = await call(port, 'POST', '/api/analyses', { body: JSON.stringify({ design: AES_DESIGN }) });
    const id = (conform('submitAnalysis', accepted) as { job: { id: string } }).job.id;
    assert.equal(accepted.headers['location'], `/api/jobs/${id}`);
    // 409 while the job runs is checked deterministically in the next test
    const early = await call(port, 'GET', `/api/jobs/${id}/bundle`);
    if (early.status === 409) conform('getJobBundle', early);
    await jobs.idle();
    const done = conform('getJob', await call(port, 'GET', `/api/jobs/${id}`)) as { state: string; bundle: boolean };
    assert.equal(done.state, 'completed');
    assert.equal(done.bundle, true);
    const bundle = await call(port, 'GET', `/api/jobs/${id}/bundle`);
    conform('getJobBundle', bundle);
    assert.match(String(bundle.headers['content-disposition']), new RegExp(`cryptificate-${id}\\.tar\\.gz`));
    const html = await call(port, 'GET', `/api/jobs/${id}/report.html`);
    conform('getJobReportHtml', html);
    assert.match(String(html.headers['content-disposition']), new RegExp(`cryptificate-${id}\\.html`));
    assert.ok(String(html.headers['content-security-policy']).includes("default-src 'none'"));
    conform('stopJob', await call(port, 'POST', `/api/jobs/${id}/stop`));

    const missing = 'f'.repeat(32);
    conform('getJob', await call(port, 'GET', `/api/jobs/${missing}`));
    conform('stopJob', await call(port, 'POST', `/api/jobs/${missing}/stop`));
    conform('getJobBundle', await call(port, 'GET', `/api/jobs/${missing}/bundle`));
    conform('getJobReportHtml', await call(port, 'GET', `/api/jobs/${missing}/report.html`));

    // methods the description does not list are not served on described paths:
    // GET and POST answer 404 (as for an unknown path), every other method 405,
    // and no answer carries an Allow header (as the info description states)
    for (const [path, item] of Object.entries(paths)) {
      if (!path.startsWith('/api/')) continue;
      const concrete = path.replace('{id}', id);
      for (const m of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']) {
        if (item[m.toLowerCase()]) continue;
        const r = await call(port, m, concrete, m === 'POST' || m === 'PUT' || m === 'PATCH' ? { body: '{}' } : {});
        const want = m === 'GET' || m === 'POST' ? [404, 'not-found'] : [405, 'method-not-allowed'];
        assert.equal(r.status, want[0], `${m} ${path}`);
        assert.equal(r.headers['allow'], undefined, `${m} ${path}`);
        if (m !== 'HEAD') assert.equal(JSON.parse(r.body.toString('utf8')).error.code, want[1], `${m} ${path}`);
      }
    }
    const info = String((spec['info'] as Obj)['description']);
    assert.ok(info.includes('404 `not-found` when its method is GET or POST, and 405 `method-not-allowed` for any other method'), 'the fallback rule is stated in info.description');
    assertExercised(seen, [
      'getCapabilities 200',
      'getCapabilities 403',
      'getOpenApi 200',
      'getWebUi 200',
      'submitAnalysis 202',
      'submitAnalysis 400',
      'submitAnalysis 403',
      'submitAnalysis 413',
      'submitAnalysis 415',
      'submitExperiment 400',
      'getJob 200',
      'getJob 404',
      'getJobBundle 200',
      'getJobBundle 404',
      'getJobReportHtml 200',
      'getJobReportHtml 404',
      'stopJob 200',
      'stopJob 404',
    ]);
  } finally {
    jobs.stopAll();
    await jobs.idle();
    await new Promise<void>((r) => server.close(() => r()));
    rmSync(root, { recursive: true, force: true });
  }
});

/** A pipeline that holds the single run slot until stopped or released, publishing a partial report. */
function blockingPipeline(release: Promise<void>) {
  return async (_env: PipelineEnv, ctx: JobContext): Promise<PipelineResult> => {
    ctx.start('validate');
    ctx.finish('validate', 'completed');
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
    const state = ctx.cancelled ? ('cancelled' as const) : ('completed' as const);
    ctx.closeRemaining(ctx.cancelled ? 'cancelled' : 'not_run');
    const r = { ...partial, execution: { state, steps: ctx.executionSteps() } };
    ctx.setReport(r);
    return { state, report: r };
  };
}

test('openapi: queued, running and cancelled jobs answer as described', async () => {
  const { root, env } = makeFixture();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const pipeline = blockingPipeline(gate);
  const jobs = new JobManager({ env, pipelines: { analysis: pipeline, experiment: pipeline } });
  const server = createApp({ env, jobs, host: '127.0.0.1', port: 0, webDist: null });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;
  const { conform, seen } = conformer();
  const submit = async (operationId: 'submitAnalysis' | 'submitExperiment'): Promise<Res> =>
    operationId === 'submitAnalysis'
      ? call(port, 'POST', '/api/analyses', { body: JSON.stringify({ design: AES_DESIGN }) })
      : call(port, 'POST', '/api/experiments', { body: JSON.stringify({ design: AES_DESIGN, profile: 'quick' }) });
  const error = (res: Res): { code: string; message: string } => (JSON.parse(res.body.toString('utf8')) as { error: { code: string; message: string } }).error;
  try {
    // the first job takes the run slot and holds it until stopped
    const first = (conform('submitAnalysis', await submit('submitAnalysis')) as { job: { id: string } }).job.id;
    const second = (conform('submitExperiment', await submit('submitExperiment')) as { job: { id: string } }).job.id;
    const running = conform('getJob', await call(port, 'GET', `/api/jobs/${first}`)) as { state: string };
    assert.equal(running.state, 'running');
    const queued = conform('getJob', await call(port, 'GET', `/api/jobs/${second}`)) as { state: string; queuePosition?: number };
    assert.equal(queued.state, 'queued');
    assert.equal(queued.queuePosition, 1);

    for (const id of [first, second]) {
      const notYet = await call(port, 'GET', `/api/jobs/${id}/bundle`);
      assert.equal(notYet.status, 409);
      conform('getJobBundle', notYet);
      assert.deepEqual(error(notYet), { code: 'not-ready', message: 'the job has not finished' });
      const htmlNotYet = await call(port, 'GET', `/api/jobs/${id}/report.html`);
      assert.equal(htmlNotYet.status, 409);
      conform('getJobReportHtml', htmlNotYet);
      assert.deepEqual(error(htmlNotYet), { code: 'not-ready', message: 'the job has not finished' });
    }

    // one job runs and two wait: a further submission is refused
    const third = (conform('submitAnalysis', await submit('submitAnalysis')) as { job: { id: string } }).job.id;
    for (const operationId of ['submitAnalysis', 'submitExperiment'] as const) {
      const full = await submit(operationId);
      assert.equal(full.status, 429);
      assert.equal(full.headers['retry-after'], '30');
      conform(operationId, full);
      assert.equal(error(full).code, 'queue-full');
    }

    // a queued job that is stopped never runs and has no report, hence no bundle
    conform('stopJob', await call(port, 'POST', `/api/jobs/${second}/stop`));
    const cancelled = conform('getJob', await call(port, 'GET', `/api/jobs/${second}`)) as { state: string; bundle: boolean; report: unknown };
    assert.deepEqual([cancelled.state, cancelled.bundle, cancelled.report], ['cancelled', false, null]);
    const none = await call(port, 'GET', `/api/jobs/${second}/bundle`);
    assert.equal(none.status, 409);
    conform('getJobBundle', none);
    assert.deepEqual(error(none), { code: 'not-ready', message: 'the job ended before it produced a report' });
    const noHtml = await call(port, 'GET', `/api/jobs/${second}/report.html`);
    conform('getJobReportHtml', noHtml);
    assert.deepEqual(error(noHtml), { code: 'not-ready', message: 'the job ended before it produced a report' });

    // a running job that is stopped keeps its partial report, which has a bundle
    conform('stopJob', await call(port, 'POST', `/api/jobs/${first}/stop`));
    release();
    await jobs.idle();
    const stopped = conform('getJob', await call(port, 'GET', `/api/jobs/${first}`)) as { state: string; bundle: boolean };
    assert.deepEqual([stopped.state, stopped.bundle], ['cancelled', true]);
    conform('getJobBundle', await call(port, 'GET', `/api/jobs/${first}/bundle`));
    const after = conform('getJob', await call(port, 'GET', `/api/jobs/${third}`)) as { state: string };
    assert.equal(after.state, 'completed');

    assertExercised(seen, ['submitAnalysis 202', 'submitExperiment 202', 'submitAnalysis 429', 'submitExperiment 429', 'getJob 200', 'getJobBundle 409', 'getJobBundle 200', 'getJobReportHtml 409', 'stopJob 200']);
  } finally {
    release();
    jobs.stopAll();
    await jobs.idle();
    await new Promise<void>((r) => server.close(() => r()));
    rmSync(root, { recursive: true, force: true });
  }
});

test('openapi: a checkout without the description answers 404', async () => {
  const { root, env } = makeFixture();
  const jobs = new JobManager({ env });
  const server = createApp({ env, jobs, host: '127.0.0.1', port: 0, webDist: null });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  try {
    const res = await call((server.address() as AddressInfo).port, 'GET', '/api/openapi.json');
    assert.equal(res.status, 404);
    assert.equal(JSON.parse(res.body.toString()).error.code, 'not-found');
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    rmSync(root, { recursive: true, force: true });
  }
});
