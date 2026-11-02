import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { SchemaRegistry, UnsupportedSchemaError, jsonEqual, resolveJsonPointer } from '../src/index.js';

const BASE = 'https://github.com/4waan/Cryptificate/schemas/';
const schemasDir = fileURLToPath(new URL('../../../../schemas/', import.meta.url));
const examplesDir = fileURLToPath(new URL('../../../../examples/', import.meta.url));

function registry(): SchemaRegistry {
  const reg = new SchemaRegistry();
  for (const f of readdirSync(schemasDir).filter((n) => n.endsWith('.schema.json'))) {
    reg.add(BASE + f, JSON.parse(readFileSync(join(schemasDir, f), 'utf8')) as unknown);
  }
  return reg;
}

function check(schema: unknown, value: unknown): string[] {
  return new SchemaRegistry()
    .add('https://example.invalid/s.json', schema)
    .validate('https://example.invalid/s.json', value)
    .map((i) => `${i.path} ${i.schemaPath.split('/').pop()}`);
}

test('jsonschema: type, enum, const and numeric bounds', () => {
  assert.deepEqual(check({ type: 'integer' }, 3), []);
  assert.deepEqual(check({ type: 'integer' }, 3.5), ['/ type']);
  assert.deepEqual(check({ type: 'number' }, 3), []);
  assert.deepEqual(check({ type: ['string', 'null'] }, null), []);
  assert.deepEqual(check({ type: 'object' }, []), ['/ type']);
  assert.deepEqual(check({ enum: ['a', 1, { x: [1] }] }, { x: [1] }), []);
  assert.deepEqual(check({ enum: ['a', 1] }, '1'), ['/ enum']);
  assert.deepEqual(check({ const: { a: 1, b: 2 } }, { b: 2, a: 1 }), []);
  assert.deepEqual(check({ minimum: 1, maximum: 3 }, 0), ['/ minimum']);
  assert.deepEqual(check({ exclusiveMaximum: 3 }, 3), ['/ exclusiveMaximum']);
  assert.deepEqual(check({ multipleOf: 2 }, 6), []);
  assert.deepEqual(check({ multipleOf: 2 }, 5), ['/ multipleOf']);
  assert.deepEqual(check({ minimum: 1 }, 'not a number'), [], 'numeric keywords ignore other types');
});

test('jsonschema: strings, objects and arrays', () => {
  assert.deepEqual(check({ pattern: '^[0-9a-f]{4}$' }, 'beef'), []);
  assert.deepEqual(check({ pattern: '^[0-9a-f]{4}$' }, 'BEEF'), ['/ pattern']);
  assert.deepEqual(check({ maxLength: 2 }, 'abc'), ['/ maxLength']);
  const obj = { type: 'object', required: ['a'], properties: { a: { type: 'string' } }, additionalProperties: false };
  assert.deepEqual(check(obj, { a: 'x' }), []);
  assert.deepEqual(check(obj, {}), ['/ required']);
  assert.deepEqual(check(obj, { a: 1, b: 2 }), ['/a type', '/b additionalProperties']);
  assert.deepEqual(check({ patternProperties: { '^x': { type: 'integer' } }, additionalProperties: { type: 'string' } }, { x1: 1, y: 's' }), []);
  assert.deepEqual(check({ items: { type: 'integer' }, minItems: 2, maxItems: 3 }, [1]), ['/ minItems']);
  assert.deepEqual(check({ items: { type: 'integer' } }, [1, 'a']), ['/1 type']);
  assert.deepEqual(check({ prefixItems: [{ type: 'string' }], items: { type: 'integer' } }, ['a', 1, 2]), []);
  assert.deepEqual(check({ uniqueItems: true }, [[1], [1]]), ['/ uniqueItems']);
  assert.deepEqual(check({ properties: { 'a/b': { type: 'string' } } }, { 'a/b': 1 }), ['/a~1b type']);
});

test('jsonschema: combinators, conditionals and boolean schemas', () => {
  const one = { oneOf: [{ type: 'integer' }, { type: 'number' }] };
  assert.deepEqual(check(one, 1.5), []);
  assert.deepEqual(check(one, 1), ['/ oneOf'], 'an integer matches both alternatives');
  assert.deepEqual(check({ anyOf: [{ type: 'string' }, { type: 'null' }] }, 1), ['/ anyOf']);
  assert.deepEqual(check({ allOf: [{ minimum: 1 }, { maximum: 2 }] }, 3), ['/ maximum']);
  assert.deepEqual(check({ not: { type: 'string' } }, 's'), ['/ not']);
  const cond = { if: { properties: { k: { const: 'a' } } }, then: { required: ['x'] }, else: { required: ['y'] } };
  assert.deepEqual(check(cond, { k: 'a', x: 1 }), []);
  assert.deepEqual(check(cond, { k: 'b', x: 1 }), ['/ required']);
  assert.deepEqual(check(true, 1), []);
  assert.deepEqual(check({ properties: { a: false } }, { a: 1 }), ['/a a']);
});

test('jsonschema: references resolve against $id across documents', () => {
  const reg = new SchemaRegistry()
    .add('https://example.invalid/dir/a.json', { $id: 'https://example.invalid/dir/a.json', $ref: 'b.json#/$defs/n' })
    .add('https://example.invalid/dir/b.json', { $defs: { n: { type: 'integer', minimum: 0 }, m: { $ref: '#/$defs/n' } } });
  assert.deepEqual(reg.validate('https://example.invalid/dir/a.json', 4), []);
  assert.equal(reg.validate('https://example.invalid/dir/a.json', -1).length, 1);
  assert.equal(reg.validate('https://example.invalid/dir/b.json#/$defs/m', 'x').length, 1);
  assert.throws(() => reg.validate('https://example.invalid/dir/c.json', 1), UnsupportedSchemaError);
  assert.throws(() => reg.validate('https://example.invalid/dir/b.json#/$defs/missing', 1), UnsupportedSchemaError);
});

test('jsonschema: fails closed on keywords it does not implement', () => {
  assert.throws(() => check({ unevaluatedProperties: false }, {}), /unsupported keyword "unevaluatedProperties"/);
  assert.throws(() => check({ properties: { a: { contains: {} } } }, { a: [] }), /unsupported keyword "contains"/);
  assert.throws(() => check({ discriminator: { propertyName: 'k' } }, {}), UnsupportedSchemaError);
  const reg = new SchemaRegistry().add('https://example.invalid/s.json', { anyOf: [{ type: 'string' }, { items: { $ref: '#/$defs/nope' } }] });
  assert.deepEqual(reg.validate('https://example.invalid/s.json', 'a'), [], 'the bad branch is not reached by this value');
  assert.throws(() => reg.assertSupported('https://example.invalid/s.json'), /unresolvable \$ref/);
});

test('jsonschema: pointer helpers and structural equality', () => {
  const doc = { a: [{ 'b/c': 1, '~d': 2 }] };
  assert.equal(resolveJsonPointer(doc, '/a/0/b~1c'), 1);
  assert.equal(resolveJsonPointer(doc, '/a/0/~0d'), 2);
  assert.equal(resolveJsonPointer(doc, '/a/01'), undefined);
  assert.equal(resolveJsonPointer(doc, ''), doc);
  assert.ok(jsonEqual({ a: [1, { b: null }] }, { a: [1, { b: null }] }));
  assert.ok(!jsonEqual({ a: 1 }, { a: 1, b: undefined }));
  assert.ok(!jsonEqual([1], { 0: 1 }));
});

test('jsonschema: every schema file evaluates with this validator', () => {
  const reg = registry();
  for (const f of readdirSync(schemasDir).filter((n) => n.endsWith('.schema.json'))) {
    // throws on an unsupported keyword or an unresolvable reference anywhere in the schema
    assert.ok(reg.assertSupported(BASE + f) > 0, f);
  }
});

test('jsonschema: recorded reports and example inputs validate against the published schemas', () => {
  const reg = registry();
  let reports = 0;
  for (const name of readdirSync(join(examplesDir, 'bundles'))) {
    let text: string;
    try {
      text = readFileSync(join(examplesDir, 'bundles', name, 'report.json'), 'utf8');
    } catch {
      continue;
    }
    const report = JSON.parse(text) as { kind: string };
    const schema = report.kind === 'analysis' ? 'analysis-report.schema.json' : 'experiment-report.schema.json';
    assert.deepEqual(reg.validate(BASE + schema, report), [], name);
    reports++;
  }
  assert.ok(reports >= 8, `${reports} recorded reports`);
  for (const f of readdirSync(join(examplesDir, 'designs')).filter((n) => n.endsWith('.json'))) {
    const doc = JSON.parse(readFileSync(join(examplesDir, 'designs', f), 'utf8')) as unknown;
    assert.deepEqual(reg.validate(BASE + 'candidate-design.schema.json', doc), [], f);
  }
  for (const f of readdirSync(join(examplesDir, 'programs')).filter((n) => n.endsWith('.json'))) {
    const doc = JSON.parse(readFileSync(join(examplesDir, 'programs', f), 'utf8')) as unknown;
    assert.deepEqual(reg.validate(BASE + 'program.schema.json', doc), [], f);
  }
  // and a broken report is caught
  const broken = JSON.parse(readFileSync(join(examplesDir, 'bundles', 'identity', 'report.json'), 'utf8')) as { claims: Array<{ status: string }> };
  broken.claims[0]!.status = 'probably';
  assert.ok(reg.validate(BASE + 'analysis-report.schema.json', broken).some((i) => i.path === '/claims/0/status'));
});
