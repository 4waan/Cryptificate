/**
 * `cryptificate import`: round constants from Plonky3 and HorizenLabs sources
 * (excerpts of the published files, see the fixtures' headers), printed lists,
 * JSON and CSV, into the Poseidon2 layout of a design.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAnalysisRequest } from '@cryptificate/schema';
import { ImportError, detectFormat, inferRounds, intoDesign, parseConstants, parseCsv, parseHorizen, parseJson, parsePlonky3 } from '../src/import.js';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const fixtures = join(root, 'apps/server/test/fixtures/import');
const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));

function fixture(name: string): string {
  return readFileSync(join(fixtures, name), 'utf8');
}

function example(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, 'examples/designs', `${name}.json`), 'utf8')) as Record<string, unknown>;
}

/** The explicit constants of an example design, as numbers. */
function exampleRows(name: string): bigint[][] {
  const c = example(name)['constants'] as { values: string[][] };
  return c.values.map((r) => r.map((x) => BigInt(x)));
}

test('Plonky3 split arrays: KoalaBear width 16, R_F = 8, R_P = 20', () => {
  const text = fixture('plonky3-koalabear-rc16.rs');
  assert.equal(detectFormat('poseidon2.rs', text), 'plonky3');
  const c = parsePlonky3(text);
  assert.equal(c.width, 16);
  assert.equal(c.fullRounds, 8);
  assert.equal(c.partialRounds, 20);
  assert.equal(c.rows.length, 28);
  // EXTERNAL_INITIAL[0][0], INTERNAL[0] padded with zeros, EXTERNAL_FINAL[3][15].
  assert.equal(c.rows[0]![0], 0x7ee56a48n);
  assert.deepEqual(c.rows[4], [0x54dfeb5dn, ...new Array<bigint>(15).fill(0n)]);
  assert.equal(c.rows[23]![0], 0x1e66cec2n);
  assert.equal(c.rows[27]![15], 0x3466c7can);
  assert.match(c.source, /KOALABEAR_POSEIDON2_RC_16_EXTERNAL_INITIAL/);
  // The type `[[KoalaBear; 16]; 4]` and the doc comments are not read as constants.
  assert.ok(c.rows.every((r) => r.length === 16));
  assert.throws(() => parsePlonky3(text, 'BABYBEAR_RC16'), /found: KOALABEAR_POSEIDON2_RC_16/);
});

test('Plonky3: the older names, decimal literals with suffixes, and several instances', () => {
  const src = `
    pub const BABYBEAR_RC4_EXTERNAL_INITIAL: [[BabyBear; 4]; 1] = BabyBear::new_2d_array([[1, 2u32, 0x3, 4_0]]);
    pub const BABYBEAR_RC4_INTERNAL: [BabyBear; 2] = BabyBear::new_array([5, 6]);
    pub const BABYBEAR_RC4_EXTERNAL_FINAL: [[BabyBear; 4]; 1] = [[BabyBear::new(7), BabyBear::new(8), BabyBear::new(9), BabyBear::new(10)]];
    pub const OTHER_EXTERNAL_INITIAL: [[BabyBear; 4]; 0] = [];
    pub const OTHER_INTERNAL: [BabyBear; 0] = [];
    pub const OTHER_EXTERNAL_FINAL: [[BabyBear; 4]; 0] = [];
  `;
  assert.throws(() => parsePlonky3(src), /several instances found, choose one with --name: BABYBEAR_RC4, OTHER/);
  const c = parsePlonky3(src, 'BABYBEAR_RC4');
  assert.deepEqual(c.rows, [
    [1n, 2n, 3n, 40n],
    [5n, 0n, 0n, 0n],
    [6n, 0n, 0n, 0n],
    [7n, 8n, 9n, 10n],
  ]);
  assert.equal(c.fullRounds, 2);
  assert.equal(c.partialRounds, 2);
});

test('HorizenLabs instance file: BN254 RC3 is the BN254 example, and imports into the reference design', () => {
  const text = fixture('horizen-bn256-rc3.rs');
  assert.equal(detectFormat('poseidon2_instance_bn256.rs', text), 'horizen');
  const c = parseHorizen(text);
  assert.equal(c.width, 3);
  assert.equal(c.fullRounds, 8);
  assert.equal(c.partialRounds, 56);
  assert.deepEqual(c.rows, exampleRows('poseidon2-bn254-grain'));
  // Into the profile's reference design: the same design as the example.
  const { design, notices } = intoDesign(example('poseidon2-bn254'), c);
  assert.deepEqual(notices, []);
  assert.deepEqual(design, example('poseidon2-bn254-grain'));
  assert.ok(validateAnalysisRequest({ design }).ok);
});

test('the printed list of print_round_constants, JSON split form and CSV give the same rows', () => {
  const rows = exampleRows('koalabear-t4-grain');
  const printed = fixture('koalabear-t4-print.txt');
  assert.equal(detectFormat('constants.txt', printed), 'horizen');
  assert.throws(() => parseHorizen(printed), /needs the width/);
  assert.deepEqual(parseHorizen(printed, { width: 4 }).rows, rows);
  const split = parseJson(fixture('koalabear-t4-split.json'));
  assert.deepEqual(split.rows, rows);
  assert.equal(split.partialRounds, 20);
  const csv = parseCsv(fixture('koalabear-t4.csv'));
  assert.deepEqual(csv.rows, rows);
  assert.deepEqual([csv.fullRounds, csv.partialRounds], [8, 20]);
  // Rows, a flat list, explicit constants and a whole design.
  const decimal = rows.map((r) => r.map(String));
  assert.deepEqual(parseJson(JSON.stringify(decimal)).rows, rows);
  assert.deepEqual(parseJson(JSON.stringify(decimal.flat()), { width: 4 }).rows, rows);
  assert.deepEqual(parseJson(JSON.stringify(example('koalabear-t4-grain'))).rows, rows);
  assert.deepEqual(parseJson(JSON.stringify({ kind: 'explicit', values: decimal })).rows, rows);
});

test('importing into a design sets the constants and the round numbers, and checks width and range', () => {
  const c = parseCsv(fixture('koalabear-t4.csv'));
  const base = { ...example('koalabear-t4'), partialRounds: 13 };
  const { design, notices } = intoDesign(base, c);
  assert.deepEqual(design, example('koalabear-t4-grain'));
  assert.deepEqual(notices, ["partialRounds set to 20 (the base design has 13), as the constants' layout gives"]);
  assert.ok(validateAnalysisRequest({ design }).ok);
  // A request object is accepted as the base too.
  assert.deepEqual(intoDesign({ design: example('koalabear-t4') }, c).design, example('koalabear-t4-grain'));
  assert.throws(() => intoDesign(example('poseidon2-bn254'), c), /width 4 and the base design width 3/);
  assert.throws(() => intoDesign(example('aes'), c), /must be a HADES design/);
  const big = parseCsv('2130706433,1,1,1\n2,0,0,0\n3,3,3,3\n');
  assert.throws(() => intoDesign(example('koalabear-t4'), big), /round 0, position 0: 2130706433 is not below the modulus 2130706433/);
});

test('inputs that are not in the Poseidon2 layout, or not numbers, are rejected', () => {
  // A full row between partial rows.
  assert.throws(() => inferRounds([[1n, 1n], [2n, 0n], [3n, 3n], [4n, 0n], [5n, 5n]]), ImportError);
  assert.throws(() => parseCsv('1,2,3\n4,5\n'), /row 1 has 2 values, row 0 has 3/);
  assert.throws(() => parseCsv('1,2\nx,y\n'), /line 2: not a row of numbers/);
  assert.throws(() => parseJson('[[1, 2], [3, 1e300]]'), /not an exact non-negative integer/);
  assert.throws(() => parseJson('[[1, 2], [3, 9007199254740993]]'), /write large values as strings/);
  assert.throws(() => parseJson('[["1", "-2"]]'), /is not a number/);
  assert.throws(() => parseConstants('plonky3', 'const X: u32 = 5;'), /no <NAME>_EXTERNAL_INITIAL/);
  assert.throws(() => parseHorizen('pub static ref RC3: Vec<Vec<Scalar>> = vec![vec![from_hex("zz")]];'), /is not a number/);
  assert.throws(() => parseHorizen('Number of round constants: 3\n[1, 0, 2, 0]', { width: 2 }), /announces 3 round constants and lists 4/);
  assert.throws(() => detectFormat('x.rs', 'fn main() {}'), /pass --format/);
});

test('cryptificate import on the command line', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cryptificate-import-'));
  try {
    const out = join(dir, 'design.json');
    const r = spawnSync(process.execPath, [cli, 'import', join(fixtures, 'horizen-bn256-rc3.rs'), '--base', join(root, 'examples/designs/poseidon2-bn254.json'), '-o', out], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /read RC3 \(horizen\): 64 rounds of width 3, R_F = 8, R_P = 56/);
    assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')), example('poseidon2-bn254-grain'));
    const bad = spawnSync(process.execPath, [cli, 'import', join(fixtures, 'plonky3-koalabear-rc16.rs'), '--base', join(root, 'examples/designs/koalabear-t4.json')], { encoding: 'utf8' });
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /width 16 and the base design width 4/);
    const missing = spawnSync(process.execPath, [cli, 'import', join(fixtures, 'koalabear-t4.csv')], { encoding: 'utf8' });
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /needs --base/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
