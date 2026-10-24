import { fieldOps } from './field';
import type { FieldName, Instruction, Program } from './types';

/**
 * Pure operations on linear circuits ("programs"). Registers 0..width-1 are
 * the inputs; instruction i defines register width + i. An operand or output
 * of -1 means "not chosen yet" (left behind when its register was removed).
 */

export const UNSET = -1;
export const MAX_INSTRUCTIONS = 256;

export function registerCount(p: Program): number {
  return p.width + p.instructions.length;
}

export function registerName(p: Pick<Program, 'width'>, r: number): string {
  if (r === UNSET || r < 0) return '?';
  return r < p.width ? `x${r}` : `r${r}`;
}

export function isXtime(field: FieldName, ins: Instruction): boolean {
  return ins.op === 'mul' && field === 'gf256' && fieldOps('gf256').isValid(ins.k) && ins.k.toUpperCase() === '02';
}

/** Registers that instruction `index` may read: every input and every earlier result. */
export function operandChoices(p: Program, index: number): number[] {
  return Array.from({ length: p.width + index }, (_, r) => r);
}

function operands(ins: Instruction): number[] {
  return ins.op === 'add' ? [ins.a, ins.b] : [ins.a];
}

function mapOperands(ins: Instruction, f: (r: number) => number): Instruction {
  return ins.op === 'add' ? { op: 'add', a: f(ins.a), b: f(ins.b) } : { op: 'mul', k: ins.k, a: f(ins.a) };
}

function remap(p: Program, f: (r: number) => number, instructions = p.instructions): Program {
  return {
    ...p,
    instructions: instructions.map((ins) => mapOperands(ins, f)),
    outputs: p.outputs.map(f),
  };
}

/** Inserts an instruction before position `index`; later registers shift up by one. */
export function insertInstruction(p: Program, index: number, ins?: Instruction): Program {
  const at = Math.max(0, Math.min(index, p.instructions.length));
  const reg = p.width + at;
  const fresh: Instruction = ins ?? { op: 'add', a: 0, b: Math.min(1, reg - 1) };
  const shifted = remap(p, (r) => (r >= reg ? r + 1 : r));
  const instructions = [...shifted.instructions];
  instructions.splice(at, 0, fresh);
  return { ...shifted, instructions };
}

/**
 * Removes instruction `index`. Reads of the removed register become UNSET so
 * the editor can ask for a replacement; later registers shift down by one.
 */
export function removeInstruction(p: Program, index: number): Program {
  if (index < 0 || index >= p.instructions.length) return p;
  const reg = p.width + index;
  const rest = p.instructions.filter((_, i) => i !== index);
  return remap(p, (r) => (r === reg ? UNSET : r > reg ? r - 1 : r), rest);
}

export interface MoveCheck {
  ok: boolean;
  reason?: string;
}

/** Whether instruction `index` can swap with its neighbour in direction `dir`. */
export function canMove(p: Program, index: number, dir: -1 | 1): MoveCheck {
  const other = index + dir;
  if (other < 0 || other >= p.instructions.length) {
    return { ok: false, reason: dir < 0 ? 'Already first' : 'Already last' };
  }
  const [upper, lower] = dir < 0 ? [other, index] : [index, other];
  const upperReg = p.width + upper;
  if (operands(p.instructions[lower]!).includes(upperReg)) {
    return {
      ok: false,
      reason: `${registerName(p, p.width + lower)} reads ${registerName(p, upperReg)}, so it must stay below it`,
    };
  }
  return { ok: true };
}

/** Swaps two adjacent instructions and renames their registers everywhere. */
export function moveInstruction(p: Program, index: number, dir: -1 | 1): Program {
  if (!canMove(p, index, dir).ok) return p;
  const other = index + dir;
  const r1 = p.width + index;
  const r2 = p.width + other;
  const swapped = [...p.instructions];
  swapped[index] = p.instructions[other]!;
  swapped[other] = p.instructions[index]!;
  return remap(p, (r) => (r === r1 ? r2 : r === r2 ? r1 : r), swapped);
}

export function updateInstruction(p: Program, index: number, ins: Instruction): Program {
  const instructions = p.instructions.map((old, i) => (i === index ? ins : old));
  return { ...p, instructions };
}

export function setOutput(p: Program, coordinate: number, register: number): Program {
  return { ...p, outputs: p.outputs.map((r, i) => (i === coordinate ? register : r)) };
}

export interface ProgramIssue {
  path: string;
  message: string;
}

export function validateProgram(p: Program, designWidth?: number): ProgramIssue[] {
  const issues: ProgramIssue[] = [];
  const f = fieldOps(p.field);
  if (designWidth !== undefined && p.width !== designWidth) {
    issues.push({
      path: '/width',
      message: `The circuit has ${p.width} inputs but the design has width ${designWidth}.`,
    });
  }
  if (p.instructions.length > MAX_INSTRUCTIONS) {
    issues.push({ path: '/instructions', message: `At most ${MAX_INSTRUCTIONS} instructions are allowed.` });
  }
  p.instructions.forEach((ins, i) => {
    const reg = p.width + i;
    for (const [key, r] of Object.entries(ins.op === 'add' ? { a: ins.a, b: ins.b } : { a: ins.a })) {
      if (!Number.isInteger(r) || r < 0 || r >= reg) {
        issues.push({
          path: `/instructions/${i}/${key}`,
          message: `${registerName(p, reg)}: choose an operand from x0 to ${registerName(p, reg - 1)}.`,
        });
      }
    }
    if (ins.op === 'mul' && !f.isValid(ins.k)) {
      issues.push({
        path: `/instructions/${i}/k`,
        message: `${registerName(p, reg)}: the constant must be ${f.syntax}.`,
      });
    }
  });
  if (p.outputs.length !== p.width) {
    issues.push({ path: '/outputs', message: `Choose exactly ${p.width} outputs.` });
  }
  p.outputs.forEach((r, i) => {
    if (!Number.isInteger(r) || r < 0 || r >= registerCount(p)) {
      issues.push({ path: `/outputs/${i}`, message: `Output y${i}: choose a register.` });
    }
  });
  return issues;
}

/** Evaluates every register on an input vector. Requires a valid program. */
export function evaluateRegisters(p: Program, input: readonly string[]): string[] {
  const f = fieldOps(p.field);
  const regs = input.map((x) => f.canonical(x));
  for (const ins of p.instructions) {
    regs.push(ins.op === 'add' ? f.add(regs[ins.a]!, regs[ins.b]!) : f.mul(ins.k, regs[ins.a]!));
  }
  return regs;
}

export function evaluate(p: Program, input: readonly string[]): string[] {
  const regs = evaluateRegisters(p, input);
  return p.outputs.map((r) => regs[r]!);
}

/** The matrix the circuit computes: row i holds the coefficients of output i. */
export function coefficientMatrix(p: Program): string[][] {
  const f = fieldOps(p.field);
  const regs: string[][] = Array.from({ length: p.width }, (_, i) =>
    Array.from({ length: p.width }, (_, j) => (i === j ? f.one : f.zero)),
  );
  for (const ins of p.instructions) {
    if (ins.op === 'add') {
      const a = regs[ins.a]!;
      const b = regs[ins.b]!;
      regs.push(a.map((x, j) => f.add(x, b[j]!)));
    } else {
      regs.push(regs[ins.a]!.map((x) => f.mul(ins.k, x)));
    }
  }
  return p.outputs.map((r) => regs[r]!);
}

export interface CircuitStats {
  adds: number;
  muls: number;
  xtimes: number;
  otherMuls: number;
  depth: number;
  /** Instructions whose result never reaches an output. */
  unused: number[];
}

export function circuitStats(p: Program): CircuitStats {
  const depth: number[] = Array.from({ length: p.width }, () => 0);
  let adds = 0;
  let xtimes = 0;
  let muls = 0;
  for (const ins of p.instructions) {
    const ds = operands(ins).map((r) => depth[r] ?? 0);
    depth.push(1 + Math.max(0, ...ds));
    if (ins.op === 'add') adds++;
    else {
      muls++;
      if (isXtime(p.field, ins)) xtimes++;
    }
  }
  const live = new Set<number>();
  const stack = p.outputs.filter((r) => r >= 0);
  while (stack.length) {
    const r = stack.pop()!;
    if (live.has(r)) continue;
    live.add(r);
    const ins = p.instructions[r - p.width];
    if (ins) stack.push(...operands(ins).filter((x) => x >= 0));
  }
  const unused = p.instructions.map((_, i) => i).filter((i) => !live.has(p.width + i));
  return {
    adds,
    muls,
    xtimes,
    otherMuls: muls - xtimes,
    depth: Math.max(0, ...p.outputs.map((r) => depth[r] ?? 0)),
    unused,
  };
}

/** One-line text form of an instruction, e.g. "r8 = xtime(r7)". */
export function describeInstruction(p: Program, index: number): string {
  const ins = p.instructions[index]!;
  const dst = registerName(p, p.width + index);
  if (ins.op === 'add') {
    const sym = p.field === 'gf256' ? '⊕' : '+';
    return `${dst} = ${registerName(p, ins.a)} ${sym} ${registerName(p, ins.b)}`;
  }
  if (isXtime(p.field, ins)) return `${dst} = xtime(${registerName(p, ins.a)})`;
  const k = p.field === 'gf256' ? ins.k.toUpperCase() : ins.k;
  return `${dst} = ${k} · ${registerName(p, ins.a)}`;
}

/** Expands a register into an expression over the inputs, e.g. "xtime(x0 ⊕ x1)". */
export function expressionOf(p: Program, r: number, limit = 6): string {
  const go = (reg: number, budget: number): string => {
    if (reg < p.width) return registerName(p, reg);
    const ins = p.instructions[reg - p.width];
    if (!ins || budget <= 0) return registerName(p, reg);
    if (ins.op === 'add') {
      const sym = p.field === 'gf256' ? '⊕' : '+';
      return `(${go(ins.a, budget - 1)} ${sym} ${go(ins.b, budget - 1)})`;
    }
    const inner = go(ins.a, budget - 1);
    const bare = inner.startsWith('(') && inner.endsWith(')') ? inner.slice(1, -1) : inner;
    return isXtime(p.field, ins) ? `xtime(${bare})` : `${ins.k}·(${bare})`;
  };
  const text = go(r, limit);
  return text.startsWith('(') && text.endsWith(')') ? text.slice(1, -1) : text;
}
