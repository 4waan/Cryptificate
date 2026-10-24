import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { AnalysisReport } from '@cryptificate/schema';
import { buildBundle } from '../src/bundle.js';
import { createTarGz, readTarGz } from '../src/tar.js';
import type { ToolchainInfo } from '../src/toolchain.js';
import type { Paths } from '../src/paths.js';

const toolchain: ToolchainInfo = {
  pins: { lean: 'v4.33.1', mathlib: 'v4.33.1', widetrail: '162c0f8a9e59841032ec5d66874fee31cf3b6298', rustc: 'rustc 1.97.0' },
  leanToolchain: 'leanprover/lean4:v4.33.1',
  lakeManifest: [{ name: 'WideTrail', url: 'https://github.com/4waan/Wide-Trail-formal-verification', rev: '162c0f8', inputRev: null }],
  cargoLockSha256: 'ab'.repeat(32),
  version: '0.1.0',
  revision: null,
  checker: 'cryptificate 0.1.0',
};

const report: AnalysisReport = {
  kind: 'analysis',
  id: '0123456789abcdef0123456789abcdef',
  inputDigest: `sha256:${'cd'.repeat(32)}`,
  inputs: {
    design: {
      model: 'aes-like/gf256/v1',
      field: 'gf256',
      width: 4,
      matrix: [['01', '00', '00', '00'], ['00', '01', '00', '00'], ['00', '00', '01', '00'], ['00', '00', '00', '01']],
      offsets: [0, 1, 2, 3],
      rounds: 4,
      sbox: { kind: 'aes' },
    },
  },
  claims: [],
  execution: { state: 'completed', steps: [{ name: 'lean', state: 'completed', ms: 1234 }] },
  provenance: { origin: 'live', checker: 'cryptificate 0.1.0', toolchain: toolchain.pins },
};

function fixture(): { root: string; jobDir: string; paths: Paths } {
  const root = mkdtempSync(join(tmpdir(), 'cryptificate-bundle-test-'));
  const home = join(root, '.cryptificate');
  const jobDir = join(home, 'jobs', report.id);
  mkdirSync(join(jobDir, 'lean'), { recursive: true });
  writeFileSync(join(jobDir, 'lean', 'Cert.lean'), 'import Cryptificate\n');
  writeFileSync(join(jobDir, 'lean', 'audit.txt'), `${jobDir}/lean/Cert.lean:3:0: info: CRYPTIFICATE_AUDIT {}\n`);
  mkdirSync(join(jobDir, 'native', 'src'), { recursive: true });
  writeFileSync(join(jobDir, 'native', 'src', 'user.rs'), 'pub fn f() {}\n');
  const paths: Paths = {
    root,
    home,
    jobsDir: join(home, 'jobs'),
    cacheDir: join(home, 'cache'),
    leanDir: join(root, 'lean'),
    templatesDir: join(root, 'lean', 'templates'),
    webDist: join(root, 'apps', 'web', 'dist'),
  };
  return { root, jobDir, paths };
}

test('tar writer round-trips and sorts entries', () => {
  const gz = createTarGz([
    { path: 'b/second.txt', data: 'two' },
    { path: 'a.json', data: '{}' },
    { path: `${'d/'.repeat(60)}long.txt`, data: 'long path' },
  ]);
  const files = readTarGz(gz);
  assert.deepEqual([...files.keys()], ['a.json', 'b/second.txt', `${'d/'.repeat(60)}long.txt`]);
  assert.equal(files.get('b/second.txt')!.toString(), 'two');
  // gzip header: no mtime, OS "unknown"
  assert.equal(gz.readUInt32LE(4), 0);
  assert.equal(gz[9], 0xff);
  // every tar header has mtime 0
  const tar = gunzipSync(gz);
  assert.equal(tar.subarray(136, 147).toString('ascii'), '00000000000');
});

test('tar writer rejects unsafe paths and the reader refuses traversal', () => {
  assert.throws(() => createTarGz([{ path: '../evil', data: 'x' }]));
  assert.throws(() => createTarGz([{ path: '/abs', data: 'x' }]));
  // craft an archive with a traversal path by patching a valid header
  const gz = createTarGz([{ path: 'aa/evil', data: 'x' }]);
  const tar = gunzipSync(gz);
  tar.write('../evil', 0, 'utf8');
  tar.fill(0, 7, 100);
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 0x20 : tar[i]!;
  tar.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 'ascii');
  assert.throws(() => readTarGz(gzipSync(tar)), /unsafe path/);
});

test('bundles are byte-for-byte deterministic and carry no local paths', () => {
  const { root, jobDir, paths } = fixture();
  try {
    const a = buildBundle({ jobDir, report, toolchain, paths });
    const b = buildBundle({ jobDir, report, toolchain, paths });
    assert.ok(a.equals(b));
    const files = readTarGz(a);
    assert.deepEqual([...files.keys()], [
      'VERIFY.md',
      'inputs.json',
      'lean/Cert.lean',
      'lean/audit.txt',
      'native/src/user.rs',
      'report.json',
      'toolchain.json',
    ]);
    for (const [name, data] of files) {
      const text = data.toString('utf8');
      assert.ok(!text.includes(root), `${name} leaks a local path`);
      assert.ok(!/\b20\d\d-\d\d-\d\d/.test(text), `${name} contains a date`);
    }
    assert.match(files.get('lean/audit.txt')!.toString(), /^<jobs>\//);
    assert.deepEqual(JSON.parse(files.get('inputs.json')!.toString()), report.inputs);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
