import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crateDigest, crateFiles } from '../src/native.js';

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');

test('crate files follow the engine embedding order and digest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cfy-crate-'));
  try {
    mkdirSync(join(dir, 'src', 'a'), { recursive: true });
    writeFileSync(join(dir, 'Cargo.toml'), '[package]\n');
    writeFileSync(join(dir, 'src', 'lib.rs'), 'pub mod a;\n');
    writeFileSync(join(dir, 'src', 'a.rs'), 'pub mod b;\n');
    writeFileSync(join(dir, 'src', 'a', 'b.rs'), '\n');
    writeFileSync(join(dir, 'build.rs'), 'fn main() {}\n');
    const files = crateFiles(dir);
    // Path ordering compares components: "a" sorts before "a.rs".
    assert.deepEqual(files, ['Cargo.toml', 'src/a/b.rs', 'src/a.rs', 'src/lib.rs', 'build.rs']);
    const contents: Record<string, string> = {
      'Cargo.toml': '[package]\n',
      'src/a/b.rs': '\n',
      'src/a.rs': 'pub mod b;\n',
      'src/lib.rs': 'pub mod a;\n',
      'build.rs': 'fn main() {}\n',
    };
    const all = files.map((f) => `${f}\0${sha(contents[f]!)}\0`).join('');
    assert.equal(crateDigest(dir, files), `sha256:${sha(all)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
