/**
 * cryptificate doctor against a fixture checkout: fake elan, lake and engine,
 * and injected probes for the service, the free disk space and Node.js.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DoctorCheck, DoctorProbes, DoctorReport } from '../src/doctor.js';
import { MIN_NODE_MAJOR, workspaceVersion } from '../src/doctor.js';
import { Engine } from '../src/engine.js';
import { makeFixture, runCli } from './helpers.js';
import type { Fixture } from './helpers.js';

const GiB = 1024 ** 3;

/** elan that lists the toolchains in $root/elan-toolchains. */
const FAKE_ELAN = String.raw`#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv[2] === 'toolchain' && process.argv[3] === 'list') {
  process.stdout.write(fs.readFileSync(__dirname + '/../elan-toolchains', 'utf8'));
  process.exit(0);
}
process.exit(1);
`;

/** lake whose `build --no-build` exits 3 while lean/STALE exists. */
const FAKE_LAKE = String.raw`#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv[2] === 'build' && process.argv.includes('--no-build')) process.exit(fs.existsSync('STALE') ? 3 : 0);
process.exit(1);
`;

interface Doc {
  fx: Fixture;
  probes: Partial<DoctorProbes>;
}

function healthy(): Doc {
  const fx = makeFixture({ native: true });
  const { root } = fx;
  writeFileSync(join(root, 'Cargo.toml'), '[workspace]\nmembers = []\n\n[workspace.package]\nversion = "0.1.0"\nedition = "2021"\n');
  const elan = join(root, 'bin', 'elan');
  writeFileSync(elan, FAKE_ELAN);
  chmodSync(elan, 0o755);
  writeFileSync(join(root, 'elan-toolchains'), 'leanprover/lean4:v4.20.0\nleanprover/lean4:v4.33.1 (default)\n');
  const lake = join(root, 'bin', 'lake-doctor');
  writeFileSync(lake, FAKE_LAKE);
  chmodSync(lake, 0o755);
  fx.env.lake = lake;
  const olean = join(root, 'lean', '.lake', 'packages', 'mathlib', '.lake', 'build', 'lib', 'lean');
  mkdirSync(olean, { recursive: true });
  writeFileSync(join(olean, 'Mathlib.olean'), '');
  const probes: Partial<DoctorProbes> = {
    nodeVersion: '22.18.0',
    elan,
    freeBytes: () => 40 * GiB,
    getJson: async (url) => {
      assert.equal(url, 'http://127.0.0.1:4173/api/capabilities');
      return { status: 200, body: { name: 'cryptificate', checker: 'cryptificate 0.1.0' } };
    },
  };
  return { fx, probes };
}

async function doctor(d: Doc, argv: string[] = []): Promise<{ code: number; report: DoctorReport; text: string }> {
  const json = await runCli(d.fx, ['doctor', '--json', ...argv], { doctor: d.probes });
  const text = await runCli(d.fx, ['doctor', ...argv], { doctor: d.probes });
  assert.equal(json.code, text.code);
  return { code: json.code, report: JSON.parse(json.stdout) as DoctorReport, text: text.stdout };
}

function byId(report: DoctorReport): Record<string, DoctorCheck> {
  return Object.fromEntries(report.checks.map((c) => [c.id, c]));
}

async function withDoctor(fn: (d: Doc) => Promise<void>): Promise<void> {
  const d = healthy();
  try {
    await fn(d);
  } finally {
    rmSync(d.fx.root, { recursive: true, force: true });
  }
}

test('doctor passes every check on a complete setup and prints a checklist', async () => {
  await withDoctor(async (d) => {
    const { code, report, text } = await doctor(d);
    assert.equal(code, 0, text);
    assert.equal(report.format, 'cryptificate-doctor/v1');
    assert.equal(report.ok, true);
    assert.deepEqual(
      report.checks.map((c) => [c.id, c.status]),
      [
        ['node', 'pass'],
        ['elan', 'pass'],
        ['lean-toolchain', 'pass'],
        ['lake', 'pass'],
        ['mathlib', 'pass'],
        ['lean-build', 'pass'],
        ['engine', 'pass'],
        ['rustc', 'pass'],
        ['state-dir', 'pass'],
        ['disk', 'pass'],
        ['service', 'pass'],
      ],
    );
    const c = byId(report);
    assert.match(c['lean-toolchain']!.detail, /leanprover\/lean4:v4\.33\.1 is installed/);
    assert.match(c['engine']!.detail, /^cryptificate-engine 0\.1\.0 at /);
    assert.match(c['state-dir']!.detail, /will be created/);
    assert.match(text, /^Cryptificate doctor \(cryptificate 0\.1\.0\)\n {2}ok {4}Node\.js {14}22\.18\.0 \(needs 20 or later\)\n/);
    assert.match(text, /\nReady: 0 failed, 0 warnings\.\n$/);
    assert.doesNotMatch(text, /fix:/);
  });
});

test('doctor reports each missing piece with the command that fixes it, and exits 1', async () => {
  await withDoctor(async (d) => {
    writeFileSync(join(d.fx.root, 'elan-toolchains'), 'leanprover/lean4:v4.20.0 (default)\n');
    rmSync(join(d.fx.root, 'lean', '.lake'), { recursive: true });
    writeFileSync(join(d.fx.root, 'Cargo.toml'), '[workspace.package]\nversion = "0.2.0"\n');
    d.probes.freeBytes = () => 100 * 1024 * 1024;
    d.probes.getJson = async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:4173');
    };
    d.probes.nodeVersion = '18.19.0';
    const { code, report, text } = await doctor(d);
    assert.equal(code, 1);
    assert.equal(report.ok, false);
    const c = byId(report);
    assert.equal(c['node']!.status, 'fail');
    assert.deepEqual([c['lean-toolchain']!.status, c['lean-toolchain']!.fix], ['fail', 'elan toolchain install leanprover/lean4:v4.33.1']);
    assert.deepEqual([c['mathlib']!.status, c['mathlib']!.fix], ['fail', `cd ${join(d.fx.root, 'lean')} && lake exe cache get`]);
    assert.equal(c['lean-build']!.status, 'skip', 'lake is not started while the pinned toolchain is missing');
    assert.match(c['lean-build']!.detail, /needs the pinned toolchain, the Mathlib build first/);
    assert.equal(c['engine']!.status, 'fail');
    assert.match(c['engine']!.detail, /is cryptificate-engine 0\.1\.0; this checkout is cryptificate-engine 0\.2\.0/);
    assert.equal(c['engine']!.fix, `cd ${d.fx.root} && cargo build --release --locked --bin cryptificate-engine`);
    assert.equal(c['disk']!.status, 'fail');
    assert.match(c['disk']!.detail, /^0\.1 GiB free/);
    assert.equal(c['service']!.status, 'warn', 'check, verify and report do not need the service');
    assert.match(c['service']!.detail, /ECONNREFUSED/);
    assert.match(text, / {2}FAIL {2}Lean toolchain {7}leanprover\/lean4:v4\.33\.1 \(pinned in lean\/lean-toolchain\) is not installed\n {8}.* fix: elan toolchain install leanprover\/lean4:v4\.33\.1\n/);
    assert.match(text, /\n5 failed, 1 warning\. Run the fix commands above \(scripts\/setup\.sh installs everything that is missing\), then cryptificate doctor again\.\n$/);
  });
});

test('doctor: a certificate library that needs a build, a stale engine, and missing tools', async () => {
  await withDoctor(async (d) => {
    writeFileSync(join(d.fx.root, 'lean', 'STALE'), '');
    mkdirSync(join(d.fx.root, 'crates', 'core', 'src'), { recursive: true });
    const src = join(d.fx.root, 'crates', 'core', 'src', 'lib.rs');
    writeFileSync(src, '');
    const future = new Date(Date.now() + 3600_000);
    utimesSync(src, future, future);
    d.probes.getJson = async () => ({ status: 200, body: { name: 'cryptificate', checker: 'cryptificate 0.0.9' } });
    let { code, report } = await doctor(d);
    let c = byId(report);
    assert.equal(code, 1);
    assert.deepEqual([c['lean-build']!.status, c['lean-build']!.fix], ['fail', `cd ${join(d.fx.root, 'lean')} && lake build Cryptificate`]);
    assert.match(c['lean-build']!.detail, /not up to date/);
    assert.equal(c['engine']!.status, 'warn');
    assert.match(c['engine']!.detail, /older than the engine sources in crates\//);
    assert.equal(c['service']!.status, 'warn');
    assert.match(c['service']!.detail, /answers with cryptificate 0\.0\.9, not this checkout's cryptificate 0\.1\.0/);

    rmSync(join(d.fx.root, 'lean', 'STALE'));
    d.probes.elan = null;
    d.fx.env.lake = null;
    d.fx.env.engine = new Engine(null, d.fx.root);
    ({ code, report } = await doctor(d));
    c = byId(report);
    assert.equal(code, 1);
    assert.equal(c['elan']!.status, 'fail');
    assert.match(c['elan']!.fix!, /elan-init\.sh/);
    assert.equal(c['lean-toolchain']!.status, 'skip');
    assert.equal(c['lake']!.status, 'fail');
    assert.equal(c['lean-build']!.status, 'skip');
    assert.equal(c['engine']!.status, 'fail');
    assert.match(c['engine']!.detail, /cryptificate-engine was not found/);
  });
});

test('doctor: an engine without the native backend is a warning; an unusable state directory fails', async () => {
  await withDoctor(async (d) => {
    const fx2 = makeFixture({ native: false });
    try {
      d.fx.env.engine = fx2.env.engine;
      writeFileSync(d.fx.env.paths.home, 'not a directory');
      const { code, report } = await doctor(d);
      const c = byId(report);
      assert.equal(c['engine']!.status, 'warn');
      assert.match(c['engine']!.detail, /built without the native backend/);
      assert.equal(c['state-dir']!.status, 'fail');
      assert.match(c['state-dir']!.fix!, /CRYPTIFICATE_HOME/);
      assert.equal(code, 1);
    } finally {
      rmSync(fx2.root, { recursive: true, force: true });
    }
  });
});

test('doctor usage errors, and the minimum Node.js version matches package.json', async () => {
  await withDoctor(async (d) => {
    for (const [argv, message] of [
      [['doctor', 'extra'], /doctor takes no arguments/],
      [['doctor', '--url', 'localhost:4173'], /--url must be an http:\/\/ or https:\/\/ URL/],
      [['doctor', '--frobnicate'], /Unknown option/],
    ] as const) {
      const r = await runCli(d.fx, [...argv], { doctor: d.probes });
      assert.equal(r.code, 2, argv.join(' '));
      assert.match(r.stderr, message);
    }
  });
  const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8')) as { engines: { node: string } };
  assert.equal(pkg.engines.node, `>=${MIN_NODE_MAJOR}`);
  assert.equal(workspaceVersion(fileURLToPath(new URL('../../../../', import.meta.url))), '0.1.0');
});
