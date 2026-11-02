/**
 * cryptificate.json, the project configuration read by `cryptificate check`
 * when it is run without input arguments (or with --config FILE).
 *
 * The file is looked up in the working directory and then in each parent
 * directory. Relative paths in it are relative to the directory that holds
 * it. The JSON Schema is schemas/project-config.schema.json; this module is
 * the validator the command uses, and a test keeps the two in step.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { FAIL_ON, KNOWN_CLAIM_IDS, UsageError } from './policy.js';
import type { FailOn } from './policy.js';

export const CONFIG_FILE = 'cryptificate.json';

export const CONFIG_SCHEMA_URL = 'https://raw.githubusercontent.com/4waan/Cryptificate/main/schemas/project-config.schema.json';

export const CONFIG_FORMATS = ['text', 'json', 'sarif', 'junit', 'markdown'] as const;
export const CONFIG_TARGETS = ['matrix', 'external', 'internal'] as const;

export interface ProjectConfig {
  inputs: string[];
  failOn?: FailOn;
  claims?: string[];
  target?: (typeof CONFIG_TARGETS)[number];
  format?: (typeof CONFIG_FORMATS)[number];
  output?: string;
  bundleDir?: string;
}

/** Keys of the file, in the order of the schema. */
export const CONFIG_KEYS = ['$schema', 'inputs', 'failOn', 'claims', 'target', 'format', 'output', 'bundleDir'] as const;

export interface LoadedConfig {
  /** Absolute path of the file. */
  path: string;
  /** Directory relative paths in the file are resolved against. */
  dir: string;
  config: ProjectConfig;
}

export interface ConfigIssue {
  /** JSON Pointer into the file. */
  path: string;
  message: string;
}

/** The nearest cryptificate.json in `start` or one of its parents, or null. */
export function findConfig(start: string): string | null {
  let dir = resolve(start);
  for (;;) {
    const p = join(dir, CONFIG_FILE);
    try {
      if (statSync(p).isFile()) return p;
    } catch {
      // keep looking
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function quote(v: unknown): string {
  return JSON.stringify(v) ?? String(v);
}

function oneOf(values: readonly string[]): string {
  return values.join(', ');
}

/** Check a parsed cryptificate.json; every problem is reported, not only the first. */
export function validateConfig(doc: unknown): { ok: true; value: ProjectConfig } | { ok: false; errors: ConfigIssue[] } {
  const errors: ConfigIssue[] = [];
  const issue = (path: string, message: string): void => {
    errors.push({ path, message });
  };
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, errors: [{ path: '', message: 'must be a JSON object' }] };
  }
  const o = doc as Record<string, unknown>;
  for (const key of Object.keys(o)) {
    if (!(CONFIG_KEYS as readonly string[]).includes(key)) issue(`/${key}`, `unknown key; the keys are ${oneOf(CONFIG_KEYS)}`);
  }
  const out: ProjectConfig = { inputs: [] };

  if (o['$schema'] !== undefined && typeof o['$schema'] !== 'string') issue('/$schema', 'must be a string');

  const inputs = o['inputs'];
  if (inputs === undefined) issue('/inputs', 'is required: a list of design or request files, or patterns');
  else if (!Array.isArray(inputs)) issue('/inputs', `must be a list of strings, for example ["designs/*.json"] (got ${quote(inputs)})`);
  else if (inputs.length === 0) issue('/inputs', 'must name at least one file or pattern');
  else {
    inputs.forEach((v, k) => {
      if (typeof v !== 'string' || v.length === 0) issue(`/inputs/${k}`, `must be a non-empty string (got ${quote(v)})`);
    });
    out.inputs = inputs.filter((v): v is string => typeof v === 'string');
  }

  const failOn = o['failOn'];
  if (failOn !== undefined) {
    if (typeof failOn === 'string' && (FAIL_ON as readonly string[]).includes(failOn)) out.failOn = failOn as FailOn;
    else issue('/failOn', `must be one of ${oneOf(FAIL_ON)} (got ${quote(failOn)})`);
  }

  const claims = o['claims'];
  if (claims !== undefined) {
    if (!Array.isArray(claims) || claims.length === 0) issue('/claims', `must be a non-empty list of claim ids (got ${quote(claims)})`);
    else {
      const seen = new Set<string>();
      claims.forEach((id, k) => {
        if (typeof id !== 'string' || !KNOWN_CLAIM_IDS.has(id)) issue(`/claims/${k}`, `unknown claim id ${quote(id)}; the claim ids are ${oneOf([...KNOWN_CLAIM_IDS])}`);
        else if (seen.has(id)) issue(`/claims/${k}`, `${quote(id)} is listed twice`);
        else seen.add(id);
      });
      out.claims = [...seen];
    }
  }

  const target = o['target'];
  if (target !== undefined) {
    if (typeof target === 'string' && (CONFIG_TARGETS as readonly string[]).includes(target)) out.target = target as ProjectConfig['target'];
    else issue('/target', `must be one of ${oneOf(CONFIG_TARGETS)} (got ${quote(target)})`);
  }

  const format = o['format'];
  if (format !== undefined) {
    if (typeof format === 'string' && (CONFIG_FORMATS as readonly string[]).includes(format)) out.format = format as ProjectConfig['format'];
    else issue('/format', `must be one of ${oneOf(CONFIG_FORMATS)} (got ${quote(format)})`);
  }

  for (const key of ['output', 'bundleDir'] as const) {
    const v = o[key];
    if (v === undefined) continue;
    if (typeof v === 'string' && v.length > 0) out[key] = v;
    else issue(`/${key}`, `must be a non-empty path (got ${quote(v)})`);
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: out };
}

/**
 * Read and validate a cryptificate.json. Any problem is a usage error (exit 2).
 * `shown` is how messages name the file.
 */
export function loadConfig(file: string, shown: string = file): LoadedConfig {
  const abs = resolve(file);
  if (!existsSync(abs)) throw new UsageError(`cannot read ${shown}: ENOENT`);
  let text: string;
  try {
    text = readFileSync(abs, 'utf8');
  } catch (e) {
    throw new UsageError(`cannot read ${shown}: ${(e as NodeJS.ErrnoException).code ?? (e as Error).message}`);
  }
  let doc: unknown;
  try {
    doc = JSON.parse(text) as unknown;
  } catch (e) {
    throw new UsageError(`${shown} is not valid JSON: ${(e as Error).message}`);
  }
  const v = validateConfig(doc);
  if (!v.ok) {
    const n = v.errors.length;
    throw new UsageError(
      `${shown} is not a valid project configuration (${n} problem${n > 1 ? 's' : ''}; schema: schemas/project-config.schema.json):\n${v.errors
        .map((e) => `  ${e.path || '/'}: ${e.message}`)
        .join('\n')}`,
    );
  }
  return { path: abs, dir: dirname(abs), config: v.value };
}
