/**
 * Local HTTP service. Loopback only by default; requests must carry a
 * loopback Host header, state-changing requests must be same-origin, and
 * JSON bodies are limited to 256 KiB and shape-checked before the engine
 * sees them.
 */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { LIMITS, MODELS, TERMINAL_JOB_STATES, validateAnalysisRequest, validateExperimentRequest } from '@cryptificate/schema';
import type { Capabilities, ErrorResponse, ExperimentProfile, ValidationIssue } from '@cryptificate/schema';
import { ANALYSIS_BUDGET_MS } from './analysis.js';
import { REPORT_HTML_CSP, reportHtmlFileName } from '@cryptificate/schema';
import { buildBundle, bundleReportHtml } from './bundle.js';
import type { PipelineEnv } from './context.js';
import { PROFILE_BUDGETS } from './experiment.js';
import { JobManager, QueueFullError } from './jobs.js';
import { LEAN_TIMEOUT_MS } from './leanrun.js';
import { openApiDocument } from './openapi.js';

export interface ServerOptions {
  env: PipelineEnv;
  jobs: JobManager;
  host: string;
  port: number;
  /** Extra origins allowed to POST (e.g. a development UI server). */
  allowedOrigins?: string[];
  /** Serve the built web UI from this directory when it exists. */
  webDist?: string | null;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/** Bind addresses that keep the service on the loopback interface. */
export const LOOPBACK_BIND_ADDRESSES: readonly string[] = ['127.0.0.1', 'localhost', '::1'];

/**
 * The address `serve` binds: `--host` when given, else `CRYPTIFICATE_HOST`,
 * else 127.0.0.1. Nothing else widens it: the container image keeps the
 * loopback default, and binding all interfaces takes one of these explicitly.
 */
export function serveHost(flag: string | undefined, env: Readonly<Record<string, string | undefined>>): string {
  if (flag !== undefined && flag.trim() !== '') return flag.trim();
  const fromEnv = env['CRYPTIFICATE_HOST']?.trim();
  return fromEnv ? fromEnv : '127.0.0.1';
}

/**
 * Lines `serve` prints about its bind address and port: a warning for any
 * address other than loopback, and inside the container image (which sets
 * CRYPTIFICATE_CONTAINER=1) how to reach the service from the host and, when
 * --port differs from PORT, that the image's health check polls PORT.
 */
export function bindNotes(host: string, port: number, env: Readonly<Record<string, string | undefined>>): string[] {
  const inContainer = env['CRYPTIFICATE_CONTAINER'] === '1';
  const notes: string[] = [];
  if (!LOOPBACK_BIND_ADDRESSES.includes(host)) {
    notes.push(`warning: binding to ${host}. The service has no authentication; anyone who can reach this address can run jobs.`);
    if (inContainer) {
      notes.push(
        `note: publish the port on the host's loopback interface only (docker run -p 127.0.0.1:${port}:${port}) and open http://127.0.0.1:${port}/. ` +
          'Writes are accepted only from that origin, so keep the same port number on both sides.',
      );
    }
  } else if (inContainer) {
    notes.push(
      "note: listening on the container's own loopback interface, which a published port (docker run -p) does not reach. " +
        `To open the workbench from the host, start the container with --host 0.0.0.0 (or CRYPTIFICATE_HOST=0.0.0.0) and publish -p 127.0.0.1:${port}:${port}. ` +
        'See docs/docker.md.',
    );
  }
  const healthPort = env['PORT']?.trim() || '4173';
  if (inContainer && String(port) !== healthPort) {
    notes.push(
      `note: the image's health check polls port ${healthPort} (the PORT variable), not ${port}, so Docker will report this container unhealthy. ` +
        `Set the port with -e PORT=${port} instead of --port.`,
    );
  }
  return notes;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.gz': 'application/gzip',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
};

/**
 * Every API route the service answers. The handler dispatches through this
 * table, and schemas/openapi.json describes exactly these operations (a test
 * checks both directions). A request under /api/ that matches no route (an
 * unknown path, or a listed path with another method) answers 404 for GET and
 * POST and 405 for any other method, HEAD included; no Allow header is sent.
 */
export const API_ROUTES = [
  { method: 'GET', path: '/api/capabilities', operationId: 'getCapabilities' },
  { method: 'GET', path: '/api/openapi.json', operationId: 'getOpenApi' },
  { method: 'POST', path: '/api/analyses', operationId: 'submitAnalysis' },
  { method: 'POST', path: '/api/experiments', operationId: 'submitExperiment' },
  { method: 'GET', path: '/api/jobs/{id}', operationId: 'getJob' },
  { method: 'POST', path: '/api/jobs/{id}/stop', operationId: 'stopJob' },
  { method: 'GET', path: '/api/jobs/{id}/bundle', operationId: 'getJobBundle' },
  { method: 'GET', path: '/api/jobs/{id}/report.html', operationId: 'getJobReportHtml' },
] as const;

export type ApiRoute = (typeof API_ROUTES)[number];

/** Match a request against API_ROUTES; `{name}` matches one non-empty path segment. */
export function matchApiRoute(method: string, path: string): (ApiRoute & { params: Record<string, string> }) | null {
  const segments = path.split('/');
  for (const route of API_ROUTES) {
    if (route.method !== method) continue;
    const pattern = route.path.split('/');
    if (pattern.length !== segments.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < pattern.length && ok; i++) {
      const p = pattern[i] ?? '';
      const seg = segments[i] ?? '';
      if (p.startsWith('{') && p.endsWith('}')) {
        if (seg === '') ok = false;
        else params[p.slice(1, -1)] = seg;
      } else ok = p === seg;
    }
    if (ok) return { ...route, params };
  }
  return null;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
    /** JSON Pointer to the offending part of the request, sent as `error.path`. */
    readonly path?: string,
  ) {
    super(message);
  }
}

/** Hostname part of a Host header value ("127.0.0.1:4173" -> "127.0.0.1"). */
export function hostName(hostHeader: string): string {
  const h = hostHeader.trim().toLowerCase();
  if (h.startsWith('[')) {
    const end = h.indexOf(']');
    return end > 0 ? h.slice(0, end + 1) : h;
  }
  const colon = h.lastIndexOf(':');
  return colon >= 0 ? h.slice(0, colon) : h;
}

export interface OriginPolicy {
  allowedHosts: Set<string>;
  port: number;
  allowedOrigins: Set<string>;
}

export function makeOriginPolicy(host: string, port: number, extraOrigins: readonly string[] = []): OriginPolicy {
  const allowedHosts = new Set(LOOPBACK_HOSTS);
  const h = host.toLowerCase();
  if (h !== '0.0.0.0' && h !== '::' && h !== '') allowedHosts.add(h.includes(':') && !h.startsWith('[') ? `[${h}]` : h);
  return { allowedHosts, port, allowedOrigins: new Set(extraOrigins.map((o) => o.replace(/\/+$/, '').toLowerCase())) };
}

/** Returns an error message when the request fails the Host/Origin policy. */
export function checkRequestOrigin(req: Pick<IncomingMessage, 'method' | 'headers'>, policy: OriginPolicy): string | null {
  const host = req.headers.host;
  if (!host || !policy.allowedHosts.has(hostName(host))) return 'Host header is not a loopback address';
  const method = (req.method ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null;
  const site = req.headers['sec-fetch-site'];
  const origin = req.headers.origin;
  if (origin !== undefined) {
    const o = String(origin).toLowerCase();
    if (policy.allowedOrigins.has(o)) return null;
    let url: URL;
    try {
      url = new URL(o);
    } catch {
      return 'cross-origin request rejected';
    }
    const port = url.port === '' ? (url.protocol === 'https:' ? 443 : 80) : Number(url.port);
    const sameHost = policy.allowedHosts.has(url.hostname.startsWith('[') ? url.hostname : url.hostname.includes(':') ? `[${url.hostname}]` : url.hostname);
    if (url.protocol !== 'http:' || !sameHost || port !== policy.port) return 'cross-origin request rejected';
    return null;
  }
  if (site !== undefined && site !== 'same-origin' && site !== 'none') return 'cross-site request rejected';
  return null;
}

/** Read a request body up to `limit` bytes; throws HttpError(413) beyond. */
export function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const declared = req.headers['content-length'];
    if (declared !== undefined && Number(declared) > limit) {
      reject(new HttpError(413, 'body-too-large', `request body exceeds ${limit} bytes`));
      req.resume();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let failed = false;
    req.on('data', (c: Buffer) => {
      if (failed) return;
      size += c.length;
      if (size > limit) {
        failed = true;
        reject(new HttpError(413, 'body-too-large', `request body exceeds ${limit} bytes`));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!failed) resolve(Buffer.concat(chunks));
    });
    req.on('error', (e) => {
      if (!failed) reject(e);
    });
  });
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(text)),
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(text);
}

function sendError(
  res: ServerResponse,
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
  path?: string,
): void {
  const body: ErrorResponse & Record<string, unknown> = { error: path === undefined ? { code, message } : { code, message, path }, ...extra };
  send(res, status, body, headers);
}

async function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  const type = String(req.headers['content-type'] ?? '').toLowerCase();
  if (!type.startsWith('application/json')) {
    throw new HttpError(415, 'unsupported-media-type', 'expected Content-Type: application/json');
  }
  const body = await readBody(req, LIMITS.maxBodyBytes);
  try {
    return JSON.parse(body.toString('utf8')) as unknown;
  } catch {
    throw new HttpError(400, 'bad-json', 'request body is not valid JSON');
  }
}

function invalid(errors: ValidationIssue[]): HttpError {
  const first = errors[0];
  return new HttpError(400, 'invalid-request', first ? `${first.path}: ${first.message}` : 'invalid request', { errors }, first?.path);
}

export async function capabilities(env: PipelineEnv): Promise<Capabilities> {
  const tc = await env.toolchain();
  const subcommands = await env.engine.subcommands();
  const leanBuilt = existsSync(join(env.paths.leanDir, '.lake', 'build', 'lib'));
  const lean: Capabilities['toolchain']['lean'] = env.lake
    ? { available: true, version: tc.pins.lean, ...(leanBuilt ? {} : { detail: 'the trusted Lean library has not been built yet (scripts/setup.sh)' }) }
    : { available: false, detail: 'lake was not found (scripts/setup.sh installs it)' };
  const rust: Capabilities['toolchain']['rust'] =
    tc.pins.rustc === 'unavailable' ? { available: false, detail: 'rustc was not found' } : { available: true, version: tc.pins.rustc };
  const engineVersion = env.engine.available ? await env.engine.version() : undefined;
  const engine: Capabilities['toolchain']['engine'] = env.engine.available
    ? { available: true, subcommands, ...(engineVersion ? { version: engineVersion } : {}) }
    : { available: false, subcommands: [], detail: 'cryptificate-engine is not built (cargo build --release)' };
  return {
    name: 'cryptificate',
    version: tc.version,
    checker: tc.checker,
    models: [...MODELS],
    profiles: (Object.keys(PROFILE_BUDGETS) as ExperimentProfile[]).map((id) => ({
      id,
      label: id === 'quick' ? 'Quick' : 'Research',
      budget: { ...PROFILE_BUDGETS[id] },
    })),
    limits: {
      maxBodyBytes: LIMITS.maxBodyBytes,
      maxInstructions: LIMITS.maxInstructions,
      maxQueued: LIMITS.maxQueued,
      leanTimeoutSeconds: Math.round((env.leanTimeoutMs ?? LEAN_TIMEOUT_MS) / 1000),
      analysisBudgetSeconds: Math.round((env.analysisBudgetMs ?? ANALYSIS_BUDGET_MS) / 1000),
    },
    toolchain: { lean, rust, engine, pins: tc.pins },
  };
}

function serveStatic(res: ServerResponse, root: string, urlPath: string, head: boolean): boolean {
  let rel: string;
  try {
    rel = decodeURIComponent(urlPath);
  } catch {
    return false;
  }
  if (rel.includes('\0')) return false;
  const target = normalize(join(root, rel));
  if (target !== root && !target.startsWith(root + sep)) return false;
  let file = target;
  try {
    if (statSync(file).isDirectory()) file = join(file, 'index.html');
  } catch {
    // SPA fallback: unknown paths without an extension get index.html
    if (extname(rel) !== '') return false;
    file = join(root, 'index.html');
  }
  let st;
  try {
    st = statSync(file);
  } catch {
    return false;
  }
  if (!st.isFile()) return false;
  const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
  const immutable = file.includes(`${sep}assets${sep}`);
  res.writeHead(200, {
    'content-type': type,
    'content-length': String(st.size),
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (head) res.end();
  else createReadStream(file).pipe(res);
  return true;
}

const NO_UI_PAGE = `<!doctype html><meta charset="utf-8"><title>Cryptificate</title>
<body style="font-family:system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem">
<h1>Cryptificate</h1><p>The service is running, but the web UI has not been built.</p>
<p>Run <code>npm run build -w apps/web</code> and reload, or use the API under <code>/api/</code>.</p></body>`;

export function createApp(opts: ServerOptions): Server {
  const { env, jobs } = opts;
  const webDist = opts.webDist ?? null;
  let policy: OriginPolicy | null = opts.port === 0 ? null : makeOriginPolicy(opts.host, opts.port, opts.allowedOrigins ?? []);
  // With port 0 the policy is fixed once the listening port is known.
  const currentPolicy = (): OriginPolicy => {
    if (!policy) {
      const addr = server.address();
      const port = addr && typeof addr === 'object' ? addr.port : 0;
      policy = makeOriginPolicy(opts.host, port, opts.allowedOrigins ?? []);
    }
    return policy;
  };

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('cross-origin-resource-policy', 'same-origin');
    const rejected = checkRequestOrigin(req, currentPolicy());
    if (rejected) {
      sendError(res, 403, 'forbidden', rejected);
      req.resume();
      return;
    }
    const method = (req.method ?? 'GET').toUpperCase();
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;

    if (path.startsWith('/api/')) {
      const route = matchApiRoute(method, path);
      if (!route) {
        const known = method === 'GET' || method === 'POST';
        sendError(res, known ? 404 : 405, known ? 'not-found' : 'method-not-allowed', 'no such endpoint');
        req.resume();
        return;
      }
      switch (route.operationId) {
        case 'getCapabilities':
          send(res, 200, await capabilities(env));
          return;
        case 'getOpenApi': {
          const doc = openApiDocument(env.paths.root);
          if (doc === null) sendError(res, 404, 'not-found', 'this installation has no schemas/openapi.json');
          else send(res, 200, doc, { 'cache-control': 'no-cache' });
          return;
        }
        case 'submitAnalysis':
        case 'submitExperiment': {
          const body = await parseJsonBody(req);
          const kind = route.operationId === 'submitAnalysis' ? 'analysis' : 'experiment';
          const v = kind === 'analysis' ? validateAnalysisRequest(body) : validateExperimentRequest(body);
          if (!v.ok) throw invalid(v.errors);
          try {
            const rec = jobs.submit(kind, v.value);
            send(res, 202, { job: jobs.summary(rec) }, { location: `/api/jobs/${rec.id}` });
          } catch (e) {
            if (e instanceof QueueFullError) {
              sendError(res, 429, 'queue-full', 'one job is running and the queue is full; try again later', {}, { 'retry-after': '30' });
              return;
            }
            throw e;
          }
          return;
        }
      }
      // the remaining routes address one job
      const rec = jobs.get(route.params['id'] ?? '');
      if (!rec) {
        sendError(res, 404, 'not-found', 'no such job');
        req.resume();
        return;
      }
      switch (route.operationId) {
        case 'getJob':
          send(res, 200, jobs.view(rec));
          return;
        case 'stopJob':
          req.resume();
          jobs.stop(rec.id);
          send(res, 200, { job: jobs.summary(rec) });
          return;
        case 'getJobBundle': {
          const view = jobs.view(rec);
          if (!view.bundle || !view.report) {
            const message =
              view.state === 'invalid'
                ? 'invalid requests have no bundle'
                : TERMINAL_JOB_STATES.includes(view.state)
                  ? 'the job ended before it produced a report'
                  : 'the job has not finished';
            sendError(res, 409, 'not-ready', message);
            return;
          }
          const tc = await env.toolchain();
          const gz = buildBundle({ jobDir: rec.dir, report: view.report, toolchain: tc, paths: env.paths, inputs: readInputs(rec.dir) });
          res.writeHead(200, {
            'content-type': 'application/gzip',
            'content-length': String(gz.length),
            'content-disposition': `attachment; filename="cryptificate-${rec.id}.tar.gz"`,
            'cache-control': 'no-store',
          });
          res.end(gz);
          return;
        }
        case 'getJobReportHtml': {
          const view = jobs.view(rec);
          if (!view.bundle || !view.report) {
            const message =
              view.state === 'invalid'
                ? 'invalid requests have no report'
                : TERMINAL_JOB_STATES.includes(view.state)
                  ? 'the job ended before it produced a report'
                  : 'the job has not finished';
            sendError(res, 409, 'not-ready', message);
            return;
          }
          // Byte for byte the bundle's report.html: rendered from the bundled (path-scrubbed) report and pins.
          const html = Buffer.from(bundleReportHtml({ jobDir: rec.dir, report: view.report, toolchain: await env.toolchain(), paths: env.paths }));
          res.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'content-length': String(html.length),
            'content-disposition': `attachment; filename="${reportHtmlFileName(view.report)}"`,
            'content-security-policy': REPORT_HTML_CSP,
            'cache-control': 'no-store',
          });
          res.end(html);
          return;
        }
      }
    }

    if (method !== 'GET' && method !== 'HEAD') {
      sendError(res, 405, 'method-not-allowed', 'method not allowed');
      req.resume();
      return;
    }
    if (webDist && existsSync(join(webDist, 'index.html'))) {
      if (serveStatic(res, webDist, path, method === 'HEAD')) return;
      sendError(res, 404, 'not-found', 'not found');
      return;
    }
    if (path === '/' || path === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(method === 'HEAD' ? undefined : NO_UI_PAGE);
      return;
    }
    sendError(res, 404, 'not-found', 'not found');
  };

  const server = createServer((req, res) => {
    handle(req, res).catch((e: unknown) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (e instanceof HttpError) {
        sendError(res, e.status, e.code, e.message, e.extra, e.status === 413 ? { connection: 'close' } : {}, e.path);
      } else {
        sendError(res, 500, 'internal', 'internal error');
      }
    });
  });
  return server;
}

function readInputs(dir: string): unknown {
  try {
    return JSON.parse(readFileSync(join(dir, 'inputs.json'), 'utf8')) as unknown;
  } catch {
    return undefined;
  }
}
