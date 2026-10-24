/**
 * Minimal deterministic ustar writer and a defensive reader.
 *
 * Writer: regular files only, sorted by path, mode 0644, uid/gid 0, empty
 * owner names, mtime 0; gzip header with mtime 0 and OS byte "unknown".
 * The same entries always produce the same bytes.
 *
 * Reader: regular files only; rejects absolute paths, "..", links and
 * oversized archives.
 */
import { gunzipSync, gzipSync } from 'node:zlib';

export interface TarEntry {
  path: string;
  data: Buffer | string;
}

const BLOCK = 512;

function octal(value: number, width: number): string {
  // width includes the terminating NUL
  return value.toString(8).padStart(width - 1, '0') + '\0';
}

function writeString(buf: Buffer, offset: number, length: number, value: string): void {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length > length) throw new Error(`tar field too long: ${value}`);
  bytes.copy(buf, offset);
}

function splitName(path: string): { name: string; prefix: string } {
  if (Buffer.byteLength(path) <= 100) return { name: path, prefix: '' };
  const parts = path.split('/');
  for (let i = 1; i < parts.length; i++) {
    const prefix = parts.slice(0, i).join('/');
    const name = parts.slice(i).join('/');
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) return { name, prefix };
  }
  throw new Error(`path too long for ustar: ${path}`);
}

export function validEntryPath(path: string): boolean {
  if (!path || path.startsWith('/') || path.includes('\\') || path.includes('\0')) return false;
  return path.split('/').every((p) => p !== '' && p !== '.' && p !== '..');
}

function header(path: string, size: number): Buffer {
  const h = Buffer.alloc(BLOCK, 0);
  const { name, prefix } = splitName(path);
  writeString(h, 0, 100, name);
  writeString(h, 100, 8, octal(0o644, 8));
  writeString(h, 108, 8, octal(0, 8));
  writeString(h, 116, 8, octal(0, 8));
  writeString(h, 124, 12, octal(size, 12));
  writeString(h, 136, 12, octal(0, 12));
  h.fill(0x20, 148, 156); // checksum placeholder: spaces
  h[156] = 0x30; // '0' regular file
  writeString(h, 257, 6, 'ustar\0');
  writeString(h, 263, 2, '00');
  writeString(h, 345, 155, prefix);
  let sum = 0;
  for (const b of h) sum += b;
  writeString(h, 148, 8, sum.toString(8).padStart(6, '0') + '\0 ');
  return h;
}

export function createTar(entries: readonly TarEntry[]): Buffer {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const seen = new Set<string>();
  const parts: Buffer[] = [];
  for (const e of sorted) {
    if (!validEntryPath(e.path)) throw new Error(`invalid bundle path: ${e.path}`);
    if (seen.has(e.path)) throw new Error(`duplicate bundle path: ${e.path}`);
    seen.add(e.path);
    const data = typeof e.data === 'string' ? Buffer.from(e.data, 'utf8') : e.data;
    parts.push(header(e.path, data.length), data);
    const pad = (BLOCK - (data.length % BLOCK)) % BLOCK;
    if (pad) parts.push(Buffer.alloc(pad, 0));
  }
  parts.push(Buffer.alloc(BLOCK * 2, 0));
  return Buffer.concat(parts);
}

export function createTarGz(entries: readonly TarEntry[]): Buffer {
  const gz = gzipSync(createTar(entries), { level: 9 });
  // RFC 1952: bytes 4..7 MTIME (zlib writes 0), byte 9 OS. Fix both so
  // output does not depend on the platform zlib was built for.
  gz.writeUInt32LE(0, 4);
  gz[9] = 0xff;
  return gz;
}

export interface ReadLimits {
  maxCompressedBytes: number;
  maxTotalBytes: number;
  maxEntries: number;
}

export const DEFAULT_READ_LIMITS: ReadLimits = {
  maxCompressedBytes: 64 * 1024 * 1024,
  maxTotalBytes: 256 * 1024 * 1024,
  maxEntries: 10000,
};

function readOctal(buf: Buffer, offset: number, length: number): number {
  const s = buf.subarray(offset, offset + length).toString('ascii').replace(/[\0 ]+$/g, '').trim();
  if (s === '') return 0;
  if (!/^[0-7]+$/.test(s)) throw new Error('corrupt tar header');
  return parseInt(s, 8);
}

function readString(buf: Buffer, offset: number, length: number): string {
  const raw = buf.subarray(offset, offset + length);
  const nul = raw.indexOf(0);
  return raw.subarray(0, nul < 0 ? length : nul).toString('utf8');
}

/** Parse a .tar.gz into its regular files. Other entry types are skipped. */
export function readTarGz(gz: Buffer, limits: ReadLimits = DEFAULT_READ_LIMITS): Map<string, Buffer> {
  if (gz.length > limits.maxCompressedBytes) throw new Error('bundle is too large');
  const tar = gunzipSync(gz, { maxOutputLength: limits.maxTotalBytes });
  const files = new Map<string, Buffer>();
  let offset = 0;
  let count = 0;
  while (offset + BLOCK <= tar.length) {
    const h = tar.subarray(offset, offset + BLOCK);
    if (h.every((b) => b === 0)) break;
    if (++count > limits.maxEntries) throw new Error('bundle has too many entries');
    let sum = 0;
    for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 0x20 : h[i]!;
    if (sum !== readOctal(h, 148, 8)) throw new Error('corrupt tar header checksum');
    const name = readString(h, 0, 100);
    const prefix = readString(h, 345, 155);
    const path = prefix ? `${prefix}/${name}` : name;
    const size = readOctal(h, 124, 12);
    const type = String.fromCharCode(h[156] ?? 0);
    const start = offset + BLOCK;
    const end = start + size;
    if (end > tar.length) throw new Error('truncated tar entry');
    if (type === '0' || type === '\0') {
      if (!validEntryPath(path)) throw new Error(`unsafe path in bundle: ${JSON.stringify(path)}`);
      if (files.has(path)) throw new Error(`duplicate path in bundle: ${path}`);
      files.set(path, Buffer.from(tar.subarray(start, end)));
    }
    offset = start + Math.ceil(size / BLOCK) * BLOCK;
  }
  return files;
}
