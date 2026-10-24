import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { EVIDENCE_LABELS, CLAIM_STATUSES } from '../src/index.js';

const dir = fileURLToPath(new URL('../../../../schemas/', import.meta.url));

function load(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(dir, name), 'utf8')) as Record<string, unknown>;
}

function collectRefs(node: unknown, out: string[]): void {
  if (Array.isArray(node)) node.forEach((n) => collectRefs(n, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === '$ref' && typeof v === 'string') out.push(v);
      else collectRefs(v, out);
    }
  }
}

function resolvePointer(doc: unknown, pointer: string): unknown {
  if (pointer === '' || pointer === '/') return doc;
  let cur: unknown = doc;
  for (const part of pointer.replace(/^\//, '').split('/')) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part.replace(/~1/g, '/').replace(/~0/g, '~')];
  }
  return cur;
}

test('every JSON Schema parses, has a matching $id and resolvable $refs', () => {
  const files = readdirSync(dir).filter((f) => f.endsWith('.schema.json'));
  assert.ok(files.length >= 10);
  for (const file of files) {
    const doc = load(file);
    assert.equal(doc['$schema'], 'https://json-schema.org/draft/2020-12/schema', file);
    assert.ok(String(doc['$id']).endsWith(`/schemas/${file}`), file);
    const refs: string[] = [];
    collectRefs(doc, refs);
    for (const ref of refs) {
      const [target, fragment = ''] = ref.split('#');
      const targetDoc = target ? load(target) : doc;
      assert.notEqual(resolvePointer(targetDoc, fragment), undefined, `${file}: ${ref}`);
    }
  }
});

test('claim schema uses the exact evidence labels and statuses', () => {
  const claim = load('claim.schema.json') as { properties: { status: { enum: string[] } }; $defs: unknown };
  assert.deepEqual(claim.properties.status.enum, [...CLAIM_STATUSES]);
  const labels = resolvePointer(claim, '/$defs/evidence/properties/label/anyOf/0/enum') as string[];
  assert.deepEqual([...labels].sort(), Object.values(EVIDENCE_LABELS).sort());
});
