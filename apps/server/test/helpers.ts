/**
 * Test fixtures: a throwaway checkout with a fake engine and a fake `lake`
 * whose behaviour is driven by markers in the generated Lean source.
 */
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PipelineEnv } from '../src/context.js';
import { Engine } from '../src/engine.js';
import { pathReplacements, resolvePaths } from '../src/paths.js';
import type { ToolchainInfo } from '../src/toolchain.js';

export const MDS_TYPE = 'Cryptificate.IsMDS4 CryptificateJob.candMatrix';
export const NOT_MDS_TYPE = '¬Cryptificate.IsMDS4 CryptificateJob.candMatrix';
export const EQ_TYPE = 'Cryptificate.Circuit.implements CryptificateJob.candProgram CryptificateJob.candMatrix';

/**
 * Fake engine. emit-lean writes the stdout the fake Lean should print into
 * the source as "-- OUT:" lines; "-- SLEEP:" and "-- EXIT:" control timing
 * and exit status. A design with rounds == 31 sleeps (timeout tests); 30
 * prints a sorryAx axiom.
 */
const FAKE_ENGINE = String.raw`#!/usr/bin/env node
const sub = process.argv[2];
if (sub === '--help') { console.log('subcommands:\n  validate\n  diagnose\n  emit-lean\n  search'); process.exit(0); }
let input = '';
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', () => {
  const req = JSON.parse(input);
  const crypto = require('node:crypto');
  const canon = (v) => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v);
  const norm = (r) => {
    const out = JSON.parse(JSON.stringify(r));
    if (out.design && out.design.matrix) out.design.matrix = out.design.matrix.map((row) => row.map((e) => e.toUpperCase()));
    if (out.program && !out.target && !out.profile) out.target = 'matrix';
    if (!out.program && !out.profile) out.target = 'matrix';
    return out;
  };
  if (sub === 'validate') {
    if (req.design && req.design.rounds === 5) { console.log(JSON.stringify({ error: { code: 'bad-rounds', message: 'rounds 5 rejected', path: '/design/rounds' } })); process.exit(2); }
    const n = norm(req);
    console.log(JSON.stringify({ request: n, inputDigest: 'sha256:' + crypto.createHash('sha256').update(canon(n)).digest('hex') }));
    return;
  }
  if (sub === 'diagnose') {
    const id = req.design.matrix.every((row, i) => row.every((e, j) => e === (i === j ? '01' : '00')));
    console.log(JSON.stringify({ claims: [{ claim: 'matrix.mds', holds: !id, witness: id ? { kind: 'branch', input: ['01','00','00','00'], output: ['01','00','00','00'], inputWeight: 1, outputWeight: 1, bound: 5 } : null }] }));
    return;
  }
  if (sub === 'emit-lean') {
    const d = req.design;
    const identity = d.matrix.every((row, i) => row.every((e, j) => e === (i === j ? '01' : '00')));
    const expect = [];
    const out = ['CRYPTIFICATE_INPUT candMatrix ' + JSON.stringify(d.matrix), 'CRYPTIFICATE_INPUT candOffsets ' + JSON.stringify(d.offsets), 'CRYPTIFICATE_INPUT candRounds ' + d.rounds];
    const ax = d.rounds === 30 ? '["propext","sorryAx"]' : '["propext","Quot.sound"]';
    if (identity) {
      expect.push({ claim: 'matrix.mds', theorem: 'CryptificateJob.matrix_not_mds', status: 'refuted', expectedType: '${NOT_MDS_TYPE}' });
      out.push('CRYPTIFICATE_AUDIT {"theorem":"CryptificateJob.matrix_not_mds","type":"${NOT_MDS_TYPE}","axioms":' + ax + '}');
    } else {
      expect.push({ claim: 'matrix.mds', theorem: 'CryptificateJob.matrix_mds', status: 'proved', expectedType: '${MDS_TYPE}' });
      out.push('CRYPTIFICATE_AUDIT {"theorem":"CryptificateJob.matrix_mds","type":"${MDS_TYPE}","axioms":' + ax + '}');
      expect.push({ claim: 'activity.bound', theorem: 'CryptificateJob.activity_bound', status: 'proved', expectedType: 'activity' });
      out.push('CRYPTIFICATE_AUDIT {"theorem":"CryptificateJob.activity_bound","type":"activity","axioms":[]}');
    }
    expect.push({ claim: 'offsets.dispersion', theorem: 'CryptificateJob.offsets_optimal', status: 'proved', expectedType: 'offsets' });
    out.push('CRYPTIFICATE_AUDIT {"theorem":"CryptificateJob.offsets_optimal","type":"offsets","axioms":[]}');
    expect.push({ claim: 'sbox.bijective', theorem: 'CryptificateJob.sbox_bijective', status: 'proved', expectedType: 'sbox' });
    out.push('CRYPTIFICATE_AUDIT {"theorem":"CryptificateJob.sbox_bijective","type":"sbox","axioms":[]}');
    if (req.program) {
      expect.push({ claim: 'circuit.equivalence', theorem: 'CryptificateJob.circuit_equivalence', status: 'proved', expectedType: '${EQ_TYPE}' });
      out.push('CRYPTIFICATE_AUDIT {"theorem":"CryptificateJob.circuit_equivalence","type":"${EQ_TYPE}","axioms":[]}');
    }
    const lines = ['import Cryptificate', 'namespace CryptificateJob'];
    for (const o of out) lines.push('-- OUT: ' + o);
    if (d.rounds === 31) lines.push('-- SLEEP: 30');
    if (d.rounds === 29) lines.push('-- OUT: /x/Cert.lean:12:4: error: unknown identifier', '-- EXIT: 1');
    lines.push('end CryptificateJob');
    console.log(JSON.stringify({ source: lines.join('\n') + '\n', expect, inputsEcho: { candMatrix: d.matrix, candOffsets: d.offsets, candRounds: d.rounds } }));
    return;
  }
  if (sub === 'search') {
    const prog = { field: 'gf256', width: 4, instructions: [{ op: 'add', a: 0, b: 1 }], outputs: [4, 1, 2, 3] };
    const ops = { add: 1, mul: 0 };
    console.log(JSON.stringify({
      kind: 'search', seed: req.seed, budget: { profile: req.profile, totalMs: 180000, maxCandidates: 8, synthMs: 10000, shortlist: 1 },
      generated: 2,
      history: [{ id: 'c1', ops, depth: 1, temps: 1, symbolic: 'pass', strategy: 'test' }, { id: 'c2', ops: { add: 9, mul: 9 }, depth: 4, temps: 3, symbolic: 'reject' }],
      shortlist: ['c1'],
      candidates: [{ id: 'c1', origin: 'search', program: prog, ops, depth: 1, temps: 1, symbolic: 'pass' }],
      baselines: [{ id: 'baseline-direct', origin: 'baseline-direct', program: prog, ops, depth: 1, temps: 1 }],
    }));
    return;
  }
  console.error('unknown subcommand ' + sub);
  process.exit(1);
});
`;

const FAKE_LAKE = String.raw`#!/usr/bin/env node
const fs = require('node:fs');
const file = process.argv[process.argv.length - 1];
const src = fs.readFileSync(file, 'utf8');
let sleep = 0, exit = 0;
for (const line of src.split('\n')) {
  if (line.startsWith('-- OUT: ')) console.log(line.slice(8));
  if (line.startsWith('-- SLEEP: ')) sleep = Number(line.slice(10));
  if (line.startsWith('-- EXIT: ')) exit = Number(line.slice(9));
}
if (sleep) {
  // a child in the same process group, to check that the whole group is killed
  const child = require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
  fs.writeFileSync(file + '.child-pid', String(child.pid));
  setTimeout(() => process.exit(exit), sleep * 1000);
} else process.exit(exit);
`;

export interface Fixture {
  root: string;
  env: PipelineEnv;
}

export function makeFixture(opts: { leanTimeoutMs?: number; noLake?: boolean; noEngine?: boolean } = {}): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'cryptificate-test-'));
  mkdirSync(join(root, 'lean', 'templates'), { recursive: true });
  mkdirSync(join(root, 'bin'), { recursive: true });
  writeFileSync(join(root, 'package.json'), '{"name":"fixture","private":true}\n');
  writeFileSync(join(root, 'lean', 'lean-toolchain'), 'leanprover/lean4:v4.33.1\n');
  writeFileSync(
    join(root, 'lean', 'lake-manifest.json'),
    JSON.stringify({ packages: [{ name: 'WideTrail', url: 'https://example.invalid/widetrail', rev: 'abc123', inputRev: 'abc123' }, { name: 'mathlib', url: 'https://example.invalid/mathlib', rev: 'def456', inputRev: 'v4.33.1' }] }),
  );
  writeFileSync(join(root, 'lean', 'templates', 'header.lean'), 'import Cryptificate\n');
  const engine = join(root, 'bin', 'cryptificate-engine');
  writeFileSync(engine, FAKE_ENGINE);
  chmodSync(engine, 0o755);
  const lake = join(root, 'bin', 'lake');
  writeFileSync(lake, FAKE_LAKE);
  chmodSync(lake, 0o755);
  const saved = process.env['CRYPTIFICATE_HOME'];
  delete process.env['CRYPTIFICATE_HOME'];
  const paths = resolvePaths(root);
  if (saved !== undefined) process.env['CRYPTIFICATE_HOME'] = saved;
  const tc: ToolchainInfo = {
    pins: { lean: 'v4.33.1', mathlib: 'v4.33.1', widetrail: 'abc123', rustc: 'rustc 1.97.0 (test)' },
    leanToolchain: 'leanprover/lean4:v4.33.1',
    lakeManifest: [],
    cargoLockSha256: null,
    version: '0.1.0',
    revision: null,
    checker: 'cryptificate 0.1.0',
  };
  const env: PipelineEnv = {
    paths,
    engine: new Engine(opts.noEngine ? null : engine, root),
    lake: opts.noLake ? null : lake,
    toolchain: async () => tc,
    replacements: pathReplacements(paths),
  };
  if (opts.leanTimeoutMs !== undefined) env.leanTimeoutMs = opts.leanTimeoutMs;
  return { root, env };
}

export const AES_DESIGN = {
  model: 'aes-like/gf256/v1' as const,
  field: 'gf256' as const,
  width: 4,
  matrix: [
    ['02', '03', '01', '01'],
    ['01', '02', '03', '01'],
    ['01', '01', '02', '03'],
    ['03', '01', '01', '02'],
  ],
  offsets: [0, 1, 2, 3],
  rounds: 4,
  sbox: { kind: 'aes' as const },
};

export const IDENTITY_DESIGN = {
  ...AES_DESIGN,
  matrix: [
    ['01', '00', '00', '00'],
    ['00', '01', '00', '00'],
    ['00', '00', '01', '00'],
    ['00', '00', '00', '01'],
  ],
};

export const IDENTITY_PROGRAM = { field: 'gf256' as const, width: 4, name: 'identity', instructions: [], outputs: [0, 1, 2, 3] };
