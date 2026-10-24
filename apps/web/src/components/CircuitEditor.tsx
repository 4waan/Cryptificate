import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  MAX_INSTRUCTIONS,
  UNSET,
  canMove,
  circuitStats,
  expressionOf,
  insertInstruction,
  isXtime,
  moveInstruction,
  operandChoices,
  registerCount,
  registerName,
  removeInstruction,
  setOutput,
  updateInstruction,
  validateProgram,
} from '../lib/circuit';
import { fieldOps } from '../lib/field';
import type { Instruction, Program } from '../lib/types';
import { IconDown, IconPlus, IconTrash, IconUp, IconWarning } from './icons';
import { WireDiagram } from './WireDiagram';

type OpKind = 'add' | 'xtime' | 'mul';

function opKind(p: Program, ins: Instruction): OpKind {
  if (ins.op === 'add') return 'add';
  return isXtime(p.field, ins) ? 'xtime' : 'mul';
}

function RegisterSelect({
  p,
  value,
  choices,
  label,
  onChange,
  invalid,
}: {
  p: Program;
  value: number;
  choices: number[];
  label: string;
  onChange: (r: number) => void;
  invalid?: boolean;
}) {
  return (
    <select
      className="select"
      value={value}
      aria-label={label}
      aria-invalid={invalid || value === UNSET}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {value === UNSET || !choices.includes(value) ? <option value={value}>choose…</option> : null}
      {choices.map((r) => (
        <option key={r} value={r}>
          {registerName(p, r)}
        </option>
      ))}
    </select>
  );
}

export function CircuitStatsLine({ program }: { program: Program }) {
  const s = circuitStats(program);
  const addWord = program.field === 'gf256' ? 'XORs' : 'additions';
  return (
    <div className="stat-row" aria-label="Operation counts">
      <div className="stat">
        <span className="stat-label">{addWord}</span>
        <span className="stat-value">{s.adds}</span>
      </div>
      {program.field === 'gf256' ? (
        <div className="stat">
          <span className="stat-label">xtimes</span>
          <span className="stat-value">{s.xtimes}</span>
        </div>
      ) : null}
      <div className="stat">
        <span className="stat-label">{program.field === 'gf256' ? 'other multiplications' : 'multiplications'}</span>
        <span className="stat-value">{s.otherMuls}</span>
      </div>
      <div className="stat">
        <span className="stat-label">depth</span>
        <span className="stat-value">{s.depth}</span>
      </div>
      {s.unused.length ? (
        <div className="stat">
          <span className="stat-label">unused</span>
          <span className="stat-value">{s.unused.length}</span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Visual circuit editor: one row per instruction (each defines a register),
 * operand choices limited to existing registers, and a wire diagram.
 */
export function CircuitEditor({
  program: p,
  onChange,
  highlight = [],
  designWidth,
  compact = false,
}: {
  program: Program;
  onChange: (p: Program) => void;
  highlight?: number[];
  designWidth?: number;
  compact?: boolean;
}) {
  const id = useId();
  const [selected, setSelected] = useState<number | null>(highlight[0] ?? null);
  const [showDiagram, setShowDiagram] = useState(!compact);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  const f = fieldOps(p.field);
  const issues = useMemo(() => validateProgram(p, designWidth), [p, designWidth]);
  const stats = useMemo(() => circuitStats(p), [p]);
  const issueAt = (path: string) => issues.some((i) => i.path === path);
  const [announce, setAnnounce] = useState('');

  useEffect(() => {
    if (highlight.length) setSelected(highlight[0]!);
  }, [highlight.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const select = (i: number, scroll = true) => {
    setSelected(i);
    if (scroll) rowRefs.current[i]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  const setOp = (i: number, kind: OpKind) => {
    const ins = p.instructions[i]!;
    const a = ins.a;
    const reg = p.width + i;
    let next: Instruction;
    if (kind === 'add') next = { op: 'add', a, b: ins.op === 'add' ? ins.b : a === 0 ? Math.min(1, reg - 1) : 0 };
    else if (kind === 'xtime') next = { op: 'mul', k: '02', a };
    else next = { op: 'mul', k: ins.op === 'mul' && !isXtime(p.field, ins) ? ins.k : p.field === 'gf256' ? '03' : '2', a };
    onChange(updateInstruction(p, i, next));
  };

  const outputsOf = (reg: number) => p.outputs.map((r, i) => (r === reg ? i : -1)).filter((i) => i >= 0);

  return (
    <section className="panel" aria-labelledby={`${id}-heading`}>
      <div className="panel-head">
        <h2 id={`${id}-heading`}>Circuit</h2>
        <span className="panel-sub">
          {p.name ? <span className="mono">{p.name}</span> : 'unnamed'} · {p.instructions.length} instructions
        </span>
      </div>
      <div className="stack-lg">
        <CircuitStatsLine program={p} />

        <div className="stack" style={{ gap: 8 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3 className="field-label" id={`${id}-list`}>
              Instructions
            </h3>
            <span className="small muted">
              Registers x0–x{p.width - 1} are inputs; each instruction defines the next register.
            </span>
          </div>
          <ol className="instr-list" aria-labelledby={`${id}-list`}>
            {p.instructions.map((ins, i) => {
              const reg = p.width + i;
              const kind = opKind(p, ins);
              const choices = operandChoices(p, i);
              const up = canMove(p, i, -1);
              const down = canMove(p, i, 1);
              const outs = outputsOf(reg);
              const name = registerName(p, reg);
              return (
                <li
                  key={i}
                  ref={(el) => {
                    rowRefs.current[i] = el;
                  }}
                  className="instr"
                  data-highlight={highlight.includes(i) ? 'true' : undefined}
                  data-selected={selected === i ? 'true' : undefined}
                  onFocusCapture={() => select(i, false)}
                  aria-label={`${name}${highlight.includes(i) ? ', highlighted' : ''}`}
                >
                  <span className="instr-reg">{name}</span>
                  <select
                    className="select"
                    value={kind}
                    aria-label={`${name} operation`}
                    onChange={(e) => setOp(i, e.target.value as OpKind)}
                  >
                    <option value="add">{p.field === 'gf256' ? '⊕ add' : '+ add'}</option>
                    {p.field === 'gf256' ? <option value="xtime">xtime</option> : null}
                    <option value="mul">· mul by k</option>
                  </select>
                  <span className="instr-ops">
                    {kind === 'mul' && ins.op === 'mul' ? (
                      <input
                        className="input"
                        value={ins.k}
                        aria-label={`${name} constant k`}
                        aria-invalid={!f.isValid(ins.k)}
                        spellCheck={false}
                        onChange={(e) => onChange(updateInstruction(p, i, { ...ins, k: e.target.value.trim() }))}
                        style={{ width: p.field === 'gf256' ? '3.5em' : '7.5em' }}
                      />
                    ) : null}
                    {kind === 'xtime' ? <span className="mono muted">xtime(</span> : null}
                    <RegisterSelect
                      p={p}
                      value={ins.a}
                      choices={choices}
                      label={`${name} first operand`}
                      invalid={issueAt(`/instructions/${i}/a`)}
                      onChange={(a) => onChange(updateInstruction(p, i, { ...ins, a }))}
                    />
                    {ins.op === 'add' ? (
                      <>
                        <span className="mono muted" aria-hidden="true">
                          {p.field === 'gf256' ? '⊕' : '+'}
                        </span>
                        <RegisterSelect
                          p={p}
                          value={ins.b}
                          choices={choices}
                          label={`${name} second operand`}
                          invalid={issueAt(`/instructions/${i}/b`)}
                          onChange={(b) => onChange(updateInstruction(p, i, { ...ins, b }))}
                        />
                      </>
                    ) : null}
                    {kind === 'xtime' ? <span className="mono muted">)</span> : null}
                    <span className="instr-expr" title={expressionOf(p, reg)}>
                      = {expressionOf(p, reg, 3)}
                    </span>
                    {outs.map((o) => (
                      <span key={o} className="instr-out">
                        y{o}
                      </span>
                    ))}
                    {stats.unused.includes(i) ? <span className="instr-unused">unused</span> : null}
                  </span>
                  <span className="instr-actions">
                    <button
                      type="button"
                      className="btn btn-quiet btn-icon"
                      aria-label={`Move ${name} up`}
                      aria-disabled={!up.ok}
                      title={up.ok ? 'Move up' : up.reason}
                      onClick={() => {
                        if (!up.ok) {
                          setAnnounce(up.reason ?? '');
                          return;
                        }
                        onChange(moveInstruction(p, i, -1));
                        select(i - 1);
                      }}
                    >
                      <IconUp size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-quiet btn-icon"
                      aria-label={`Move ${name} down`}
                      aria-disabled={!down.ok}
                      title={down.ok ? 'Move down' : down.reason}
                      onClick={() => {
                        if (!down.ok) {
                          setAnnounce(down.reason ?? '');
                          return;
                        }
                        onChange(moveInstruction(p, i, 1));
                        select(i + 1);
                      }}
                    >
                      <IconDown size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-quiet btn-icon"
                      aria-label={`Insert an instruction after ${name}`}
                      title="Insert below"
                      disabled={p.instructions.length >= MAX_INSTRUCTIONS}
                      onClick={() => {
                        onChange(insertInstruction(p, i + 1));
                        select(i + 1);
                      }}
                    >
                      <IconPlus size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-quiet btn-icon"
                      aria-label={`Remove ${name}`}
                      title="Remove"
                      onClick={() => {
                        onChange(removeInstruction(p, i));
                        setAnnounce(`${name} removed. Reads of ${name} need a new operand.`);
                      }}
                    >
                      <IconTrash size={14} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="row">
            <button
              type="button"
              className="btn btn-sm"
              disabled={p.instructions.length >= MAX_INSTRUCTIONS}
              onClick={() => {
                onChange(insertInstruction(p, p.instructions.length));
                select(p.instructions.length);
              }}
            >
              <IconPlus size={14} /> Add instruction
            </button>
            <span className="small muted">
              {p.instructions.length} of {MAX_INSTRUCTIONS}
            </span>
          </div>
          <p className="visually-hidden" role="status" aria-live="polite">
            {announce}
          </p>
        </div>

        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field-label">Outputs</legend>
          <div className="row">
            {p.outputs.map((r, i) => (
              <label key={i} className="row small" style={{ gap: 6 }}>
                <span className="mono">y{i} =</span>
                <RegisterSelect
                  p={p}
                  value={r}
                  choices={Array.from({ length: registerCount(p) }, (_, k) => k)}
                  label={`Output y${i}`}
                  invalid={issueAt(`/outputs/${i}`)}
                  onChange={(reg) => onChange(setOutput(p, i, reg))}
                />
              </label>
            ))}
          </div>
        </fieldset>

        {issues.length ? (
          <div className="error-text" role="alert">
            <IconWarning />
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {issues.slice(0, 6).map((i) => (
                <li key={i.path}>{i.message}</li>
              ))}
              {issues.length > 6 ? <li>and {issues.length - 6} more</li> : null}
            </ul>
          </div>
        ) : null}

        <div className="stack" style={{ gap: 8 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3 className="field-label">Wire diagram</h3>
            {compact ? (
              <button type="button" className="btn btn-sm" aria-expanded={showDiagram} onClick={() => setShowDiagram((v) => !v)}>
                {showDiagram ? 'Hide diagram' : 'Show diagram'}
              </button>
            ) : null}
          </div>
          {showDiagram ? (
            issues.some((i) => i.path.includes('/a') || i.path.includes('/b')) ? (
              <p className="muted small">Choose every operand to draw the diagram.</p>
            ) : (
              <WireDiagram
                program={p}
                highlight={highlight}
                selected={selected}
                onSelect={(i) => {
                  select(i);
                  rowRefs.current[i]?.querySelector('select')?.focus();
                }}
                titleId={`${id}-wire`}
              />
            )
          ) : null}
        </div>
      </div>
    </section>
  );
}
