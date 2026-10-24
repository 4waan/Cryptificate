import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/proc.js';
import { sanitizeLog } from '../src/sanitize.js';

test('captured output is bounded', async () => {
  const r = await run(process.execPath, ['-e', 'process.stdout.write("x".repeat(100000))'], { maxOutputBytes: 1000 });
  assert.equal(r.code, 0);
  assert.equal(r.stdout.length, 1000);
  assert.equal(r.stdoutTruncated, true);
});

test('arguments are passed without a shell', async () => {
  const r = await run(process.execPath, ['-e', 'console.log(process.argv[1])', '$(echo injected); rm -rf /'], {});
  assert.equal(r.stdout.trim(), '$(echo injected); rm -rf /');
});

test('stdin is delivered and timeouts are reported', async () => {
  const echo = await run(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)'], { input: '{"a":1}' });
  assert.equal(echo.stdout, '{"a":1}');
  const slow = await run(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { timeoutMs: 200 });
  assert.equal(slow.timedOut, true);
  assert.ok(slow.ms < 5000);
});

test('abort kills the command', async () => {
  const c = new AbortController();
  setTimeout(() => c.abort(), 100);
  const r = await run(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { signal: c.signal });
  assert.equal(r.cancelled, true);
});

test('missing commands are reported, not thrown', async () => {
  const r = await run('/nonexistent/cryptificate-engine', [], {});
  assert.ok(r.spawnError);
});

test('logs lose escapes, control characters and local paths', () => {
  const s = sanitizeLog('\u001b[31merror\u001b[0m at /work/repo/lean/x.lean\u0007\n', { replacements: [['/work/repo', '<repo>']] });
  assert.equal(s, 'error at <repo>/lean/x.lean\n');
});
