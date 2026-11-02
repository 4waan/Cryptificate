import { canonicalJson, normalizeAnalysisRequest } from './canonical';
import { validateProgram } from './circuit';
import { validateDesign } from './design';
import { parseImport } from './importer';
import { fieldTarget, type Snapshot } from './snapshot';

/**
 * Share links carry the canonical analysis request (design, circuit and
 * target) in the URL hash: "#/workspace?d=<token>". The hash never reaches
 * a server, so links work on the static replay build too.
 *
 * Token: "z" + base64url(deflate-raw(canonical JSON)) where the browser
 * offers CompressionStream, otherwise "j" + base64url(canonical JSON).
 */

export const SHARE_PARAM = 'd';
/** Longest token accepted when opening a link. */
export const MAX_TOKEN_LENGTH = 24_000;
/** Largest decoded request accepted. */
export const MAX_DECODED_BYTES = 128 * 1024;

export class ShareError extends Error {}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new ShareError('The link contains characters a share link never has.');
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  let bin: string;
  try {
    bin = atob(b64);
  } catch {
    throw new ShareError('The link is cut off or damaged.');
  }
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const canCompress = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit: number): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  void writer.write(bytes as unknown as BufferSource).catch(() => undefined);
  void writer.close().catch(() => undefined);
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new ShareError('The design in this link is too large.');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** The canonical request text a link carries. Throws when the inputs have problems. */
export function shareJson(s: Snapshot): string {
  const problems = [
    ...validateDesign(s.design),
    ...(s.program ? validateProgram(s.program, s.design.width) : []),
  ];
  if (problems.length) throw new ShareError(`Fix the inputs before sharing: ${problems[0]!.message}`);
  const req = normalizeAnalysisRequest({
    design: s.design,
    program: s.program ?? undefined,
    target: s.program ? fieldTarget(s.design, s.target) : undefined,
  });
  return canonicalJson(req);
}

export async function encodeShare(s: Snapshot, compress = canCompress()): Promise<string> {
  const bytes = new TextEncoder().encode(shareJson(s));
  if (compress) {
    const packed = await pipe(bytes, new CompressionStream('deflate-raw'), MAX_DECODED_BYTES);
    if (packed.length < bytes.length) return `z${toBase64Url(packed)}`;
  }
  return `j${toBase64Url(bytes)}`;
}

/** Reads a token back into workspace inputs, with the same checks as an import. */
export async function decodeShare(token: string): Promise<Snapshot> {
  if (token.length > MAX_TOKEN_LENGTH) throw new ShareError('The link is too long to be a Cryptificate share link.');
  const kind = token[0];
  const body = fromBase64Url(token.slice(1));
  let bytes: Uint8Array;
  if (kind === 'z') {
    if (!canCompress()) throw new ShareError('This browser cannot open compressed share links.');
    try {
      bytes = await pipe(body, new DecompressionStream('deflate-raw'), MAX_DECODED_BYTES);
    } catch (e) {
      throw e instanceof ShareError ? e : new ShareError('The link is cut off or damaged.');
    }
  } else if (kind === 'j') {
    bytes = body;
  } else {
    throw new ShareError('This is not a Cryptificate share link.');
  }
  if (bytes.length > MAX_DECODED_BYTES) throw new ShareError('The design in this link is too large.');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ShareError('The link is cut off or damaged.');
  }
  let imported;
  try {
    imported = parseImport(text);
  } catch (e) {
    throw new ShareError(`The link does not hold a valid request (${e instanceof Error ? e.message : 'unreadable'}).`);
  }
  if (!imported.design) throw new ShareError('The link does not contain a design.');
  const snapshot: Snapshot = {
    design: imported.design,
    program: imported.program ?? null,
    target: fieldTarget(imported.design, imported.target),
  };
  const problems = [
    ...validateDesign(snapshot.design),
    ...(snapshot.program ? validateProgram(snapshot.program, snapshot.design.width) : []),
  ];
  if (snapshot.program && snapshot.program.field !== snapshot.design.field) {
    problems.push({ path: '/program/field', message: 'The circuit and the design use different fields.' });
  }
  if (problems.length) throw new ShareError(`The design in the link has a problem: ${problems[0]!.message}`);
  return snapshot;
}

/** "https://host/path/#/workspace?d=<token>" from the page's location without its hash. */
export function shareUrl(locationWithoutHash: string, token: string): string {
  return `${locationWithoutHash}#/workspace?${SHARE_PARAM}=${token}`;
}
