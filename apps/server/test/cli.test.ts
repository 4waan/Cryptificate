/**
 * The cryptificate command as a CI gate: exit codes under each policy,
 * several inputs, output files, the GitHub step summary, verify and report.
 * Runs main() against the fake engine and fake Lean of helpers.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/cli-main.js';
import type { CliDeps } from '../src/cli-main.js';
import type { CheckRun, VerifyRun } from '../src/report-formats.js';
import { AES_DESIGN, IDENTITY_DESIGN, IDENTITY_PROGRAM, makeFixture } from './helpers.js';
import type { Fixture } from './helpers.js';

/** apps/server/dist/test -> repository root */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

interface Ran {
  code: number;
  stdout: string;
  stderr: string;
}

function sink(): { write(s: string): boolean; text: string } {
  return {
    text: '',
    write(s: string) {
      this.text += s;
      return true;
    },
  };
}

async function run(fx: Fixture, argv: string[], extra: Partial<CliDeps> = {}): Promise<Ran> {
  const stdout = sink();
  const stderr = sink();
  const code = await main(argv, { env: () => fx.env, stdout, stderr, environ: {}, cwd: fx.root, signals: false, ...extra });
  return { code, stdout: stdout.text, stderr: stderr.text };
}

function withDesigns(fx: Fixture): void {
  mkdirSync(join(fx.root, 'designs'), { recursive: true });
  writeFileSync(join(fx.root, 'designs', 'aes.json'), `${JSON.stringify(AES_DESIGN, null, 2)}\n`);
  writeFileSync(join(fx.root, 'designs', 'identity.json'), `${JSON.stringify(IDENTITY_DESIGN, null, 2)}\n`);
  writeFileSync(join(fx.root, 'designs', 'with-circuit.json'), `${JSON.stringify({ design: AES_DESIGN, program: IDENTITY_PROGRAM }, null, 2)}\n`);
  writeFileSync(join(fx.root, 'circuit.json'), `${JSON.stringify(IDENTITY_PROGRAM)}\n`);
}

async function withFixture(fn: (fx: Fixture) => Promise<void>, opts: Parameters<typeof makeFixture>[0] = {}): Promise<void> {
  const fx = makeFixture(opts);
  try {
    withDesigns(fx);
    await fn(fx);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
}

test('check exit codes: 0 without a policy, 1 when a claim violates it, 0 when the policy holds', async () => {
  await withFixture(async (fx) => {
    const plain = await run(fx, ['check', 'designs/identity.json', '-q']);
    assert.equal(plain.code, 0, plain.stderr);
    assert.match(plain.stdout, /matrix\.mds\s+refuted/);
    assert.doesNotMatch(plain.stdout, /Policy/, 'single input without a policy prints the report alone');

    const refuted = await run(fx, ['check', 'designs/identity.json', '-q', '--fail-on', 'refuted']);
    assert.equal(refuted.code, 1);
    assert.match(refuted.stdout, /Policy --fail-on refuted: policy failed \(exit 1\)\n {2}designs\/identity\.json: matrix\.mds refuted/);

    // restricted to claims that hold
    const scoped = await run(fx, ['check', 'designs/identity.json', '-q', '--fail-on', 'refuted', '--claims', 'offsets.dispersion,sbox.bijective']);
    assert.equal(scoped.code, 0, scoped.stdout);

    const aes = await run(fx, ['check', 'designs/aes.json', '-q', '--fail-on', 'any']);
    assert.equal(aes.code, 0, aes.stdout);
    assert.match(aes.stdout, /Policy --fail-on any: passed \(exit 0\)/);

    // the activity bound is not established when MDS is refuted
    const strict = await run(fx, ['check', 'designs/identity.json', '-q', '--fail-on', 'not-established', '--claims', 'activity.bound']);
    assert.equal(strict.code, 1);
  });
});

test('check exit code 2: unusable input, usage errors, failed runs and missing tools', async () => {
  await withFixture(async (fx) => {
    writeFileSync(join(fx.root, 'broken.json'), '{"model": ');
    writeFileSync(join(fx.root, 'bad-rounds.json'), JSON.stringify({ ...AES_DESIGN, rounds: 5 }));
    writeFileSync(join(fx.root, 'lean-fails.json'), JSON.stringify({ ...AES_DESIGN, rounds: 29 }));
    const cases: [string[], RegExp][] = [
      [['check', 'missing.json', '-q'], /cannot read missing\.json: ENOENT/],
      [['check', 'broken.json', '-q'], /broken\.json is not valid JSON/],
      [['check', 'bad-rounds.json', '-q'], /the engine rejected the request: \/design\/rounds: rounds 5 rejected/],
      [['check', 'designs/aes.json', '--fail-on', 'sometimes'], /--fail-on must be one of none, refuted, not-established, any/],
      [['check', 'designs/aes.json', '--format', 'pdf'], /--format must be one of/],
      [['check', 'designs/aes.json', '--frobnicate'], /Unknown option/],
      [['check', 'designs/*.yaml'], /no file matches designs\/\*\.yaml/],
      [['check'], /check needs at least one design file/],
      [['check', 'designs/*.json', '--program', 'circuit.json'], /--program needs a single design file/],
      [['check', 'designs/*.json', '--bundle', 'x.tar.gz'], /use --bundle-dir DIR for several/],
      [['check', 'lean-fails.json', '-q', '--fail-on', 'refuted'], /Policy --fail-on refuted: error \(exit 2\)\n {2}lean-fails\.json: error: /],
    ];
    for (const [argv, message] of cases) {
      const r = await run(fx, argv);
      assert.equal(r.code, 2, `${argv.join(' ')}: ${r.stdout}${r.stderr}`);
      assert.match(r.stdout + r.stderr, message, argv.join(' '));
    }
  });
  // no Lean: the run fails, which is never a pass
  await withFixture(
    async (fx) => {
      const r = await run(fx, ['check', 'designs/aes.json', '-q', '--fail-on', 'refuted']);
      assert.equal(r.code, 2, r.stdout);
      const none = await run(fx, ['check', 'designs/aes.json', '-q']);
      assert.equal(none.code, 2);
    },
    { noLake: true },
  );
  // a circuit without the native backend: native correctness is unavailable, so a policy cannot pass
  await withFixture(async (fx) => {
    const r = await run(fx, ['check', 'designs/with-circuit.json', '-q', '--fail-on', 'refuted', '--format', 'json']);
    assert.equal(r.code, 2, r.stdout);
    const doc = JSON.parse(r.stdout) as CheckRun;
    assert.deepEqual(doc.results[0]!.unavailable, ['native.correctness']);
    // the same circuit gated on its Lean claims only
    const lean = await run(fx, ['check', 'designs/with-circuit.json', '-q', '--fail-on', 'not-established', '--claims', 'circuit.equivalence,matrix.mds']);
    assert.equal(lean.code, 0, lean.stdout);
  });
});

test('check: several inputs by pattern, JSON and SARIF files, bundles and the GitHub step summary', async () => {
  await withFixture(async (fx) => {
    const summary = join(fx.root, 'summary.md');
    writeFileSync(summary, '# earlier step\n');
    const r = await run(fx, ['check', 'designs/aes.json', 'designs/*.json', '-q', '--fail-on', 'refuted', '--claims', 'matrix.mds,offsets.dispersion', '--format', 'sarif', '--output', 'out/cryptificate.sarif', '--bundle-dir', 'bundles'], {
      environ: { GITHUB_STEP_SUMMARY: summary },
    });
    assert.equal(r.code, 1, r.stderr);
    // the text report goes to stdout, the SARIF log to the file (its directory is created)
    assert.match(r.stdout, /== designs\/aes\.json/);
    assert.match(r.stdout, /designs\/identity\.json: matrix\.mds refuted/);
    const sarif = JSON.parse(readFileSync(join(fx.root, 'out', 'cryptificate.sarif'), 'utf8')) as {
      version: string;
      runs: { results: { ruleId: string; level: string; locations: { physicalLocation: { artifactLocation: { uri: string }; region?: { startLine: number } } }[] }[] }[];
    };
    assert.equal(sarif.version, '2.1.0');
    const uris = new Set(sarif.runs[0]!.results.map((x) => x.locations[0]!.physicalLocation.artifactLocation.uri));
    // aes.json given twice (by name and by pattern) is checked once
    assert.deepEqual([...uris].sort(), ['designs/aes.json', 'designs/identity.json', 'designs/with-circuit.json']);
    const mds = sarif.runs[0]!.results.find((x) => x.ruleId === 'matrix.mds' && x.locations[0]!.physicalLocation.artifactLocation.uri === 'designs/identity.json')!;
    assert.equal(mds.level, 'error');
    assert.equal(mds.locations[0]!.physicalLocation.region?.startLine, 5, 'the "matrix" key of the design file');
    // a request file: the circuit claims point into its "program"
    const eq = sarif.runs[0]!.results.find((x) => x.ruleId === 'circuit.equivalence' && x.locations[0]!.physicalLocation.artifactLocation.uri === 'designs/with-circuit.json')!;
    const withCircuit = readFileSync(join(fx.root, 'designs', 'with-circuit.json'), 'utf8');
    assert.equal(eq.locations[0]!.physicalLocation.region?.startLine, withCircuit.split('\n').findIndex((l) => l.includes('"program"')) + 1);
    // the step summary is appended, not overwritten
    const md = readFileSync(summary, 'utf8');
    assert.ok(md.startsWith('# earlier step\n## Cryptificate check'));
    assert.match(md, /\*\*Result: policy failed\*\*/);
    assert.match(md, /\| `matrix\.mds` Matrix is MDS \(branch number 5\) \| \*\*refuted\*\* \(fails policy\) \|/);
    assert.deepEqual(readdirSync(join(fx.root, 'bundles')).sort(), ['aes.tar.gz', 'identity.tar.gz', 'with-circuit.tar.gz']);

    // --no-step-summary leaves the file alone
    const before = readFileSync(summary, 'utf8');
    await run(fx, ['check', 'designs/aes.json', '-q', '--no-step-summary'], { environ: { GITHUB_STEP_SUMMARY: summary } });
    assert.equal(readFileSync(summary, 'utf8'), before);
  });
});

test('check --format json is a self-describing result that report renders again without running anything', async () => {
  await withFixture(async (fx) => {
    const r = await run(fx, ['check', 'designs/aes.json', 'designs/identity.json', '-q', '--fail-on', 'refuted', '--format', 'json', '--output', 'result.json']);
    assert.equal(r.code, 1);
    const doc = JSON.parse(readFileSync(join(fx.root, 'result.json'), 'utf8')) as CheckRun;
    assert.equal(doc.format, 'cryptificate-check/v1');
    assert.equal(doc.failOn, 'refuted');
    assert.equal(doc.exitCode, 1);
    assert.deepEqual(doc.results.map((e) => [e.input.file, e.outcome, e.violations]), [
      ['designs/aes.json', 'pass', []],
      ['designs/identity.json', 'policy-failure', ['matrix.mds']],
    ]);

    // no engine and no Lean are needed to render it again
    const noTools = { ...fx, env: { ...fx.env, lake: null } };
    const junit = await run(noTools, ['report', 'result.json', '--format', 'junit']);
    assert.equal(junit.code, 1, 'the recorded policy is kept');
    assert.match(junit.stdout, /<failure type="refuted"/);
    const relaxed = await run(noTools, ['report', 'result.json', '--fail-on', 'none', '--format', 'markdown']);
    assert.equal(relaxed.code, 0);
    assert.match(relaxed.stdout, /\*\*Result: completed\*\*/);
    // a misspelt --claims id is a usage error, never a vacuous pass
    for (const typo of ['matrix.mdss', 'MATRIX.MDS']) {
      const r = await run(noTools, ['report', 'result.json', '--fail-on', 'refuted', '--claims', typo]);
      assert.equal(r.code, 2, typo);
      assert.match(r.stderr, new RegExp(`--claims: unknown claim id "${typo.replace('.', '\\.')}"`));
    }
    assert.equal((await run(fx, ['check', 'designs/aes.json', '-q', '--fail-on', 'refuted', '--claims', 'matrix.mds,offset.dispersion'])).code, 2);
    const unknown = await run(noTools, ['report', 'circuit.json']);
    assert.equal(unknown.code, 2);
    assert.match(unknown.stdout, /is not a check or verify result, an analysis report or a bundle/);
  });
});

test('verify: several bundles, policy on re-checked claims, JSON and JUnit output', async () => {
  await withFixture(async (fx) => {
    const made = await run(fx, ['check', 'designs/aes.json', 'designs/identity.json', '-q', '--bundle-dir', 'bundles']);
    assert.equal(made.code, 0, made.stderr);
    assert.ok(existsSync(join(fx.root, 'bundles', 'identity.tar.gz')));

    const plain = await run(fx, ['verify', 'bundles/aes.tar.gz']);
    assert.equal(plain.code, 0, plain.stdout + plain.stderr);
    assert.match(plain.stdout, /All re-checked claims match\./);
    // the circuit claims of a bundle without a circuit were not run, so a strict policy passes
    const strict = await run(fx, ['verify', 'bundles/aes.tar.gz', '--fail-on', 'not-established']);
    assert.equal(strict.code, 0, strict.stdout);

    const gate = await run(fx, ['verify', 'bundles/*.tar.gz', '--fail-on', 'refuted', '--format', 'json']);
    assert.equal(gate.code, 1, 'the identity bundle re-checks to a refuted MDS claim');
    const doc = JSON.parse(gate.stdout) as VerifyRun;
    assert.equal(doc.format, 'cryptificate-verify/v1');
    assert.deepEqual(doc.results.map((e) => [e.bundle, e.outcome]), [
      ['bundles/aes.tar.gz', 'pass'],
      ['bundles/identity.tar.gz', 'policy-failure'],
    ]);
    assert.deepEqual(doc.results[1]!.violations, ['design matrix.mds']);

    const junit = await run(fx, ['verify', 'bundles/identity.tar.gz', '--fail-on', 'refuted', '--claims', 'offsets.dispersion', '--format', 'junit']);
    assert.equal(junit.code, 0, junit.stdout);
    assert.match(junit.stdout, /<testsuite name="bundles\/identity\.tar\.gz"/);

    writeFileSync(join(fx.root, 'not-a-bundle.tar.gz'), 'nope');
    const bad = await run(fx, ['verify', 'not-a-bundle.tar.gz']);
    assert.equal(bad.code, 2);
    assert.match(bad.stderr, /cannot verify not-a-bundle\.tar\.gz/);
  });
});

test('verify exit code 2 when Lean is missing, whatever the bundle records', async () => {
  await withFixture(async (fx) => {
    const made = await run(fx, ['check', 'designs/aes.json', 'designs/identity.json', '-q', '--bundle-dir', 'bundles']);
    assert.equal(made.code, 0, made.stderr);
    const noLean = { ...fx, env: { ...fx.env, lake: null } };
    // a bundle whose claims are all proved: the missing tool is not a mismatch (1) but an error (2)
    const aes = await run(noLean, ['verify', 'bundles/aes.tar.gz', '--fail-on', 'refuted']);
    assert.equal(aes.code, 2, aes.stdout);
    assert.match(aes.stdout, /Policy --fail-on refuted: error \(exit 2\)\n {2}bundles\/aes\.tar\.gz: error: the re-run ended with state failed/);
    assert.equal((await run(noLean, ['verify', 'bundles/aes.tar.gz'])).code, 2);
    // a design with a refuted claim: never a pass because nothing could be re-checked
    const id = await run(noLean, ['verify', 'bundles/identity.tar.gz', '--fail-on', 'refuted', '--format', 'json']);
    assert.equal(id.code, 2, id.stdout);
    const doc = JSON.parse(id.stdout) as VerifyRun;
    assert.equal(doc.results[0]!.outcome, 'error');
    assert.equal(doc.results[0]!.result!.state, 'failed');
    assert.ok(doc.results[0]!.result!.rows.some((r) => r.recomputedReason === 'lean-unavailable'));
  });
  // a bundle made without Lean records not_established claims; re-checking it without Lean must not pass either
  await withFixture(
    async (fx) => {
      const made = await run(fx, ['check', 'designs/identity.json', '-q', '--bundle', 'identity.tar.gz']);
      assert.equal(made.code, 2, made.stdout);
      assert.ok(existsSync(join(fx.root, 'identity.tar.gz')));
      const r = await run(fx, ['verify', 'identity.tar.gz', '--fail-on', 'refuted']);
      assert.equal(r.code, 2, r.stdout);
      assert.doesNotMatch(r.stdout, /passed/);
    },
    { noLake: true },
  );
});

test('--format html: check, verify and report write one self-contained evidence report', async () => {
  await withFixture(async (fx) => {
    const checked = await run(fx, ['check', 'designs/identity.json', '-q', '--bundle', 'identity.tar.gz', '--format', 'html', '--output', 'out/identity.html']);
    assert.equal(checked.code, 0, checked.stderr);
    assert.match(checked.stderr, /html: .*out\/identity\.html/);
    const page = readFileSync(join(fx.root, 'out', 'identity.html'), 'utf8');
    assert.match(page, /^<!DOCTYPE html>\n/);
    assert.match(page, /<title>Cryptificate evidence report: analysis [0-9a-f]{32}<\/title>/);
    assert.ok(page.includes('id="claim-matrix.mds"') && page.includes('Counterexample'));
    assert.ok(!/<script|src=/i.test(page));

    // a policy adds its outcome; the exit status is unchanged by the format
    const gated = await run(fx, ['check', 'designs/identity.json', '-q', '--fail-on', 'refuted', '--format', 'html']);
    assert.equal(gated.code, 1);
    assert.match(gated.stdout, /policy failed<\/span> \(policy --fail-on refuted, exit 1\)/);

    // report renders a bundle again, with the toolchain recorded in it, without running anything
    const noTools = { ...fx, env: { ...fx.env, lake: null } };
    const again = await run(noTools, ['report', 'identity.tar.gz', '--format', 'html']);
    assert.equal(again.code, 0, again.stderr);
    assert.ok(again.stdout.includes('Recorded toolchain (toolchain.json)'));
    assert.ok(again.stdout.includes('npx cryptificate verify identity.tar.gz'));

    const verified = await run(fx, ['verify', 'identity.tar.gz', '--format', 'html']);
    assert.equal(verified.code, 0, verified.stderr);
    assert.match(verified.stdout, /<h2 id="gate-h">Cryptificate verify<\/h2>/);
    assert.match(verified.stdout, /All re-checked claims match\./);
  });
});

test('report --format html renders experiment reports and bundles; other formats refuse them', async () => {
  await withFixture(async (fx) => {
    const src = join(ROOT, 'examples', 'bundles', 'beat-the-reference');
    const exReport = readFileSync(join(src, 'report.json'));
    writeFileSync(join(fx.root, 'experiment.json'), exReport);
    writeFileSync(join(fx.root, 'experiment.tar.gz'), readFileSync(join(src, 'beat-the-reference.tar.gz')));
    for (const file of ['experiment.json', 'experiment.tar.gz']) {
      const r = await run(fx, ['report', file, '--format', 'html']);
      assert.equal(r.code, 0, r.stderr);
      assert.match(r.stdout, /<title>Cryptificate evidence report: experiment [0-9a-f]{32}<\/title>/);
      assert.ok(r.stdout.includes('95% interval'));
    }
    for (const args of [['--format', 'markdown'], ['--format', 'html', '--fail-on', 'refuted'], []]) {
      const r = await run(fx, ['report', 'experiment.json', ...args]);
      assert.equal(r.code, 2, args.join(' '));
      assert.match(r.stderr, /report renders experiment reports only with --format html/);
    }
  });
});

test('help and unknown commands', async () => {
  await withFixture(async (fx) => {
    const help = await run(fx, ['--help']);
    assert.equal(help.code, 0);
    assert.match(help.stdout, /--fail-on none\|refuted\|not-established\|any/);
    assert.match(help.stdout, /Exit status \(check, verify, report\): 0 passed; 1 the policy failed/);
    assert.equal((await run(fx, [])).code, 2);
    assert.equal((await run(fx, ['frobnicate'])).code, 2);
  });
});
