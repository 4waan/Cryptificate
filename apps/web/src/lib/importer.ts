import type { CandidateDesign, Instruction, Program, ProgramTarget } from './types';

/**
 * Shape checks for imported JSON. Values that parse here can be shown in the
 * editors; field-level validity (hex syntax, ranges) is reported inline there.
 */

export interface Imported {
  design?: CandidateDesign;
  program?: Program | null;
  target?: ProgramTarget;
}

type Json = Record<string, unknown>;

const isObj = (x: unknown): x is Json => typeof x === 'object' && x !== null && !Array.isArray(x);

function fail(path: string, message: string): never {
  throw new Error(`${path || '/'}: ${message}`);
}

function stringMatrix(x: unknown, n: number, path: string): string[][] {
  if (!Array.isArray(x) || x.length !== n) fail(path, `expected ${n} rows`);
  return x.map((row, i) => {
    if (!Array.isArray(row) || row.length !== n) fail(`${path}/${i}`, `expected ${n} entries`);
    return row.map((v, j) => {
      if (typeof v !== 'string') fail(`${path}/${i}/${j}`, 'field elements are strings, e.g. "02" or "5"');
      return v;
    });
  });
}

function int(x: unknown, path: string): number {
  if (typeof x !== 'number' || !Number.isInteger(x)) fail(path, 'expected a whole number');
  return x;
}

export function coerceDesign(x: unknown, path = ''): CandidateDesign {
  if (!isObj(x)) fail(path, 'expected a design object');
  if (x.model === 'aes-like/gf256/v1') {
    const width = x.width === undefined ? 4 : int(x.width, `${path}/width`);
    if (![2, 3, 4].includes(width)) fail(`${path}/width`, 'expected 4 (or the experimental 2 or 3)');
    const offsets = x.offsets;
    if (!Array.isArray(offsets) || offsets.length !== width) fail(`${path}/offsets`, `expected ${width} offsets`);
    const sbox = x.sbox;
    if (!isObj(sbox)) fail(`${path}/sbox`, 'expected an S-box object');
    let parsedSbox: { kind: 'aes' } | { kind: 'table'; table: string[] };
    if (sbox.kind === 'aes') parsedSbox = { kind: 'aes' };
    else if (sbox.kind === 'table') {
      if (!Array.isArray(sbox.table) || sbox.table.some((v) => typeof v !== 'string')) {
        fail(`${path}/sbox/table`, 'expected an array of hex strings');
      }
      parsedSbox = { kind: 'table', table: sbox.table as string[] };
    } else fail(`${path}/sbox/kind`, 'expected "aes" or "table"');
    return {
      model: 'aes-like/gf256/v1',
      field: 'gf256',
      width,
      ...(width !== 4 ? { experimental: true } : {}),
      matrix: stringMatrix(x.matrix, width, `${path}/matrix`),
      offsets: offsets.map((o, i) => int(o, `${path}/offsets/${i}`)),
      rounds: int(x.rounds, `${path}/rounds`),
      sbox: parsedSbox,
    };
  }
  if (x.model === 'hades/bn254/v1') {
    const sbox = x.sbox;
    if (!isObj(sbox) || sbox.kind !== 'power') fail(`${path}/sbox`, 'expected {"kind":"power","exponent":…}');
    const mask = x.partialMask;
    if (!Array.isArray(mask) || mask.length !== 3 || mask.some((m) => typeof m !== 'boolean')) {
      fail(`${path}/partialMask`, 'expected 3 booleans');
    }
    const constants = x.constants;
    let parsedConstants: { kind: 'reference' } | { kind: 'explicit'; values: string[][] };
    if (isObj(constants) && constants.kind === 'reference') parsedConstants = { kind: 'reference' };
    else if (isObj(constants) && constants.kind === 'explicit' && Array.isArray(constants.values)) {
      parsedConstants = {
        kind: 'explicit',
        values: constants.values.map((row, i) => {
          if (!Array.isArray(row) || row.length !== 3 || row.some((v) => typeof v !== 'string')) {
            fail(`${path}/constants/values/${i}`, 'expected 3 decimal strings');
          }
          return row as string[];
        }),
      };
    } else fail(`${path}/constants`, 'expected {"kind":"reference"} or explicit values');
    return {
      model: 'hades/bn254/v1',
      field: 'bn254',
      width: 3,
      external: stringMatrix(x.external, 3, `${path}/external`),
      internal: stringMatrix(x.internal, 3, `${path}/internal`),
      fullRounds: int(x.fullRounds, `${path}/fullRounds`),
      partialRounds: int(x.partialRounds, `${path}/partialRounds`),
      sbox: { kind: 'power', exponent: int(sbox.exponent, `${path}/sbox/exponent`) },
      partialMask: mask as boolean[],
      constants: parsedConstants,
    };
  }
  fail(`${path}/model`, 'expected "aes-like/gf256/v1" or "hades/bn254/v1"');
}

export function coerceProgram(x: unknown, path = ''): Program {
  if (!isObj(x)) fail(path, 'expected a program object');
  if (x.field !== 'gf256' && x.field !== 'bn254') fail(`${path}/field`, 'expected "gf256" or "bn254"');
  const width = int(x.width, `${path}/width`);
  if (!Array.isArray(x.instructions)) fail(`${path}/instructions`, 'expected an array');
  if (x.instructions.length > 256) fail(`${path}/instructions`, 'at most 256 instructions');
  const instructions: Instruction[] = x.instructions.map((ins, i) => {
    const p = `${path}/instructions/${i}`;
    if (!isObj(ins)) fail(p, 'expected an instruction object');
    if (ins.op === 'add') return { op: 'add', a: int(ins.a, `${p}/a`), b: int(ins.b, `${p}/b`) };
    if (ins.op === 'mul') {
      if (typeof ins.k !== 'string') fail(`${p}/k`, 'the constant is a string field element');
      return { op: 'mul', k: ins.k, a: int(ins.a, `${p}/a`) };
    }
    fail(`${p}/op`, 'expected "add" or "mul"');
  });
  if (!Array.isArray(x.outputs)) fail(`${path}/outputs`, 'expected an array');
  const out: Program = {
    field: x.field,
    width,
    instructions,
    outputs: x.outputs.map((r, i) => int(r, `${path}/outputs/${i}`)),
  };
  if (typeof x.name === 'string') out.name = x.name;
  return out;
}

/** Accepts an AnalysisRequest/ExperimentRequest, a bare design, or a bare program. */
export function parseImport(text: string): Imported {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This is not valid JSON.');
  }
  if (!isObj(raw)) throw new Error('Expected a JSON object.');
  if ('design' in raw) {
    const out: Imported = { design: coerceDesign(raw.design, '/design') };
    if (raw.program !== undefined && raw.program !== null) out.program = coerceProgram(raw.program, '/program');
    else out.program = null;
    if (raw.target === 'matrix' || raw.target === 'external' || raw.target === 'internal') out.target = raw.target;
    return out;
  }
  if ('model' in raw) return { design: coerceDesign(raw) };
  if ('instructions' in raw) return { program: coerceProgram(raw) };
  throw new Error('Expected a request with "design", a design with "model", or a program with "instructions".');
}
