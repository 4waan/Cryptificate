/**
 * cryptificate.json: validation, agreement with the JSON Schema, and
 * `check` reading it when no input is given.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FAIL_ON, KNOWN_CLAIM_IDS } from '../src/policy.js';
import { CONFIG_FORMATS, CONFIG_KEYS, CONFIG_TARGETS, findConfig, validateConfig } from '../src/project.js';
import type { CheckRun } from '../src/report-formats.js';
import { AES_DESIGN, IDENTITY_DESIGN, makeFixture, runCli } from './helpers.js';
import type { Fixture } from './helpers.js';

const schemaPath = fileURLToPath(new URL('../../../../schemas/project-config.schema.json', import.meta.url));

async function withProject(fn: (fx: Fixture) => Promise<void>): Promise<void> {
  const fx = makeFixture();
  try {
    mkdirSync(join(fx.root, 'designs'), { recursive: true });
    mkdirSync(join(fx.root, 'sub', 'deeper'), { recursive: true });
    writeFileSync(join(fx.root, 'designs', 'aes.json'), `${JSON.stringify(AES_DESIGN, null, 2)}\n`);
    writeFileSync(join(fx.root, 'designs', 'identity.json'), `${JSON.stringify(IDENTITY_DESIGN, null, 2)}\n`);
    await fn(fx);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
}

function writeConfig(fx: Fixture, config: unknown, dir = fx.root): void {
  writeFileSync(join(dir, 'cryptificate.json'), typeof config === 'string' ? config : `${JSON.stringify(config, null, 2)}\n`);
}

test('the validator accepts a full configuration and reports every problem with its JSON Pointer', () => {
  const full = {
    $schema: 'https://example.invalid/schema.json',
    inputs: ['designs/*.json', 'requests/**/*.json'],
    failOn: 'not-established',
    claims: ['matrix.mds', 'circuit.equivalence'],
    target: 'matrix',
    format: 'sarif',
    output: 'out/cryptificate.sarif',
    bundleDir: 'evidence',
  };
  const ok = validateConfig(full);
  assert.ok(ok.ok);
  assert.deepEqual(ok.value, { inputs: full.inputs, failOn: 'not-established', claims: full.claims, target: 'matrix', format: 'sarif', output: full.output, bundleDir: 'evidence' });

  const bad = validateConfig({ inputs: 'designs/*.json', fialOn: 'refuted', failOn: 'sometimes', claims: ['matrix.mds', 'MATRIX.MDS', 'matrix.mds'], format: 'pdf', target: 3, bundleDir: '' });
  assert.ok(!bad.ok);
  assert.deepEqual(
    bad.errors.map((e) => e.path),
    ['/fialOn', '/inputs', '/failOn', '/claims/1', '/claims/2', '/target', '/format', '/bundleDir'],
  );
  const msg = (path: string): string => bad.errors.find((e) => e.path === path)!.message;
  assert.match(msg('/fialOn'), /unknown key; the keys are \$schema, inputs, failOn/);
  assert.match(msg('/inputs'), /must be a list of strings, for example \["designs\/\*\.json"\] \(got "designs\/\*\.json"\)/);
  assert.match(msg('/failOn'), /must be one of none, refuted, not-established, any \(got "sometimes"\)/);
  assert.match(msg('/claims/1'), /unknown claim id "MATRIX\.MDS"/);
  assert.match(msg('/claims/2'), /"matrix\.mds" is listed twice/);

  for (const [doc, path] of [
    [[], ''],
    [{}, '/inputs'],
    [{ inputs: [] }, '/inputs'],
    [{ inputs: ['a.json', ''] }, '/inputs/1'],
    [{ inputs: ['a.json'], claims: [] }, '/claims'],
  ] as const) {
    const r = validateConfig(doc);
    assert.ok(!r.ok, JSON.stringify(doc));
    assert.deepEqual(r.errors.map((e) => e.path), [path], JSON.stringify(doc));
  }
});

test('schemas/project-config.schema.json and the validator agree on keys and allowed values', () => {
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as {
    $id: string;
    additionalProperties: boolean;
    required: string[];
    properties: Record<string, { enum?: string[]; items?: { enum?: string[] } }>;
  };
  assert.ok(schema.$id.endsWith('/schemas/project-config.schema.json'));
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ['inputs']);
  assert.deepEqual(Object.keys(schema.properties), [...CONFIG_KEYS]);
  assert.deepEqual(schema.properties['failOn']!.enum, [...FAIL_ON]);
  assert.deepEqual(schema.properties['format']!.enum, [...CONFIG_FORMATS]);
  assert.deepEqual(schema.properties['target']!.enum, [...CONFIG_TARGETS]);
  assert.deepEqual([...schema.properties['claims']!.items!.enum!].sort(), [...KNOWN_CLAIM_IDS].sort());
});

test('check without inputs reads the nearest cryptificate.json; paths in it are relative to its directory', async () => {
  await withProject(async (fx) => {
    writeConfig(fx, { inputs: ['designs/*.json'], failOn: 'refuted', claims: ['matrix.mds', 'offsets.dispersion'], format: 'sarif', output: 'out/result.sarif', bundleDir: 'evidence' });
    assert.equal(findConfig(join(fx.root, 'sub', 'deeper')), join(fx.root, 'cryptificate.json'));

    // run from a subdirectory: the file is found in a parent
    const r = await runCli(fx, ['check', '-q'], { cwd: join(fx.root, 'sub', 'deeper') });
    assert.equal(r.code, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /Policy --fail-on refuted on matrix\.mds, offsets\.dispersion: policy failed \(exit 1\)\n {2}designs\/identity\.json: matrix\.mds refuted/);
    const sarif = JSON.parse(readFileSync(join(fx.root, 'out', 'result.sarif'), 'utf8')) as { runs: { results: { locations: { physicalLocation: { artifactLocation: { uri: string } } }[] }[] }[] };
    const uris = new Set(sarif.runs[0]!.results.map((x) => x.locations[0]!.physicalLocation.artifactLocation.uri));
    assert.deepEqual([...uris].sort(), ['designs/aes.json', 'designs/identity.json'], 'locations relative to the directory of cryptificate.json');
    assert.deepEqual(readdirSync(join(fx.root, 'evidence')).sort(), ['aes.tar.gz', 'identity.tar.gz']);
    assert.ok(!existsSync(join(fx.root, 'sub', 'deeper', 'out')));

    // without -q the file used is named
    const named = await runCli(fx, ['check', '--format', 'json'], { cwd: join(fx.root, 'sub') });
    assert.match(named.stderr, /^config: \.\.\/cryptificate\.json\n/);
  });
});

test('options on the command line override cryptificate.json; inputs on the command line replace it', async () => {
  await withProject(async (fx) => {
    writeConfig(fx, { inputs: ['designs/*.json'], failOn: 'refuted' });
    const relaxed = await runCli(fx, ['check', '-q', '--fail-on', 'none', '--format', 'json']);
    assert.equal(relaxed.code, 0, relaxed.stderr);
    assert.equal((JSON.parse(relaxed.stdout) as CheckRun).failOn, 'none');

    const scoped = await runCli(fx, ['check', '-q', '--claims', 'offsets.dispersion,sbox.bijective']);
    assert.equal(scoped.code, 0, scoped.stdout);

    // an --output given on the command line is relative to the working directory
    const out = await runCli(fx, ['check', '-q', '--format', 'json', '--output', 'here.json'], { cwd: join(fx.root, 'sub') });
    assert.equal(out.code, 1);
    assert.ok(existsSync(join(fx.root, 'sub', 'here.json')));
    const doc = JSON.parse(readFileSync(join(fx.root, 'sub', 'here.json'), 'utf8')) as CheckRun;
    assert.deepEqual(doc.results.map((e) => e.input.file), ['designs/aes.json', 'designs/identity.json']);

    // inputs on the command line: the file is not read at all, even when it is broken
    writeConfig(fx, '{"inputs": ');
    const explicit = await runCli(fx, ['check', '-q', 'designs/aes.json', '--fail-on', 'refuted']);
    assert.equal(explicit.code, 0, explicit.stderr);
    // ... unless it is named with --config
    const named = await runCli(fx, ['check', '-q', 'designs/aes.json', '--config', 'cryptificate.json']);
    assert.equal(named.code, 2);
    assert.match(named.stderr, /cryptificate\.json is not valid JSON/);
  });
});

test('--config names a file anywhere; its failOn and claims apply to inputs given on the command line', async () => {
  await withProject(async (fx) => {
    mkdirSync(join(fx.root, 'ci'));
    writeConfig(fx, { inputs: ['../designs/aes.json'], failOn: 'refuted', claims: ['matrix.mds'] }, join(fx.root, 'ci'));
    const fromFile = await runCli(fx, ['check', '-q', '--config', 'ci/cryptificate.json', '--format', 'json']);
    assert.equal(fromFile.code, 0, fromFile.stderr);
    assert.deepEqual((JSON.parse(fromFile.stdout) as CheckRun).results.map((e) => e.input.file), ['../designs/aes.json']);
    const withInputs = await runCli(fx, ['check', '-q', '--config', 'ci/cryptificate.json', 'designs/identity.json', '--format', 'json']);
    assert.equal(withInputs.code, 1);
    const doc = JSON.parse(withInputs.stdout) as CheckRun;
    assert.deepEqual([doc.failOn, doc.claims], ['refuted', ['matrix.mds']]);
  });
});

test('an invalid or missing configuration is a usage error (exit 2) with every problem listed', async () => {
  await withProject(async (fx) => {
    const none = await runCli(fx, ['check']);
    assert.equal(none.code, 2);
    assert.match(none.stderr, /check needs at least one design file, or a cryptificate\.json in this directory or a parent \(cryptificate init writes one\)/);

    writeConfig(fx, { inputs: ['designs/*.json'], failOn: 'sometimes', claims: ['matrix.mdss'], extra: 1 });
    const bad = await runCli(fx, ['check'], { cwd: join(fx.root, 'sub') });
    assert.equal(bad.code, 2);
    assert.match(
      bad.stderr,
      /\.\.\/cryptificate\.json is not a valid project configuration \(3 problems; schema: schemas\/project-config\.schema\.json\):\n {2}\/extra: unknown key.*\n {2}\/failOn: must be one of none, refuted, not-established, any \(got "sometimes"\)\n {2}\/claims\/0: unknown claim id "matrix\.mdss"/,
    );

    writeConfig(fx, { inputs: ['designs/*.yaml'] });
    const nomatch = await runCli(fx, ['check']);
    assert.equal(nomatch.code, 2);
    assert.match(nomatch.stderr, /no file matches designs\/\*\.yaml/);

    const missing = await runCli(fx, ['check', '--config', 'nowhere.json']);
    assert.equal(missing.code, 2);
    assert.match(missing.stderr, /cannot read nowhere\.json: ENOENT/);
  });
});

test('a cryptificate.json without failOn gates on refuted claims; without the file the default stays none', async () => {
  await withProject(async (fx) => {
    writeConfig(fx, { inputs: ['designs/*.json'] });
    const r = await runCli(fx, ['check', '-q', '--format', 'json']);
    assert.equal(r.code, 1, r.stderr);
    assert.equal((JSON.parse(r.stdout) as CheckRun).failOn, 'refuted');
    // inputs on the command line do not read the file
    const plain = await runCli(fx, ['check', '-q', 'designs/identity.json', '--format', 'json']);
    assert.equal(plain.code, 0, plain.stderr);
    assert.equal((JSON.parse(plain.stdout) as CheckRun).failOn, 'none');
  });
});

type Sarif = { runs: { results: { ruleId: string; locations: { physicalLocation: { artifactLocation: { uri: string }; region?: { startLine: number } } }[] }[] }[] };

function matrixLocation(sarif: Sarif): { uri: string; line: number | undefined } {
  const hit = sarif.runs[0]!.results.find((x) => x.ruleId === 'matrix.mds' && x.locations[0]!.physicalLocation.artifactLocation.uri.endsWith('identity.json'));
  assert.ok(hit, 'a matrix.mds result for identity.json');
  const l = hit.locations[0]!.physicalLocation;
  return { uri: l.artifactLocation.uri, line: l.region?.startLine };
}

test('report resolves the inputs of a saved check result against its recorded base, wherever it runs', async () => {
  await withProject(async (fx) => {
    writeConfig(fx, { inputs: ['designs/identity.json'], failOn: 'refuted' });
    // check from sub/deeper: the inputs are relative to the directory of cryptificate.json
    const saved = await runCli(fx, ['check', '-q', '--format', 'json', '--output', 'result.json'], { cwd: join(fx.root, 'sub', 'deeper') });
    assert.equal(saved.code, 1, saved.stderr);
    const doc = JSON.parse(readFileSync(join(fx.root, 'sub', 'deeper', 'result.json'), 'utf8')) as CheckRun;
    assert.deepEqual([doc.base, doc.results.map((e) => e.input.file)], [fx.root, ['designs/identity.json']]);

    const sarif = await runCli(fx, ['report', 'result.json', '--format', 'sarif'], { cwd: join(fx.root, 'sub', 'deeper') });
    assert.equal(sarif.code, 1, sarif.stderr);
    const loc = matrixLocation(JSON.parse(sarif.stdout) as Sarif);
    assert.equal(typeof loc.line, 'number', 'the input was found from sub/deeper, so the location has a region');
    assert.match(loc.uri, /^file:\/\/.*\/designs\/identity\.json$/, 'outside the working directory: a file URI');

    // --uri-base makes the locations relative to another directory, e.g. the repository root
    const based = await runCli(fx, ['report', 'result.json', '--format', 'sarif', '--uri-base', '../..'], { cwd: join(fx.root, 'sub', 'deeper') });
    assert.deepEqual(matrixLocation(JSON.parse(based.stdout) as Sarif), { uri: 'designs/identity.json', line: loc.line });

    // the text and JSON outputs name the inputs relative to where report runs
    const json = await runCli(fx, ['report', 'result.json', '--format', 'json'], { cwd: join(fx.root, 'sub', 'deeper') });
    const again = JSON.parse(json.stdout) as CheckRun;
    assert.deepEqual([again.base, again.results.map((e) => e.input.file)], [join(fx.root, 'sub', 'deeper'), ['../../designs/identity.json']]);

    // check takes --uri-base as well
    const direct = await runCli(fx, ['check', '-q', '--format', 'sarif', '--uri-base', fx.root], { cwd: join(fx.root, 'sub') });
    assert.deepEqual(matrixLocation(JSON.parse(direct.stdout) as Sarif), { uri: 'designs/identity.json', line: loc.line });
  });
});
