import { describe, expect, it } from 'vitest';
import {
  UNSET,
  canMove,
  circuitStats,
  coefficientMatrix,
  describeInstruction,
  evaluate,
  expressionOf,
  insertInstruction,
  moveInstruction,
  operandChoices,
  removeInstruction,
  setOutput,
  updateInstruction,
  validateProgram,
} from './circuit';
import { AES_MIXCOLUMNS, aesSharedSum, hadesSharedSum, miswiredSharedSum, WIRE_STEP_XTIME } from './presets';
import type { Program } from './types';

describe('reference circuits', () => {
  it('the shared-sum circuit computes AES MixColumns with 15 XORs and 4 xtimes', () => {
    const p = aesSharedSum();
    expect(validateProgram(p, 4)).toEqual([]);
    expect(coefficientMatrix(p)).toEqual(AES_MIXCOLUMNS);
    const s = circuitStats(p);
    expect([s.adds, s.xtimes, s.otherMuls, s.unused]).toEqual([15, 4, 0, []]);
    expect(evaluate(p, ['01', '00', '00', '00'])).toEqual(['02', '01', '01', '03']);
    expect(evaluate(p, ['80', '00', '00', '00'])).toEqual(['1B', '80', '80', '9B']);
  });

  it('the miswired circuit differs exactly on the first output for input [00,01,00,00]', () => {
    expect(evaluate(aesSharedSum(), ['00', '01', '00', '00'])).toEqual(['03', '02', '01', '01']);
    expect(evaluate(miswiredSharedSum(), ['00', '01', '00', '00'])).toEqual(['01', '02', '01', '01']);
    expect(expressionOf(aesSharedSum(), 4 + WIRE_STEP_XTIME)).toBe('xtime(x0 ⊕ x1)');
    expect(expressionOf(miswiredSharedSum(), 4 + WIRE_STEP_XTIME)).toBe('xtime(x0 ⊕ x2)');
  });

  it('the BN254 shared-sum circuit computes [[2,1,1],[1,2,1],[1,1,2]]', () => {
    expect(coefficientMatrix(hadesSharedSum())).toEqual([
      ['2', '1', '1'],
      ['1', '2', '1'],
      ['1', '1', '2'],
    ]);
  });
});

const small = (): Program => ({
  field: 'gf256',
  width: 2,
  instructions: [
    { op: 'add', a: 0, b: 1 }, // r2
    { op: 'mul', k: '02', a: 2 }, // r3
    { op: 'add', a: 3, b: 0 }, // r4
  ],
  outputs: [4, 3],
});

describe('editor operations', () => {
  it('offers only existing registers as operands', () => {
    expect(operandChoices(small(), 0)).toEqual([0, 1]);
    expect(operandChoices(small(), 2)).toEqual([0, 1, 2, 3]);
  });

  it('inserting shifts later register references and keeps the function', () => {
    const p = insertInstruction(small(), 1, { op: 'add', a: 0, b: 0 });
    expect(p.instructions).toHaveLength(4);
    expect(p.instructions[2]).toEqual({ op: 'mul', k: '02', a: 2 });
    expect(p.instructions[3]).toEqual({ op: 'add', a: 4, b: 0 });
    expect(p.outputs).toEqual([5, 4]);
    expect(coefficientMatrix(p)).toEqual(coefficientMatrix(small()));
  });

  it('appending adds a valid instruction at the end', () => {
    const p = insertInstruction(small(), 3);
    expect(p.instructions[3]).toEqual({ op: 'add', a: 0, b: 1 });
    expect(validateProgram(p)).toEqual([]);
  });

  it('removing marks reads of the removed register as unset and shifts later ones', () => {
    const p = removeInstruction(small(), 1);
    expect(p.instructions).toEqual([
      { op: 'add', a: 0, b: 1 },
      { op: 'add', a: UNSET, b: 0 },
    ]);
    expect(p.outputs).toEqual([3, UNSET]);
    const issues = validateProgram(p).map((i) => i.path);
    expect(issues).toEqual(['/instructions/1/a', '/outputs/1']);
  });

  it('moving is refused when an instruction reads its neighbour', () => {
    expect(canMove(small(), 1, -1).ok).toBe(false);
    expect(canMove(small(), 1, -1).reason).toMatch(/r3 reads r2/);
    expect(canMove(small(), 0, -1).ok).toBe(false);
    expect(moveInstruction(small(), 1, -1)).toEqual(small());
  });

  it('moving independent instructions renames registers and keeps the function', () => {
    const p: Program = {
      field: 'gf256',
      width: 2,
      instructions: [
        { op: 'add', a: 0, b: 1 }, // r2
        { op: 'mul', k: '03', a: 0 }, // r3
        { op: 'add', a: 2, b: 3 }, // r4
      ],
      outputs: [4, 2],
    };
    const moved = moveInstruction(p, 1, -1);
    expect(moved.instructions).toEqual([
      { op: 'mul', k: '03', a: 0 },
      { op: 'add', a: 0, b: 1 },
      { op: 'add', a: 3, b: 2 },
    ]);
    expect(moved.outputs).toEqual([4, 3]);
    expect(coefficientMatrix(moved)).toEqual(coefficientMatrix(p));
  });

  it('updates instructions and outputs immutably', () => {
    const p = small();
    const q = setOutput(updateInstruction(p, 0, { op: 'add', a: 1, b: 1 }), 1, 0);
    expect(p.instructions[0]).toEqual({ op: 'add', a: 0, b: 1 });
    expect(q.instructions[0]).toEqual({ op: 'add', a: 1, b: 1 });
    expect(q.outputs).toEqual([4, 0]);
  });

  it('flags forward references, bad constants and wrong output counts', () => {
    const p: Program = {
      field: 'gf256',
      width: 2,
      instructions: [
        { op: 'add', a: 0, b: 2 },
        { op: 'mul', k: 'G1', a: 0 },
      ],
      outputs: [3],
    };
    expect(validateProgram(p).map((i) => i.path)).toEqual(['/instructions/0/b', '/instructions/1/k', '/outputs']);
  });

  it('describes instructions with xtime for multiplication by 02', () => {
    const p = small();
    expect(describeInstruction(p, 0)).toBe('r2 = x0 ⊕ x1');
    expect(describeInstruction(p, 1)).toBe('r3 = xtime(r2)');
    expect(describeInstruction(updateInstruction(p, 1, { op: 'mul', k: '1b', a: 2 }), 1)).toBe('r3 = 1B · r2');
  });

  it('reports depth and unused instructions', () => {
    const p = insertInstruction(small(), 3, { op: 'add', a: 0, b: 0 });
    const s = circuitStats(p);
    expect(s.depth).toBe(3);
    expect(s.unused).toEqual([3]);
  });
});
