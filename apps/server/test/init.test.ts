/**
 * cryptificate init: files written from flags and from answers on a
 * terminal, refusal to overwrite, the workflow in a git repository, and a
 * check of the scaffolded project with the fake engine and Lean.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { validateAnalysisRequest, validateCandidateDesign, validateProgram } from '@cryptificate/schema';
import type { Input } from '../src/cli-main.js';
import { prettyJson } from '../src/init.js';
import { PRESETS, defaultClaims } from '../src/presets.js';
import { loadConfig } from '../src/project.js';
import type { CheckRun } from '../src/report-formats.js';
import { IDENTITY_DESIGN, makeFixture, runCli } from './helpers.js';
import type { Fixture } from './helpers.js';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));

async function withFixture(fn: (fx: Fixture) => Promise<void>): Promise<void> {
  const fx = makeFixture();
  try {
    await fn(fx);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
}

/** A terminal that has already typed `answers`, one per line. */
function terminal(answers: string[], end = true): () => Input {
  return () => {
    const s = new PassThrough() as PassThrough & { isTTY?: boolean };
    s.isTTY = true;
    s.write(answers.map((a) => `${a}\n`).join(''));
    if (end) s.end();
    return s;
  };
}

const notTerminal = (): Input => {
  const s = new PassThrough();
  s.end();
  return s;
};

const read = (p: string): string => readFileSync(p, 'utf8');

test('the presets are the example designs and circuits, and pass the request validators', () => {
  for (const p of PRESETS) {
    assert.deepEqual(p.design, JSON.parse(read(join(repo, p.example))), p.id);
    assert.ok(validateCandidateDesign(p.design).ok, p.id);
    if (p.program) {
      assert.deepEqual(p.program, JSON.parse(read(join(repo, p.programExample!))), p.id);
      assert.ok(validateProgram(p.program).ok, p.id);
      assert.ok(validateAnalysisRequest({ design: p.design, program: p.program }).ok, p.id);
    }
  }
  assert.deepEqual(defaultClaims('aes-like', false), ['matrix.mds', 'offsets.dispersion', 'sbox.bijective', 'activity.bound']);
  assert.deepEqual(defaultClaims('hades', true), ['external.mds', 'internal.invertible', 'sbox.bijective', 'activity.outer', 'circuit.equivalence', 'native.correctness']);
  // short scalar arrays stay on one line, as in the examples
  assert.equal(prettyJson({ a: [1, 2], b: { kind: 'aes' }, c: [['01', '02']] }), '{\n  "a": [1, 2],\n  "b": { "kind": "aes" },\n  "c": [\n    ["01", "02"]\n  ]\n}');
});

test('init without a terminal uses the defaults, and the project it writes passes check', async () => {
  await withFixture(async (fx) => {
    const dir = join(fx.root, 'proj');
    const r = await runCli(fx, ['init', 'proj'], { stdin: notTerminal });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /Wrote aes \(aes-like\/gf256\/v1\), policy --fail-on refuted:\n {2}proj\/cryptificate\.json\n {2}proj\/cryptificate\/designs\/aes\.json\n {2}proj\/cryptificate\/README\.md\n {2}proj\/cryptificate\/\.gitignore\n {2}proj\/\.github\/workflows\/cryptificate\.yml\n/);
    assert.match(r.stdout, /Next steps:\n {2}1\. Edit proj\/cryptificate\/designs\/aes\.json/);
    assert.match(r.stdout, /cryptificate check in proj/);
    assert.match(r.stdout, /proj is not in a git repository yet/);

    const cfg = loadConfig(join(dir, 'cryptificate.json')).config;
    assert.deepEqual(cfg, { inputs: ['cryptificate/designs/*.json'], failOn: 'refuted', claims: ['matrix.mds', 'offsets.dispersion', 'sbox.bijective', 'activity.bound'], bundleDir: 'cryptificate/evidence' });
    assert.deepEqual(JSON.parse(read(join(dir, 'cryptificate', 'designs', 'aes.json'))), PRESETS[0]!.design);
    assert.equal(read(join(dir, 'cryptificate', '.gitignore')), 'evidence/\n');
    const wf = read(join(dir, '.github', 'workflows', 'cryptificate.yml'));
    assert.match(wf, /- uses: 4waan\/Cryptificate@main {3}# pin a commit SHA for reproducible gates\n {8}with:\n {10}upload-sarif: "true"\n$/);
    assert.match(wf, /security-events: write/);
    assert.match(wf, /paths:\n {6}- "cryptificate\.json"\n {6}- "cryptificate\/\*\*"/);
    assert.doesNotMatch(wf, /working-directory|inputs:/, 'the action reads cryptificate.json');

    // the scaffolded project checks cleanly from any directory below it
    const check = await runCli(fx, ['check', '-q', '--format', 'json'], { cwd: join(dir, 'cryptificate') });
    assert.equal(check.code, 0, check.stdout + check.stderr);
    const run = JSON.parse(check.stdout) as CheckRun;
    assert.deepEqual([run.failOn, run.claims, run.results.map((e) => e.input.file)], ['refuted', cfg.claims, ['cryptificate/designs/aes.json']]);
    assert.ok(existsSync(join(dir, 'cryptificate', 'evidence', 'aes.tar.gz')));

    // a design with a refuted claim added next to it fails the gate
    writeFileSync(join(dir, 'cryptificate', 'designs', 'weak.json'), JSON.stringify(IDENTITY_DESIGN));
    const gate = await runCli(fx, ['check', '-q'], { cwd: dir });
    assert.equal(gate.code, 1, gate.stdout);
    assert.match(gate.stdout, /cryptificate\/designs\/weak\.json: matrix\.mds refuted/);
  });
});

test('init never overwrites a file without --force, and writes nothing when one exists', async () => {
  await withFixture(async (fx) => {
    const dir = join(fx.root, 'proj');
    mkdirSync(dir);
    writeFileSync(join(dir, 'cryptificate.json'), '{"mine": true}\n');
    const r = await runCli(fx, ['init', 'proj', '--yes'], { stdin: notTerminal });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /init would overwrite proj\/cryptificate\.json; nothing was written \(use --force to overwrite\)/);
    assert.equal(read(join(dir, 'cryptificate.json')), '{"mine": true}\n');
    assert.ok(!existsSync(join(dir, 'cryptificate')));
    assert.ok(!existsSync(join(dir, '.github')));

    const forced = await runCli(fx, ['init', 'proj', '--yes', '--force', '--ci', 'none'], { stdin: notTerminal });
    assert.equal(forced.code, 0, forced.stderr);
    assert.match(forced.stdout, /proj\/cryptificate\.json \(overwritten\)/);
    assert.equal(loadConfig(join(dir, 'cryptificate.json')).config.failOn, 'refuted');
    assert.ok(!existsSync(join(dir, '.github')), '--ci none writes no workflow');
  });
});

test('init asks on a terminal, re-asks after an invalid answer and takes flags as given answers', async () => {
  await withFixture(async (fx) => {
    // model, preset (default), circuit, policy (one invalid answer first), workflow, confirm
    const r = await runCli(fx, ['init', 'zk'], { stdin: terminal(['hades', '', 'y', 'sometimes', 'not-established', 'n', 'y']) });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /Design model: aes-like \(GF\(2\^8\) SPN\) or hades \(Poseidon2-style over BN254\) \(aes-like, hades\) \[aes-like\]: /);
    assert.match(r.stdout, /Starting design \(poseidon2-bn254\) \[poseidon2-bn254\]: /);
    assert.match(r.stdout, /Also check the reference circuit bn254-shared-sum/);
    assert.match(r.stdout, / {2}please answer one of none, refuted, not-established, any\n/);
    assert.match(r.stdout, /Files to write:\n {2}zk\/cryptificate\.json\n/);
    const dir = join(fx.root, 'zk');
    const cfg = loadConfig(join(dir, 'cryptificate.json')).config;
    assert.equal(cfg.failOn, 'not-established');
    assert.deepEqual(cfg.claims, defaultClaims('hades', true));
    const req = JSON.parse(read(join(dir, 'cryptificate', 'designs', 'poseidon2-bn254.json'))) as { design: unknown; program: unknown };
    assert.ok(validateAnalysisRequest(req).ok);
    assert.deepEqual(req.program, PRESETS.find((p) => p.id === 'poseidon2-bn254')!.program);
    assert.match(read(join(dir, 'cryptificate', 'README.md')), /`program` a circuit that computes its external matrix/);
    assert.ok(!existsSync(join(dir, '.github')));

    // flags answer their questions: only the policy and the confirmation are asked
    const flagged = await runCli(fx, ['init', 'aes', '--preset', 'aes-row-scaled', '--ci', 'github'], { stdin: terminal(['', '']) });
    assert.equal(flagged.code, 0, flagged.stderr);
    assert.doesNotMatch(flagged.stdout, /Design model|Starting design|reference circuit|GitHub Actions/);
    assert.match(flagged.stdout, /Fail the check on/);

    // declining writes nothing (exit 1); end of input cancels (exit 2)
    const declined = await runCli(fx, ['init', 'no'], { stdin: terminal(['', '', '', '', '', 'n']) });
    assert.equal(declined.code, 1, declined.stdout + declined.stderr);
    assert.match(declined.stderr, /nothing was written/);
    assert.ok(!existsSync(join(fx.root, 'no')));
    const eof = await runCli(fx, ['init', 'eof'], { stdin: terminal(['hades']) });
    assert.equal(eof.code, 2);
    assert.match(eof.stderr, /init cancelled; nothing was written/);
    assert.ok(!existsSync(join(fx.root, 'eof')));

    // --yes on a terminal asks nothing
    const yes = await runCli(fx, ['init', 'quiet', '--yes'], { stdin: terminal([]) });
    assert.equal(yes.code, 0);
    assert.doesNotMatch(yes.stdout, /Design model|Write these files/);
  });
});

test('init in a subdirectory of a git repository puts the workflow at the repository root', async () => {
  await withFixture(async (fx) => {
    const repoRoot = join(fx.root, 'repo');
    mkdirSync(join(repoRoot, '.git', 'refs', 'heads'), { recursive: true });
    writeFileSync(join(repoRoot, '.git', 'refs', 'heads', 'master'), '0'.repeat(40));
    mkdirSync(join(repoRoot, 'crypto'));
    const r = await runCli(fx, ['init', '--preset', 'poseidon2-bn254', '--action', '4waan/Cryptificate@0123456789abcdef0123456789abcdef01234567'], { stdin: notTerminal, cwd: join(repoRoot, 'crypto') });
    assert.equal(r.code, 0, r.stderr);
    const wf = read(join(repoRoot, '.github', 'workflows', 'cryptificate.yml'));
    assert.ok(!existsSync(join(repoRoot, 'crypto', '.github')));
    assert.match(wf, /- "crypto\/cryptificate\.json"\n {6}- "crypto\/cryptificate\/\*\*"/);
    assert.match(wf, /branches: \[master\]/);
    assert.match(wf, /- uses: 4waan\/Cryptificate@0123456789abcdef0123456789abcdef01234567\n/, 'a pinned SHA gets no pin reminder');
    assert.match(wf, / {10}working-directory: crypto\n$/);
    assert.match(r.stdout, /\.\.\/\.github\/workflows\/cryptificate\.yml/);
    assert.doesNotMatch(r.stdout, /Pin the action/);
  });
});

test('init usage errors (exit 2)', async () => {
  await withFixture(async (fx) => {
    writeFileSync(join(fx.root, 'file'), '');
    const cases: [string[], RegExp][] = [
      [['init', '--preset', 'des'], /unknown preset "des"; the presets are aes \(aes-like\), aes-row-scaled \(aes-like\), poseidon2-bn254 \(hades\)/],
      [['init', '--model', 'hades', '--preset', 'aes'], /preset aes is a aes-like design, not hades/],
      [['init', '--model', 'feistel'], /--model must be one of aes-like, hades/],
      [['init', '--preset', 'aes-row-scaled', '--circuit'], /preset aes-row-scaled has no reference circuit/],
      [['init', '--circuit', '--no-circuit'], /--circuit and --no-circuit exclude each other/],
      [['init', '--ci', 'gitlab'], /--ci must be one of github, none/],
      [['init', '--fail-on', 'sometimes'], /--fail-on must be one of/],
      [['init', '--action', 'not an action'], /--action must look like OWNER\/REPO@REF/],
      [['init', 'a', 'b'], /init takes at most one directory/],
      [['init', 'file'], /file is not a directory/],
    ];
    for (const [argv, message] of cases) {
      const r = await runCli(fx, argv, { stdin: notTerminal });
      assert.equal(r.code, 2, argv.join(' '));
      assert.match(r.stderr, message, argv.join(' '));
    }
    assert.ok(!existsSync(join(fx.root, 'cryptificate.json')));
  });
});
