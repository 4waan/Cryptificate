/**
 * The OpenAPI description served at GET /api/openapi.json.
 *
 * The source of truth is schemas/openapi.json, which refers to the JSON
 * Schemas next to it by relative `$ref` ("job.schema.json"). A client that
 * fetches the document over HTTP cannot follow those file references, so the
 * service serves a bundled copy: every referenced schema file is embedded
 * under components/schemas (named after the file, without `$id` and
 * `$schema`) and every reference is rewritten to a local JSON Pointer. The
 * bundled document has no external references.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const OPENAPI_FILE = 'openapi.json';

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** "analysis-report.schema.json" -> "AnalysisReport". */
export function componentName(file: string): string {
  return file
    .replace(/\.schema\.json$/, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join('');
}

function isExternal(ref: string): boolean {
  return !ref.startsWith('#');
}

function splitRef(ref: string): { file: string; fragment: string } {
  const i = ref.indexOf('#');
  return i < 0 ? { file: ref, fragment: '' } : { file: ref.slice(0, i), fragment: ref.slice(i + 1) };
}

/**
 * Bundle an OpenAPI document whose schemas refer to sibling files.
 * `read(file)` returns the parsed JSON of a file in the same directory.
 */
export function bundleOpenApi(doc: Json, read: (file: string) => Json): Json {
  const embedded = new Map<string, string>(); // file -> component name
  const pending: string[] = [];

  const nameFor = (file: string): string => {
    if (!/^[a-z0-9-]+\.schema\.json$/.test(file)) throw new Error(`unexpected schema reference ${file}`);
    let name = embedded.get(file);
    if (!name) {
      name = componentName(file);
      embedded.set(file, name);
      pending.push(file);
    }
    return name;
  };

  /** Rewrite references in `node`; `self` is the component of the file being embedded. */
  const rewrite = (node: Json, self: string | null): Json => {
    if (Array.isArray(node)) return node.map((n) => rewrite(n, self));
    if (node === null || typeof node !== 'object') return node;
    const res: { [k: string]: Json } = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === '$ref' && typeof v === 'string') {
        if (isExternal(v)) {
          const { file, fragment } = splitRef(v);
          res[k] = `#/components/schemas/${nameFor(file)}${fragment}`;
        } else if (self !== null) {
          res[k] = `#/components/schemas/${self}${v.slice(1)}`;
        } else res[k] = v;
      } else res[k] = rewrite(v, self);
    }
    return res;
  };

  const out = rewrite(doc, null) as { [k: string]: Json };
  const added: { [k: string]: Json } = {};
  while (pending.length > 0) {
    const file = pending.shift()!;
    const schema = read(file);
    if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) throw new Error(`${file} is not a schema object`);
    const { $schema: _s, $id: _i, ...rest } = schema;
    const name = embedded.get(file)!;
    added[name] = rewrite(rest, name);
  }
  const components = (out['components'] ??= {}) as { [k: string]: Json };
  const schemas = (components['schemas'] ??= {}) as { [k: string]: Json };
  for (const [name, schema] of Object.entries(added)) {
    if (Object.prototype.hasOwnProperty.call(schemas, name)) throw new Error(`component name ${name} is already taken`);
    schemas[name] = schema;
  }
  return out;
}

const cache = new Map<string, Json>();

/**
 * The bundled OpenAPI document of the checkout at `root` (read once), or
 * null when the checkout has no schemas/openapi.json.
 */
export function openApiDocument(root: string): Json | null {
  const dir = join(root, 'schemas');
  let doc = cache.get(dir);
  if (doc === undefined) {
    if (!existsSync(join(dir, OPENAPI_FILE))) return null;
    const read = (file: string): Json => JSON.parse(readFileSync(join(dir, file), 'utf8')) as Json;
    doc = bundleOpenApi(read(OPENAPI_FILE), read);
    cache.set(dir, doc);
  }
  return doc;
}
