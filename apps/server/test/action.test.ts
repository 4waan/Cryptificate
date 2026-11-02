/**
 * The "Check the inputs" step of action.yml, run with bash -e (as Actions
 * runs it) against the built command, the fixture checkout and its fake
 * engine and Lean. With empty inputs it applies cryptificate.json; with
 * inputs it keeps the default policy refuted.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CheckRun } from '../src/report-formats.js';
import { AES_DESIGN, IDENTITY_DESIGN, makeFixture } from './helpers.js';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));

/** The `run: |` script of the step with `id: check`. */
function checkStepScript(): string {
  const lines = readFileSync(join(repo, 'action.yml'), 'utf8').split('\n');
  const id = lines.findIndex((l) => l.trim() === 'id: check');
  assert.ok(id > 0, 'action.yml has a step with id: check');
  const start = lines.findIndex((l, k) => k > id && l.trim() === 'run: |');
  const indent = (lines[start + 1] ?? '').search(/\S/);
  const body: string[] = [];
  for (let k = start + 1; k < lines.length; k++) {
    const l = lines[k]!;
    if (l.trim() !== '' && l.search(/\S/) < indent) break;
    body.push(l.slice(indent));
  }
  return body.join('\n');
}

interface SarifLog {
  runs: { results: { ruleId: string; locations: { physicalLocation: { artifactLocation: { uri: string }; region?: { startLine: number } } }[] }[] }[];
}

interface StepRun {
  outputs: Record<string, string>;
  result: CheckRun;
  sarif: SarifLog;
  junit: string;
  log: string;
}

/**
 * Run the step in `project` (the working-directory). GITHUB_WORKSPACE, the
 * checkout root, defaults to `project`; pass it in `inputs` to differ.
 */
function runStep(project: string, fx: ReturnType<typeof makeFixture>, inputs: Record<string, string>): StepRun {
  const runner = mkdtempSync(join(tmpdir(), 'cryptificate-runner-'));
  try {
    const outputFile = join(runner, 'github-output');
    writeFileSync(outputFile, '');
    const env: NodeJS.ProcessEnv = {
      PATH: process.env['PATH'],
      HOME: process.env['HOME'],
      GITHUB_ACTION_PATH: repo,
      GITHUB_OUTPUT: outputFile,
      GITHUB_WORKSPACE: project,
      RUNNER_TEMP: runner,
      CRYPTIFICATE_ROOT: fx.root,
      CRYPTIFICATE_HOME: join(runner, 'home'),
      CRYPTIFICATE_ENGINE: fx.env.engine.path!,
      CRYPTIFICATE_LAKE: fx.env.lake!,
      CRYPTIFICATE_REVISION: 'test',
      INPUT_PATTERNS: '',
      INPUT_FAIL_ON: '',
      INPUT_CLAIMS: '',
      INPUT_TARGET: '',
      INPUT_STEP_SUMMARY: 'false',
      INPUT_PROOF_CACHE: 'false',
      ...inputs,
    };
    const r = spawnSync('bash', ['-e', '-c', checkStepScript()], { cwd: project, env, encoding: 'utf8', timeout: 120_000 });
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    const outputs = Object.fromEntries(
      readFileSync(outputFile, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
    );
    const result = JSON.parse(readFileSync(join(runner, 'cryptificate', 'result.json'), 'utf8')) as CheckRun;
    const sarif = JSON.parse(readFileSync(join(runner, 'cryptificate', 'cryptificate.sarif'), 'utf8')) as SarifLog;
    const junit = readFileSync(join(runner, 'cryptificate', 'cryptificate.junit.xml'), 'utf8');
    return { outputs, result, sarif, junit, log: `${r.stdout}\n${r.stderr}` };
  } finally {
    rmSync(runner, { recursive: true, force: true });
  }
}

test('the action step records the exit status of check and still writes SARIF and JUnit when the policy fails', () => {
  const fx = makeFixture();
  try {
    const project = join(fx.root, 'project');
    mkdirSync(join(project, 'designs'), { recursive: true });
    writeFileSync(join(project, 'designs', 'aes.json'), JSON.stringify(AES_DESIGN));
    writeFileSync(join(project, 'designs', 'identity.json'), JSON.stringify(IDENTITY_DESIGN));

    const pass = runStep(project, fx, { INPUT_PATTERNS: 'designs/aes.json', INPUT_FAIL_ON: 'refuted' });
    assert.equal(pass.outputs['exit-code'], '0', pass.log);
    assert.equal(pass.outputs['outcome'], 'pass');

    const failed = runStep(project, fx, { INPUT_PATTERNS: 'designs/*.json', INPUT_FAIL_ON: 'refuted' });
    assert.equal(failed.outputs['exit-code'], '1', failed.log);
    assert.equal(failed.outputs['outcome'], 'policy-failure');
    assert.equal(failed.result.failOn, 'refuted');
    assert.match(failed.outputs['sarif-file']!, /cryptificate\.sarif$/);
    assert.ok(failed.junit.includes('<failure type="refuted"'), 'the JUnit file is written although report exits 1');
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test('the action step reads cryptificate.json when inputs is empty, and defaults to refuted otherwise', () => {
  const fx = makeFixture();
  try {
    const project = join(fx.root, 'project');
    mkdirSync(join(project, 'designs'), { recursive: true });
    writeFileSync(join(project, 'designs', 'aes.json'), JSON.stringify(AES_DESIGN));
    writeFileSync(join(project, 'designs', 'identity.json'), JSON.stringify(IDENTITY_DESIGN));
    writeFileSync(join(project, 'cryptificate.json'), JSON.stringify({ inputs: ['designs/aes.json'], failOn: 'not-established', claims: ['matrix.mds', 'offsets.dispersion'], format: 'text', bundleDir: 'local' }));

    // empty inputs: the inputs, the policy and the scope of cryptificate.json
    const fromConfig = runStep(project, fx, {});
    assert.equal(fromConfig.outputs['exit-code'], '0', fromConfig.log);
    assert.equal(fromConfig.outputs['outcome'], 'pass');
    assert.deepEqual([fromConfig.result.failOn, fromConfig.result.claims], ['not-established', ['matrix.mds', 'offsets.dispersion']]);
    assert.deepEqual(fromConfig.result.results.map((e) => e.input.file), ['designs/aes.json']);
    assert.match(fromConfig.outputs['sarif-file']!, /cryptificate\.sarif$/);

    // the fail-on input overrides the file
    writeFileSync(join(project, 'cryptificate.json'), JSON.stringify({ inputs: ['designs/*.json'], failOn: 'none' }));
    const relaxed = runStep(project, fx, {});
    assert.equal(relaxed.outputs['exit-code'], '0', relaxed.log);
    assert.equal(relaxed.result.failOn, 'none');
    const strict = runStep(project, fx, { INPUT_FAIL_ON: 'refuted' });
    assert.equal(strict.outputs['exit-code'], '1', strict.log);
    assert.equal(strict.outputs['outcome'], 'policy-failure');

    // a file without failOn: refuted
    writeFileSync(join(project, 'cryptificate.json'), JSON.stringify({ inputs: ['designs/*.json'] }));
    const unset = runStep(project, fx, {});
    assert.equal(unset.outputs['exit-code'], '1', unset.log);
    assert.equal(unset.result.failOn, 'refuted');
    assert.doesNotMatch(unset.log, /::warning::/);
    // the policy none is kept, with a warning in the log
    assert.match(relaxed.log, /::warning::Cryptificate: the policy is none, so no claim status fails this job/);

    // explicit inputs and no fail-on: refuted, as before cryptificate.json existed
    const explicit = runStep(project, fx, { INPUT_PATTERNS: 'designs/identity.json' });
    assert.equal(explicit.outputs['exit-code'], '1', explicit.log);
    assert.equal(explicit.result.failOn, 'refuted');
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

/** The SARIF locations of the refuted matrix.mds claim of identity.json. */
function identityLocations(sarif: SarifLog): { uri: string; line: number | undefined }[] {
  return sarif.runs[0]!.results
    .filter((x) => x.ruleId === 'matrix.mds')
    .map((x) => x.locations[0]!.physicalLocation)
    .map((l) => ({ uri: l.artifactLocation.uri, line: l.region?.startLine }))
    .filter((l) => l.uri.endsWith('identity.json'));
}

test('the SARIF locations are relative to the repository root when working-directory is a subdirectory', () => {
  const fx = makeFixture();
  try {
    // as init writes it in a subdirectory: working-directory crypto, the config in it
    const workspace = join(fx.root, 'workspace');
    const sub = join(workspace, 'crypto');
    mkdirSync(join(sub, 'cryptificate', 'designs'), { recursive: true });
    writeFileSync(join(sub, 'cryptificate', 'designs', 'identity.json'), JSON.stringify(IDENTITY_DESIGN, null, 2));
    writeFileSync(join(sub, 'cryptificate.json'), JSON.stringify({ inputs: ['cryptificate/designs/*.json'], failOn: 'refuted' }));
    const fromConfig = runStep(sub, fx, { GITHUB_WORKSPACE: workspace });
    assert.equal(fromConfig.outputs['exit-code'], '1', fromConfig.log);
    const [loc] = identityLocations(fromConfig.sarif);
    assert.equal(loc?.uri, 'crypto/cryptificate/designs/identity.json');
    assert.equal(typeof loc?.line, 'number', 'the location has a region');

    // the same with inputs given to the action
    const explicit = runStep(sub, fx, { GITHUB_WORKSPACE: workspace, INPUT_PATTERNS: 'cryptificate/designs/identity.json' });
    assert.deepEqual(identityLocations(explicit.sarif), [loc]);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test('with cryptificate.json in a parent of working-directory, the SARIF and JUnit locations name the right files', () => {
  const fx = makeFixture();
  try {
    const workspace = join(fx.root, 'workspace');
    const sub = join(workspace, 'sub');
    mkdirSync(join(sub, 'designs'), { recursive: true });
    mkdirSync(join(sub, 'deeper'));
    writeFileSync(join(sub, 'designs', 'identity.json'), JSON.stringify(IDENTITY_DESIGN, null, 2));
    writeFileSync(join(sub, 'cryptificate.json'), JSON.stringify({ inputs: ['designs/*.json'], failOn: 'refuted' }));
    const r = runStep(join(sub, 'deeper'), fx, { GITHUB_WORKSPACE: workspace });
    assert.equal(r.outputs['exit-code'], '1', r.log);
    // check records the inputs relative to the directory of the file, and that directory
    assert.deepEqual(r.result.results.map((e) => e.input.file), ['designs/identity.json']);
    assert.equal(r.result.base, sub);
    const [loc] = identityLocations(r.sarif);
    assert.equal(loc?.uri, 'sub/designs/identity.json');
    assert.equal(typeof loc?.line, 'number', 'the file was found, so the location has a region');
    assert.ok(r.junit.includes('../designs/identity.json'), 'report names the input relative to where it runs');
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});
