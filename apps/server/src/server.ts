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
import { LIMITS, MODELS, validateAnalysisRequest, validateExperimentRequest } from '@cryptificate/schema';
import type { Capabilities, ErrorResponse, ExperimentProfile, ValidationIssue } from '@cryptificate/schema';
import { ANALYSIS_BUDGET_MS } from './analysis.js';
import { buildBundle } from './bundle.js';
import type { PipelineEnv } from './context.js';
import { PROFILE_BUDGETS } from './experiment.js';
import { JobManager, QueueFullError } from './jobs.js';
import { LEAN_TIMEOUT_MS } from './leanrun.js';

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

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
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

function sendError(res: ServerResponse, status: number, code: string, message: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}): void {
  const body: ErrorResponse & Record<string, unknown> = { error: { code, message }, ...extra };
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
  return new HttpError(400, 'invalid-request', first ? `${first.path}: ${first.message}` : 'invalid request', {
    errors,
  });
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
  const engine: Capabilities['toolchain']['engine'] = env.engine.available
    ? { available: true, subcommands }
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
  const policy = makeOriginPolicy(opts.host, opts.port, opts.allowedOrigins ?? []);
  const webDist = opts.webDist ?? null;

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('cross-origin-resource-policy', 'same-origin');
    const rejected = checkRequestOrigin(req, policy);
    if (rejected) {
      sendError(res, 403, 'forbidden', rejected);
      req.resume();
      return;
    }
    const method = (req.method ?? 'GET').toUpperCase();
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;

    if (path.startsWith('/api/')) {
      const parts = path.split('/').filter(Boolean); // ['api', ...]
      if (path === '/api/capabilities' && method === 'GET') {
        send(res, 200, await capabilities(env));
        return;
      }
      if ((path === '/api/analyses' || path === '/api/experiments') && method === 'POST') {
        const body = await parseJsonBody(req);
        const kind = path === '/api/analyses' ? 'analysis' : 'experiment';
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
      if (parts[1] === 'jobs' && parts.length >= 3) {
        const rec = jobs.get(parts[2] ?? '');
        if (!rec) {
          sendError(res, 404, 'not-found', 'no such job');
          return;
        }
        if (parts.length === 3 && method === 'GET') {
          send(res, 200, jobs.view(rec));
          return;
        }
        if (parts.length === 4 && parts[3] === 'stop' && method === 'POST') {
          req.resume();
          jobs.stop(rec.id);
          send(res, 200, { job: jobs.summary(rec) });
          return;
        }
        if (parts.length === 4 && parts[3] === 'bundle' && method === 'GET') {
          const view = jobs.view(rec);
          if (!view.bundle || !view.report) {
            sendError(res, 409, 'not-ready', view.state === 'invalid' ? 'invalid requests have no bundle' : 'the job has not finished');
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
      }
      sendError(res, method === 'GET' || method === 'POST' ? 404 : 405, method === 'GET' || method === 'POST' ? 'not-found' : 'method-not-allowed', 'no such endpoint');
      req.resume();
      return;
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

  return createServer((req, res) => {
    handle(req, res).catch((e: unknown) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (e instanceof HttpError) {
        sendError(res, e.status, e.code, e.message, e.extra, e.status === 413 ? { connection: 'close' } : {});
      } else {
        sendError(res, 500, 'internal', 'internal error');
      }
    });
  });
}

function readInputs(dir: string): unknown {
  try {
    return JSON.parse(readFileSync(join(dir, 'inputs.json'), 'utf8')) as unknown;
  } catch {
    return undefined;
  }
}
