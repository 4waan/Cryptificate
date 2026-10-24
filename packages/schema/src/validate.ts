/**
 * Shape validation for requests. These checks run before a request reaches
 * the engine, which performs the deep validation (matrix properties, circuit
 * semantics). They reject anything that is not exactly the documented shape.
 */
import { BN254_MODULUS, LIMITS, PROFILES } from './constants.js';
import type {
  AnalysisRequest,
  CandidateDesign,
  ExperimentRequest,
  FieldName,
  Program,
  ProgramTarget,
} from './types.js';

export interface ValidationIssue {
  /** JSON Pointer into the request, e.g. "/design/matrix/0/1". */
  path: string;
  code: string;
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: ValidationIssue[] };

const GF_HEX = /^[0-9A-Fa-f]{2}$/;
const BN_DECIMAL = /^(0|[1-9][0-9]{0,76})$/;
const SEED_HEX = /^[0-9A-Fa-f]+$/;
const PROGRAM_NAME = /^[A-Za-z0-9 ._\-+()]*$/;
const BN_P = BigInt(BN254_MODULUS);

export function isGfHex(value: unknown): value is string {
  return typeof value === 'string' && GF_HEX.test(value);
}

export function isBnDecimal(value: unknown): value is string {
  return typeof value === 'string' && BN_DECIMAL.test(value) && BigInt(value) < BN_P;
}

export function isFieldElement(field: FieldName, value: unknown): value is string {
  return field === 'gf256' ? isGfHex(value) : isBnDecimal(value);
}

/** Canonical encoding: uppercase hex for GF(2^8), unchanged decimal for BN254. */
export function canonicalElement(field: FieldName, value: string): string {
  return field === 'gf256' ? value.toUpperCase() : value;
}

/** True when a UTF-8 body of this many bytes is within the request limit. */
export function bodySizeAllowed(byteLength: number): boolean {
  return byteLength >= 0 && byteLength <= LIMITS.maxBodyBytes;
}

class Checker {
  readonly errors: ValidationIssue[] = [];

  fail(path: string, code: string, message: string): false {
    if (this.errors.length < 50) this.errors.push({ path: path || '/', code, message });
    return false;
  }

  object(value: unknown, path: string): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return this.fail(path, 'type', 'expected an object');
    }
    return true;
  }

  keys(obj: Record<string, unknown>, path: string, required: string[], optional: string[] = []): boolean {
    let ok = true;
    for (const key of required) {
      if (!(key in obj)) ok = this.fail(`${path}/${key}`, 'required', `missing field "${key}"`);
    }
    const known = new Set([...required, ...optional]);
    for (const key of Object.keys(obj)) {
      if (!known.has(key)) ok = this.fail(`${path}/${escapePointer(key)}`, 'unknown-field', `unknown field "${key}"`);
    }
    return ok;
  }

  literal(value: unknown, path: string, allowed: readonly (string | number)[]): boolean {
    if (!allowed.includes(value as string | number)) {
      return this.fail(path, 'enum', `expected one of ${allowed.map((a) => JSON.stringify(a)).join(', ')}`);
    }
    return true;
  }

  integer(value: unknown, path: string, min: number, max: number): value is number {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      return this.fail(path, 'type', 'expected an integer');
    }
    if (value < min || value > max) return this.fail(path, 'range', `expected an integer in ${min}..${max}`);
    return true;
  }

  array(value: unknown, path: string, length?: number, maxLength?: number): value is unknown[] {
    if (!Array.isArray(value)) return this.fail(path, 'type', 'expected an array');
    if (length !== undefined && value.length !== length) {
      return this.fail(path, 'length', `expected exactly ${length} entries, got ${value.length}`);
    }
    if (maxLength !== undefined && value.length > maxLength) {
      return this.fail(path, 'length', `expected at most ${maxLength} entries, got ${value.length}`);
    }
    return true;
  }

  element(field: FieldName, value: unknown, path: string): boolean {
    if (typeof value !== 'string') {
      return this.fail(path, 'type', 'field elements are strings, not numbers');
    }
    if (field === 'gf256' && !isGfHex(value)) {
      return this.fail(path, 'gf256', 'expected a two-digit hex string such as "02" or "1B"');
    }
    if (field === 'bn254' && !isBnDecimal(value)) {
      return this.fail(path, 'bn254', 'expected a canonical decimal string in [0, p) without sign, spaces or leading zeros');
    }
    return true;
  }

  matrix(field: FieldName, value: unknown, path: string, n: number): boolean {
    if (!this.array(value, path, n)) return false;
    let ok = true;
    value.forEach((row, i) => {
      if (!this.array(row, `${path}/${i}`, n)) {
        ok = false;
        return;
      }
      row.forEach((entry, j) => {
        if (!this.element(field, entry, `${path}/${i}/${j}`)) ok = false;
      });
    });
    return ok;
  }
}

function escapePointer(key: string): string {
  return key.replace(/~/g, '~0').replace(/\//g, '~1');
}

function checkDesign(c: Checker, value: unknown, path: string): value is CandidateDesign {
  if (!c.object(value, path)) return false;
  const model = value['model'];
  if (model === 'aes-like/gf256/v1') {
    let ok = c.keys(value, path, ['model', 'field', 'width', 'matrix', 'offsets', 'rounds', 'sbox']);
    ok = c.literal(value['field'], `${path}/field`, ['gf256']) && ok;
    ok = c.literal(value['width'], `${path}/width`, [4]) && ok;
    if ('matrix' in value) ok = c.matrix('gf256', value['matrix'], `${path}/matrix`, 4) && ok;
    if ('offsets' in value) {
      const offsets = value['offsets'];
      if (c.array(offsets, `${path}/offsets`, 4)) {
        offsets.forEach((o, i) => {
          if (!c.integer(o, `${path}/offsets/${i}`, 0, 3)) ok = false;
        });
      } else ok = false;
    }
    if ('rounds' in value) ok = c.integer(value['rounds'], `${path}/rounds`, LIMITS.minRounds, LIMITS.maxRounds) && ok;
    if ('sbox' in value) {
      const sbox = value['sbox'];
      const sp = `${path}/sbox`;
      if (c.object(sbox, sp)) {
        if (sbox['kind'] === 'aes') {
          ok = c.keys(sbox, sp, ['kind']) && ok;
        } else if (sbox['kind'] === 'table') {
          ok = c.keys(sbox, sp, ['kind', 'table']) && ok;
          const table = sbox['table'];
          if (c.array(table, `${sp}/table`, 256)) {
            table.forEach((e, i) => {
              if (!c.element('gf256', e, `${sp}/table/${i}`)) ok = false;
            });
          } else ok = false;
        } else {
          ok = c.fail(`${sp}/kind`, 'enum', 'expected "aes" or "table" for an AES-like design');
        }
      } else ok = false;
    }
    return ok;
  }
  if (model === 'hades/bn254/v1') {
    let ok = c.keys(value, path, [
      'model',
      'field',
      'width',
      'external',
      'internal',
      'fullRounds',
      'partialRounds',
      'sbox',
      'partialMask',
      'constants',
    ]);
    ok = c.literal(value['field'], `${path}/field`, ['bn254']) && ok;
    ok = c.literal(value['width'], `${path}/width`, [3]) && ok;
    if ('external' in value) ok = c.matrix('bn254', value['external'], `${path}/external`, 3) && ok;
    if ('internal' in value) ok = c.matrix('bn254', value['internal'], `${path}/internal`, 3) && ok;
    const full = value['fullRounds'];
    const partial = value['partialRounds'];
    let roundsOk = true;
    if ('fullRounds' in value) {
      if (c.integer(full, `${path}/fullRounds`, 0, LIMITS.maxHadesRounds)) {
        if (full % 2 !== 0) roundsOk = c.fail(`${path}/fullRounds`, 'even', 'fullRounds must be even');
      } else roundsOk = false;
    }
    if ('partialRounds' in value) {
      roundsOk = c.integer(partial, `${path}/partialRounds`, 0, LIMITS.maxHadesRounds) && roundsOk;
    }
    if (roundsOk && typeof full === 'number' && typeof partial === 'number') {
      if (full + partial > LIMITS.maxHadesRounds) {
        roundsOk = c.fail(`${path}/partialRounds`, 'range', `fullRounds + partialRounds must be at most ${LIMITS.maxHadesRounds}`);
      } else if (full + partial < 1) {
        roundsOk = c.fail(`${path}/fullRounds`, 'range', 'at least one round is required');
      }
    }
    ok = roundsOk && ok;
    if ('sbox' in value) {
      const sbox = value['sbox'];
      const sp = `${path}/sbox`;
      if (c.object(sbox, sp)) {
        if (sbox['kind'] === 'power') {
          ok = c.keys(sbox, sp, ['kind', 'exponent']) && ok;
          ok = c.integer(sbox['exponent'], `${sp}/exponent`, 1, LIMITS.maxExponent) && ok;
        } else ok = c.fail(`${sp}/kind`, 'enum', 'expected "power" for a HADES design');
      } else ok = false;
    }
    if ('partialMask' in value) {
      const mask = value['partialMask'];
      if (c.array(mask, `${path}/partialMask`, 3)) {
        mask.forEach((m, i) => {
          if (typeof m !== 'boolean') ok = c.fail(`${path}/partialMask/${i}`, 'type', 'expected a boolean');
        });
      } else ok = false;
    }
    if ('constants' in value) {
      const constants = value['constants'];
      const cp = `${path}/constants`;
      if (c.object(constants, cp)) {
        if (constants['kind'] === 'reference') {
          ok = c.keys(constants, cp, ['kind']) && ok;
        } else if (constants['kind'] === 'explicit') {
          ok = c.keys(constants, cp, ['kind', 'values']) && ok;
          const values = constants['values'];
          const expected = roundsOk && typeof full === 'number' && typeof partial === 'number' ? full + partial : undefined;
          if (c.array(values, `${cp}/values`, expected, LIMITS.maxHadesRounds)) {
            values.forEach((row, i) => {
              if (c.array(row, `${cp}/values/${i}`, 3)) {
                row.forEach((e, j) => {
                  if (!c.element('bn254', e, `${cp}/values/${i}/${j}`)) ok = false;
                });
              } else ok = false;
            });
          } else ok = false;
        } else ok = c.fail(`${cp}/kind`, 'enum', 'expected "reference" or "explicit"');
      } else ok = false;
    }
    return ok;
  }
  return c.fail(`${path}/model`, 'enum', 'expected "aes-like/gf256/v1" or "hades/bn254/v1"');
}

function checkProgram(c: Checker, value: unknown, path: string, field?: FieldName, width?: number): value is Program {
  if (!c.object(value, path)) return false;
  let ok = c.keys(value, path, ['field', 'width', 'instructions', 'outputs'], ['name']);
  const pf = value['field'];
  if (!c.literal(pf, `${path}/field`, ['gf256', 'bn254'])) return false;
  const progField = pf as FieldName;
  if (field !== undefined && progField !== field) {
    ok = c.fail(`${path}/field`, 'mismatch', `program field "${progField}" does not match design field "${field}"`);
  }
  const w = value['width'];
  if (!c.integer(w, `${path}/width`, 1, 16)) return false;
  if (width !== undefined && w !== width) {
    ok = c.fail(`${path}/width`, 'mismatch', `program width ${w} does not match design width ${width}`);
  }
  if ('name' in value) {
    const name = value['name'];
    if (typeof name !== 'string' || name.length > LIMITS.maxProgramNameLength || !PROGRAM_NAME.test(name)) {
      ok = c.fail(`${path}/name`, 'name', `expected a short name (letters, digits, space, . _ - + ( ); at most ${LIMITS.maxProgramNameLength} characters)`);
    }
  }
  const instrs = value['instructions'];
  let defined = w;
  if (c.array(instrs, `${path}/instructions`, undefined, LIMITS.maxInstructions)) {
    instrs.forEach((ins, i) => {
      const ip = `${path}/instructions/${i}`;
      const limit = w + i - 1;
      if (!c.object(ins, ip)) {
        ok = false;
        return;
      }
      if (ins['op'] === 'add') {
        ok = c.keys(ins, ip, ['op', 'a', 'b']) && ok;
        ok = registerRef(c, ins['a'], `${ip}/a`, limit) && ok;
        ok = registerRef(c, ins['b'], `${ip}/b`, limit) && ok;
      } else if (ins['op'] === 'mul') {
        ok = c.keys(ins, ip, ['op', 'k', 'a']) && ok;
        ok = c.element(progField, ins['k'], `${ip}/k`) && ok;
        ok = registerRef(c, ins['a'], `${ip}/a`, limit) && ok;
      } else {
        ok = c.fail(`${ip}/op`, 'enum', 'expected "add" or "mul"');
      }
    });
    defined = w + instrs.length;
  } else ok = false;
  const outputs = value['outputs'];
  if (c.array(outputs, `${path}/outputs`, w)) {
    outputs.forEach((o, i) => {
      ok = registerRef(c, o, `${path}/outputs/${i}`, defined - 1) && ok;
    });
  } else ok = false;
  return ok;
}

function registerRef(c: Checker, value: unknown, path: string, maxRegister: number): boolean {
  if (typeof value !== 'number' || !Number.isInteger(value)) return c.fail(path, 'type', 'expected a register index');
  if (value < 0 || value > maxRegister) {
    return c.fail(path, 'register', `register ${value} is not defined here (defined: 0..${maxRegister})`);
  }
  return true;
}

function designField(design: unknown): { field?: FieldName; width?: number; model?: string } {
  if (typeof design !== 'object' || design === null) return {};
  const d = design as Record<string, unknown>;
  if (d['model'] === 'aes-like/gf256/v1') return { field: 'gf256', width: 4, model: d['model'] };
  if (d['model'] === 'hades/bn254/v1') return { field: 'bn254', width: 3, model: d['model'] };
  return {};
}

function checkTarget(c: Checker, value: unknown, model: string | undefined): value is ProgramTarget {
  const allowed: readonly string[] =
    model === 'aes-like/gf256/v1' ? ['matrix'] : model === 'hades/bn254/v1' ? ['external', 'internal'] : ['matrix', 'external', 'internal'];
  return c.literal(value, '/target', allowed);
}

export function validateCandidateDesign(value: unknown): ValidationResult<CandidateDesign> {
  const c = new Checker();
  return checkDesign(c, value, '') && c.errors.length === 0 ? { ok: true, value } : { ok: false, errors: c.errors };
}

export function validateProgram(value: unknown, field?: FieldName, width?: number): ValidationResult<Program> {
  const c = new Checker();
  return checkProgram(c, value, '', field, width) && c.errors.length === 0
    ? { ok: true, value }
    : { ok: false, errors: c.errors };
}

export function validateAnalysisRequest(value: unknown): ValidationResult<AnalysisRequest> {
  const c = new Checker();
  if (!c.object(value, '')) return { ok: false, errors: c.errors };
  c.keys(value, '', ['design'], ['program', 'target']);
  if ('design' in value) checkDesign(c, value['design'], '/design');
  const { field, width, model } = designField(value['design']);
  if ('program' in value) checkProgram(c, value['program'], '/program', field, width);
  if ('target' in value) checkTarget(c, value['target'], model);
  return c.errors.length === 0 ? { ok: true, value: value as unknown as AnalysisRequest } : { ok: false, errors: c.errors };
}

export function validateExperimentRequest(value: unknown): ValidationResult<ExperimentRequest> {
  const c = new Checker();
  if (!c.object(value, '')) return { ok: false, errors: c.errors };
  c.keys(value, '', ['design', 'profile'], ['program', 'seed']);
  if ('design' in value) checkDesign(c, value['design'], '/design');
  const { field, width } = designField(value['design']);
  if ('program' in value) checkProgram(c, value['program'], '/program', field, width);
  if ('profile' in value) c.literal(value['profile'], '/profile', PROFILES);
  if ('seed' in value) {
    const seed = value['seed'];
    if (typeof seed !== 'string' || !SEED_HEX.test(seed) || seed.length > LIMITS.maxSeedHexLength) {
      c.fail('/seed', 'seed', `expected a hex string of 1..${LIMITS.maxSeedHexLength} digits`);
    }
  }
  return c.errors.length === 0 ? { ok: true, value: value as unknown as ExperimentRequest } : { ok: false, errors: c.errors };
}

/** Default program target for a design model. */
export function defaultTarget(design: CandidateDesign): ProgramTarget {
  return design.model === 'hades/bn254/v1' ? 'external' : 'matrix';
}

/**
 * Canonical form of a shape-valid request: uppercase GF(2^8) hex, explicit
 * target when a program is present, keys in a fixed order. The engine's
 * normalization is authoritative; this mirrors it for display and replay.
 */
export function normalizeAnalysisRequest(req: AnalysisRequest): AnalysisRequest {
  const design = normalizeDesign(req.design);
  const out: AnalysisRequest = { design };
  if (req.program) {
    out.program = normalizeProgram(req.program);
    out.target = req.target ?? defaultTarget(design);
  } else if (req.target) {
    out.target = req.target;
  }
  return out;
}

export function normalizeDesign(d: CandidateDesign): CandidateDesign {
  if (d.model === 'aes-like/gf256/v1') {
    return {
      model: d.model,
      field: 'gf256',
      width: 4,
      matrix: d.matrix.map((row) => row.map((e) => e.toUpperCase())),
      offsets: [...d.offsets],
      rounds: d.rounds,
      sbox: d.sbox.kind === 'aes' ? { kind: 'aes' } : { kind: 'table', table: d.sbox.table.map((e) => e.toUpperCase()) },
    };
  }
  return {
    model: d.model,
    field: 'bn254',
    width: 3,
    external: d.external.map((row) => [...row]),
    internal: d.internal.map((row) => [...row]),
    fullRounds: d.fullRounds,
    partialRounds: d.partialRounds,
    sbox: { kind: 'power', exponent: d.sbox.exponent },
    partialMask: [...d.partialMask],
    constants: d.constants.kind === 'reference' ? { kind: 'reference' } : { kind: 'explicit', values: d.constants.values.map((r) => [...r]) },
  };
}

export function normalizeProgram(p: Program): Program {
  const out: Program = {
    field: p.field,
    width: p.width,
    instructions: p.instructions.map((ins) =>
      ins.op === 'add' ? { op: 'add', a: ins.a, b: ins.b } : { op: 'mul', k: canonicalElement(p.field, ins.k), a: ins.a },
    ),
    outputs: [...p.outputs],
  };
  if (p.name !== undefined) return { field: out.field, width: out.width, name: p.name, instructions: out.instructions, outputs: out.outputs };
  return out;
}

/**
 * Canonical JSON: object keys sorted, no insignificant whitespace. Used for
 * digests and cache keys.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}
