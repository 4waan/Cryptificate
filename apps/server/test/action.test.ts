/**
 * The "Check the inputs" step of action.yml, run with bash -e (as Actions
 * runs it) against the built command, the fixture checkout and its fake
 * engine and Lean.
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

interface StepRun {
  outputs: Record<string, string>;
  result: CheckRun;
  junit: string;
  log: string;
}

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
    const junit = readFileSync(join(runner, 'cryptificate', 'cryptificate.junit.xml'), 'utf8');
    return { outputs, result, junit, log: `${r.stdout}\n${r.stderr}` };
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
