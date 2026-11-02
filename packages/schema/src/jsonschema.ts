/**
 * A small JSON Schema (draft 2020-12) validator for the schemas in
 * `schemas/`. It implements the assertion keywords those schemas and the
 * OpenAPI description use and fails closed: a schema with any other keyword
 * makes validation throw instead of silently ignoring the keyword.
 *
 * It exists so that tests and integrators can check documents against the
 * published schemas without a third-party validator. It is not a complete
 * implementation of the specification: `format` is an annotation only,
 * there is no `unevaluated*`, `dependent*`, `contains` or dynamic reference
 * support, and `$id` is honoured only at the root of a registered document.
 */

export interface SchemaIssue {
  /** JSON Pointer into the instance. */
  path: string;
  /** JSON Pointer into the schema (relative to the schema resource). */
  schemaPath: string;
  message: string;
}

/** Keywords that carry no assertion; they are accepted and ignored. */
const ANNOTATIONS = new Set([
  '$schema',
  '$id',
  '$comment',
  '$defs',
  'title',
  'description',
  'examples',
  'default',
  'deprecated',
  'readOnly',
  'writeOnly',
  'format',
  'contentMediaType',
  'contentEncoding',
]);

/** Keywords this validator asserts. */
const ASSERTIONS = new Set([
  '$ref',
  'type',
  'enum',
  'const',
  'properties',
  'patternProperties',
  'additionalProperties',
  'required',
  'minProperties',
  'maxProperties',
  'items',
  'prefixItems',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'pattern',
  'allOf',
  'anyOf',
  'oneOf',
  'not',
  'if',
  'then',
  'else',
]);

export const SUPPORTED_SCHEMA_KEYWORDS: readonly string[] = [...ANNOTATIONS, ...ASSERTIONS];

export class UnsupportedSchemaError extends Error {}

type Schema = boolean | Record<string, unknown>;

function escape(key: string): string {
  return key.replace(/~/g, '~0').replace(/\//g, '~1');
}

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

function hasType(value: unknown, type: string): boolean {
  const t = typeOf(value);
  return t === type || (type === 'number' && t === 'integer');
}

/** Structural equality of JSON values (object key order is irrelevant). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => jsonEqual(x, bb[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  const bk = Object.keys(bo);
  return ak.length === bk.length && ak.every((k) => Object.prototype.hasOwnProperty.call(bo, k) && jsonEqual(ao[k], bo[k]));
}

/**
 * Resolve a JSON Pointer (RFC 6901, plain string form: no leading '#' and no
 * percent-decoding) inside a document. Returns undefined when nothing is there.
 */
export function resolveJsonPointer(doc: unknown, pointer: string): unknown {
  if (pointer === '') return doc;
  if (!pointer.startsWith('/')) return undefined;
  let cur: unknown = doc;
  for (const raw of pointer.slice(1).split('/')) {
    const part = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (cur === null || typeof cur !== 'object') return undefined;
    if (Array.isArray(cur)) {
      if (!/^(0|[1-9][0-9]*)$/.test(part)) return undefined;
      cur = cur[Number(part)];
    } else {
      if (!Object.prototype.hasOwnProperty.call(cur, part)) return undefined;
      cur = (cur as Record<string, unknown>)[part];
    }
  }
  return cur;
}

/**
 * A set of schema documents addressed by absolute URI. `$ref` values are
 * resolved against the `$id` of the document that holds them (or the URI the
 * document was registered under).
 */
export class SchemaRegistry {
  private readonly docs = new Map<string, unknown>();

  /** Register a document; its root `$id`, when present, is registered too. */
  add(uri: string, doc: unknown): this {
    this.docs.set(stripFragment(uri), doc);
    if (doc && typeof doc === 'object' && typeof (doc as Record<string, unknown>)['$id'] === 'string') {
      this.docs.set(stripFragment(new URL((doc as Record<string, string>)['$id'] as string, uri).href), doc);
    }
    return this;
  }

  has(uri: string): boolean {
    return this.docs.has(stripFragment(uri));
  }

  /** Resolve a reference against a base URI to the schema it names. */
  resolve(ref: string, base: string): { schema: unknown; base: string } {
    const abs = new URL(ref, base);
    // A URI fragment is percent-encoded (RFC 6901 section 6); the pointer inside it is not.
    let fragment: string;
    try {
      fragment = decodeURIComponent(abs.hash.replace(/^#/, ''));
    } catch {
      throw new UnsupportedSchemaError(`malformed fragment in $ref ${ref} (from ${base})`);
    }
    abs.hash = '';
    const doc = this.docs.get(abs.href);
    if (doc === undefined) throw new UnsupportedSchemaError(`unresolvable $ref ${ref} (from ${base})`);
    const target = resolveJsonPointer(doc, fragment);
    if (target === undefined) throw new UnsupportedSchemaError(`unresolvable $ref ${ref} (from ${base})`);
    const docBase = typeof (doc as Record<string, unknown>)['$id'] === 'string' ? new URL((doc as Record<string, string>)['$id'] as string, abs.href).href : abs.href;
    return { schema: target, base: docBase };
  }

  /**
   * Validate `value` against the schema at `ref` (an absolute URI, possibly
   * with a JSON Pointer fragment). Returns the list of issues, empty when the
   * value is valid. Throws UnsupportedSchemaError for a schema this validator
   * cannot evaluate faithfully.
   */
  validate(ref: string, value: unknown): SchemaIssue[] {
    const { schema, base } = this.resolve(ref, ref);
    const issues: SchemaIssue[] = [];
    this.check(schema as Schema, base, value, '', '', issues, 0);
    return issues;
  }

  /**
   * Walk the whole schema at `ref` (not only the branches a value takes) and
   * throw UnsupportedSchemaError for any keyword this validator does not
   * implement or any `$ref` that does not resolve. Returns the number of
   * subschemas visited.
   */
  assertSupported(ref: string): number {
    const { schema, base } = this.resolve(ref, ref);
    const seen = new Set<unknown>();
    let count = 0;
    const walk = (s: unknown, b: string, at: string): void => {
      if (typeof s === 'boolean') return;
      if (s === null || typeof s !== 'object' || Array.isArray(s)) throw new UnsupportedSchemaError(`not a schema at ${at}`);
      if (seen.has(s)) return;
      seen.add(s);
      count++;
      const o = s as Record<string, unknown>;
      for (const kw of Object.keys(o)) {
        if (!ANNOTATIONS.has(kw) && !ASSERTIONS.has(kw)) throw new UnsupportedSchemaError(`unsupported keyword "${kw}" at ${at}`);
      }
      if (typeof o['$id'] === 'string') b = new URL(o['$id'], b).href;
      if (typeof o['$ref'] === 'string') {
        const r = this.resolve(o['$ref'], b);
        walk(r.schema, r.base, `${at}/$ref`);
      }
      for (const kw of ['properties', 'patternProperties', '$defs']) {
        for (const [k, v] of Object.entries((o[kw] ?? {}) as Record<string, unknown>)) walk(v, b, `${at}/${kw}/${escape(k)}`);
      }
      for (const kw of ['items', 'additionalProperties', 'not', 'if', 'then', 'else']) if (kw in o) walk(o[kw], b, `${at}/${kw}`);
      for (const kw of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) {
        ((o[kw] ?? []) as unknown[]).forEach((v, i) => walk(v, b, `${at}/${kw}/${i}`));
      }
    };
    walk(schema, base, '');
    return count;
  }

  private check(schema: Schema, base: string, value: unknown, path: string, spath: string, out: SchemaIssue[], depth: number): void {
    if (depth > 64) throw new UnsupportedSchemaError(`schema nesting deeper than 64 at ${spath}`);
    const fail = (kw: string, message: string): void => {
      out.push({ path: path || '/', schemaPath: `${spath}/${kw}`, message });
    };
    if (schema === true) return;
    if (schema === false) {
      out.push({ path: path || '/', schemaPath: spath || '/', message: 'no value is allowed here' });
      return;
    }
    if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
      throw new UnsupportedSchemaError(`not a schema at ${spath || '/'}`);
    }
    for (const kw of Object.keys(schema)) {
      if (!ANNOTATIONS.has(kw) && !ASSERTIONS.has(kw)) throw new UnsupportedSchemaError(`unsupported keyword "${kw}" at ${spath || '/'}`);
    }
    if (typeof schema['$id'] === 'string') base = new URL(schema['$id'], base).href;
    const sub = (s: unknown, v: unknown, p: string, sp: string, into: SchemaIssue[] = out): void =>
      this.check(s as Schema, base, v, p, sp, into, depth + 1);
    const passes = (s: unknown, sp: string): boolean => {
      const tmp: SchemaIssue[] = [];
      sub(s, value, path, sp, tmp);
      return tmp.length === 0;
    };

    if (typeof schema['$ref'] === 'string') {
      const r = this.resolve(schema['$ref'], base);
      this.check(r.schema as Schema, r.base, value, path, `${spath}/$ref`, out, depth + 1);
    }
    if ('type' in schema) {
      const types = Array.isArray(schema['type']) ? (schema['type'] as string[]) : [schema['type'] as string];
      if (!types.some((t) => hasType(value, t))) fail('type', `expected ${types.join(' or ')}, got ${typeOf(value)}`);
    }
    if ('enum' in schema) {
      const allowed = schema['enum'] as unknown[];
      if (!allowed.some((a) => jsonEqual(a, value))) fail('enum', `expected one of ${allowed.map((a) => JSON.stringify(a)).join(', ')}`);
    }
    if ('const' in schema && !jsonEqual(schema['const'], value)) fail('const', `expected ${JSON.stringify(schema['const'])}`);

    if (typeOf(value) === 'object') {
      const obj = value as Record<string, unknown>;
      const props = (schema['properties'] ?? {}) as Record<string, unknown>;
      const patterns = Object.entries((schema['patternProperties'] ?? {}) as Record<string, unknown>).map(
        ([p, s]) => [new RegExp(p, 'u'), s, p] as const,
      );
      for (const key of (schema['required'] ?? []) as string[]) {
        if (!Object.prototype.hasOwnProperty.call(obj, key)) fail('required', `missing member "${key}"`);
      }
      const n = Object.keys(obj).length;
      if (typeof schema['minProperties'] === 'number' && n < schema['minProperties']) fail('minProperties', `expected at least ${schema['minProperties']} members`);
      if (typeof schema['maxProperties'] === 'number' && n > schema['maxProperties']) fail('maxProperties', `expected at most ${schema['maxProperties']} members`);
      for (const [key, v] of Object.entries(obj)) {
        const kp = `${path}/${escape(key)}`;
        let matched = false;
        if (Object.prototype.hasOwnProperty.call(props, key)) {
          matched = true;
          sub(props[key], v, kp, `${spath}/properties/${escape(key)}`);
        }
        for (const [re, s, p] of patterns) {
          if (re.test(key)) {
            matched = true;
            sub(s, v, kp, `${spath}/patternProperties/${escape(p)}`);
          }
        }
        if (!matched && 'additionalProperties' in schema) {
          const ap = schema['additionalProperties'];
          if (ap === false) out.push({ path: kp, schemaPath: `${spath}/additionalProperties`, message: `unknown member "${key}"` });
          else sub(ap, v, kp, `${spath}/additionalProperties`);
        }
      }
    }

    if (Array.isArray(value)) {
      const prefix = (schema['prefixItems'] ?? []) as unknown[];
      value.forEach((v, i) => {
        if (i < prefix.length) sub(prefix[i], v, `${path}/${i}`, `${spath}/prefixItems/${i}`);
        else if ('items' in schema) sub(schema['items'], v, `${path}/${i}`, `${spath}/items`);
      });
      if (typeof schema['minItems'] === 'number' && value.length < schema['minItems']) fail('minItems', `expected at least ${schema['minItems']} items, got ${value.length}`);
      if (typeof schema['maxItems'] === 'number' && value.length > schema['maxItems']) fail('maxItems', `expected at most ${schema['maxItems']} items, got ${value.length}`);
      if (schema['uniqueItems'] === true) {
        for (let i = 0; i < value.length; i++) {
          for (let j = i + 1; j < value.length; j++) {
            if (jsonEqual(value[i], value[j])) {
              fail('uniqueItems', `items ${i} and ${j} are equal`);
              i = j = value.length;
            }
          }
        }
      }
    }

    if (typeof value === 'number') {
      const num = (kw: string): number | undefined => (typeof schema[kw] === 'number' ? (schema[kw] as number) : undefined);
      const min = num('minimum');
      const max = num('maximum');
      const xmin = num('exclusiveMinimum');
      const xmax = num('exclusiveMaximum');
      const mult = num('multipleOf');
      if (min !== undefined && value < min) fail('minimum', `expected at least ${min}`);
      if (max !== undefined && value > max) fail('maximum', `expected at most ${max}`);
      if (xmin !== undefined && value <= xmin) fail('exclusiveMinimum', `expected more than ${xmin}`);
      if (xmax !== undefined && value >= xmax) fail('exclusiveMaximum', `expected less than ${xmax}`);
      if (mult !== undefined && !Number.isInteger(value / mult)) fail('multipleOf', `expected a multiple of ${mult}`);
    }

    if (typeof value === 'string') {
      const len = [...value].length;
      if (typeof schema['minLength'] === 'number' && len < schema['minLength']) fail('minLength', `expected at least ${schema['minLength']} characters`);
      if (typeof schema['maxLength'] === 'number' && len > schema['maxLength']) fail('maxLength', `expected at most ${schema['maxLength']} characters`);
      if (typeof schema['pattern'] === 'string' && !new RegExp(schema['pattern'], 'u').test(value)) fail('pattern', `does not match ${schema['pattern']}`);
    }

    if (Array.isArray(schema['allOf'])) (schema['allOf'] as unknown[]).forEach((s, i) => sub(s, value, path, `${spath}/allOf/${i}`));
    if (Array.isArray(schema['anyOf'])) {
      if (!(schema['anyOf'] as unknown[]).some((s, i) => passes(s, `${spath}/anyOf/${i}`))) fail('anyOf', 'matches none of the alternatives');
    }
    if (Array.isArray(schema['oneOf'])) {
      const n = (schema['oneOf'] as unknown[]).filter((s, i) => passes(s, `${spath}/oneOf/${i}`)).length;
      if (n !== 1) fail('oneOf', n === 0 ? 'matches none of the alternatives' : `matches ${n} alternatives, expected exactly one`);
    }
    if ('not' in schema && passes(schema['not'], `${spath}/not`)) fail('not', 'matches a schema it must not match');
    if ('if' in schema) {
      if (passes(schema['if'], `${spath}/if`)) {
        if ('then' in schema) sub(schema['then'], value, path, `${spath}/then`);
      } else if ('else' in schema) sub(schema['else'], value, path, `${spath}/else`);
    }
  }
}

function stripFragment(uri: string): string {
  const u = new URL(uri);
  u.hash = '';
  return u.href;
}
