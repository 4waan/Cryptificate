import { afterEach, describe, expect, it, vi } from 'vitest';
import { aesDesign } from '../lib/presets';
import { ApiError, createJob } from './api';

function respond(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('service errors', () => {
  it('reads a validation error as the service sends it: message, code and the first issue path', async () => {
    // The body apps/server sends for a 400 (server.ts invalid() and sendError; checked in its http.test.ts).
    respond(400, {
      error: { code: 'invalid-request', message: '/design/rounds: expected an integer in 1..32', path: '/design/rounds' },
      errors: [{ path: '/design/rounds', code: 'range', message: 'expected an integer in 1..32' }],
    });
    const e = (await createJob('analysis', { design: aesDesign() }).catch((x: unknown) => x)) as ApiError;
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 400, code: 'invalid-request', path: '/design/rounds', message: 'expected an integer in 1..32' });
  });

  it('takes the path from errors[] when the error object has none', async () => {
    respond(400, {
      error: { code: 'invalid-request', message: '/program/0/op: unknown field "op"' },
      errors: [{ path: '/program/0/op', code: 'unknown-field', message: 'unknown field "op"' }],
    });
    const e = (await createJob('analysis', { design: aesDesign() }).catch((x: unknown) => x)) as ApiError;
    expect(e).toMatchObject({ path: '/program/0/op', message: 'unknown field "op"' });
  });

  it('keeps a message without a path as it is', async () => {
    respond(400, { error: { code: 'bad-json', message: 'request body is not valid JSON' } });
    const e = (await createJob('analysis', { design: aesDesign() }).catch((x: unknown) => x)) as ApiError;
    expect(e).toMatchObject({ code: 'bad-json', path: undefined, message: 'request body is not valid JSON' });
  });
});
