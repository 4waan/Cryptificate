// Copies the brand files from assets/brand into public/brand so the header and
// favicon can use them. Missing files are fine: the header falls back to a
// text wordmark.
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(app, '..', '..', 'assets', 'brand');
const target = join(app, 'public', 'brand');

rmSync(target, { recursive: true, force: true });
const copied = [];
for (const name of ['logo.svg', 'logo-dark.svg', 'mark.svg', 'mark-dark.svg', 'favicon.svg']) {
  const from = join(source, name);
  if (existsSync(from)) {
    mkdirSync(target, { recursive: true });
    copyFileSync(from, join(target, name));
    copied.push(name);
  }
}
console.log(copied.length ? `brand: copied ${copied.join(', ')}` : 'brand: no brand files yet, using text wordmark');
