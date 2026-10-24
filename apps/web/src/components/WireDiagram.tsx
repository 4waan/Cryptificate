import { useMemo } from 'react';
import { circuitStats, describeInstruction, expressionOf, isXtime, registerName } from '../lib/circuit';
import type { Program } from '../lib/types';

interface NodePos {
  reg: number;
  col: number;
  y: number;
}

const COL_W = 92;
const ROW_H = 46;
const PAD_X = 34;
const PAD_Y = 26;
const R = 14;

/** Layered layout: column = depth, rows ordered by the mean height of their operands. */
export function layoutCircuit(p: Program): { nodes: Map<number, NodePos>; columns: number; rows: number } {
  const depth: number[] = [];
  const nodes = new Map<number, NodePos>();
  for (let r = 0; r < p.width; r++) depth[r] = 0;
  p.instructions.forEach((ins, i) => {
    const ops = ins.op === 'add' ? [ins.a, ins.b] : [ins.a];
    depth[p.width + i] = 1 + Math.max(0, ...ops.map((r) => (r >= 0 ? (depth[r] ?? 0) : 0)));
  });
  const columns = Math.max(0, ...depth) + 1;
  const byCol: number[][] = Array.from({ length: columns }, () => []);
  depth.forEach((d, r) => byCol[d]!.push(r));
  const yOf = new Map<number, number>();
  let rows = 0;
  byCol.forEach((regs, col) => {
    const keyed = regs.map((reg) => {
      if (col === 0) return { reg, key: reg };
      const ins = p.instructions[reg - p.width]!;
      const ops = (ins.op === 'add' ? [ins.a, ins.b] : [ins.a]).filter((r) => yOf.has(r));
      const key = ops.length ? ops.reduce((s, r) => s + yOf.get(r)!, 0) / ops.length : reg;
      return { reg, key };
    });
    keyed.sort((a, b) => a.key - b.key || a.reg - b.reg);
    keyed.forEach(({ reg }, i) => {
      yOf.set(reg, i);
      nodes.set(reg, { reg, col, y: i });
    });
    rows = Math.max(rows, regs.length);
  });
  return { nodes, columns, rows };
}

export function WireDiagram({
  program: p,
  highlight = [],
  selected,
  onSelect,
  titleId,
}: {
  program: Program;
  highlight?: number[];
  selected?: number | null;
  onSelect?: (index: number) => void;
  titleId: string;
}) {
  const { nodes, columns, rows } = useMemo(() => layoutCircuit(p), [p]);
  const stats = useMemo(() => circuitStats(p), [p]);
  const width = PAD_X * 2 + (columns - 1) * COL_W + 70;
  const height = PAD_Y * 2 + Math.max(rows - 1, 1) * ROW_H;
  const pos = (reg: number) => {
    const n = nodes.get(reg);
    if (!n) return null;
    const colRows = [...nodes.values()].filter((m) => m.col === n.col).length;
    const offset = ((rows - colRows) * ROW_H) / 2;
    return { x: PAD_X + n.col * COL_W, y: PAD_Y + offset + n.y * ROW_H };
  };
  const hlRegs = new Set(highlight.map((i) => p.width + i));
  const outX = PAD_X + (columns - 1) * COL_W + 62;
  const addSym = p.field === 'gf256' ? '⊕' : '+';
  const descId = `${titleId}-desc`;

  return (
    <div className="stack" style={{ gap: 8 }}>
      <svg
        className="wire-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${titleId} ${descId}`}
        style={{ maxHeight: 420 }}
      >
        <title id={titleId}>Wire diagram of circuit {p.name ?? ''}</title>
        <desc id={descId}>
          {`${p.width} inputs, ${p.instructions.length} instructions (${stats.adds} additions, ${stats.xtimes} xtime, ${stats.otherMuls} other multiplications), depth ${stats.depth}. A text version follows the diagram.`}
        </desc>
        {p.instructions.map((ins, i) => {
          const to = pos(p.width + i);
          if (!to) return null;
          const ops = ins.op === 'add' ? [ins.a, ins.b] : [ins.a];
          return ops.map((r, k) => {
            const from = r >= 0 ? pos(r) : null;
            if (!from) return null;
            const mid = (from.x + to.x) / 2;
            const hl = hlRegs.has(p.width + i);
            return (
              <path
                key={`${i}-${k}`}
                className={`edge${hl ? ' edge-hl' : ''}`}
                d={`M${from.x + R},${from.y} C${mid},${from.y} ${mid},${to.y} ${to.x - R},${to.y}`}
              />
            );
          });
        })}
        {p.outputs.map((r, i) => {
          const from = r >= 0 ? pos(r) : null;
          if (!from) return null;
          const y = PAD_Y + ((rows - p.width) * ROW_H) / 2 + i * ROW_H;
          const mid = (from.x + outX) / 2;
          return (
            <g key={`out-${i}`} className="out">
              <path className="edge" d={`M${from.x + R},${from.y} C${mid},${from.y} ${mid},${y} ${outX - 14},${y}`} />
              <text x={outX - 8} y={y + 4}>
                y{i}
              </text>
            </g>
          );
        })}
        {[...nodes.values()].map((n) => {
          const c = pos(n.reg)!;
          if (n.reg < p.width) {
            return (
              <g key={n.reg} className="node">
                <rect x={c.x - R} y={c.y - R + 2} width={R * 2} height={R * 2 - 4} rx={5} />
                <text x={c.x} y={c.y + 4} textAnchor="middle">
                  x{n.reg}
                </text>
              </g>
            );
          }
          const i = n.reg - p.width;
          const ins = p.instructions[i]!;
          const xt = isXtime(p.field, ins);
          const label = ins.op === 'add' ? addSym : xt ? 'xt' : `·${ins.k}`;
          const cls = `node${xt ? ' node-xtime' : ''}${hlRegs.has(n.reg) ? ' node-hl' : ''}${selected === i ? ' node-sel' : ''}${onSelect ? ' clickable' : ''}`;
          return (
            <g key={n.reg} className={cls} onClick={onSelect ? () => onSelect(i) : undefined}>
              <title>{`${describeInstruction(p, i)}; ${registerName(p, n.reg)} = ${expressionOf(p, n.reg)}`}</title>
              <circle cx={c.x} cy={c.y} r={R} />
              <text x={c.x} y={c.y + 4} textAnchor="middle" style={{ fontSize: label.length > 3 ? 9 : 12 }}>
                {label}
              </text>
              <text className="reg" x={c.x} y={c.y + R + 10} textAnchor="middle">
                {registerName(p, n.reg)}
              </text>
            </g>
          );
        })}
      </svg>
      <details>
        <summary className="small">Text version of the wire diagram</summary>
        <ol className="small mono" style={{ margin: '8px 0 0', paddingLeft: 24 }}>
          {p.instructions.map((_, i) => (
            <li key={i} value={i}>
              {describeInstruction(p, i)}
              {highlight.includes(i) ? ' (highlighted)' : ''}
              <span className="muted"> = {expressionOf(p, p.width + i)}</span>
            </li>
          ))}
        </ol>
        <p className="small mono" style={{ marginTop: 6 }}>
          Outputs: {p.outputs.map((r, i) => `y${i} = ${registerName(p, r)}`).join(', ')}
        </p>
      </details>
    </div>
  );
}
