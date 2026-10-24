import { useRef } from 'react';
import { fieldOps } from '../lib/field';
import type { FieldName } from '../lib/types';
import { IconWarning } from './icons';

interface Props {
  id: string;
  label: string;
  field: FieldName;
  values: string[][];
  onChange: (next: string[][]) => void;
  /** Cells to emphasise, as "row,col". */
  emphasis?: string[];
}

/**
 * Square matrix editor. Hex cells for GF(2^8), decimal cells for BN254.
 * Arrow keys move between cells; invalid cells are marked inline.
 */
export function MatrixEditor({ id, label, field, values, onChange, emphasis = [] }: Props) {
  const f = fieldOps(field);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const n = values.length;
  const errors: { r: number; c: number }[] = [];
  values.forEach((row, r) => row.forEach((v, c) => (!f.isValid(v) ? errors.push({ r, c }) : null)));

  const focusCell = (r: number, c: number) => {
    const el = refs.current[r * n + c];
    if (el) {
      el.focus();
      el.select();
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    const el = e.currentTarget;
    const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
    const atEnd = el.selectionStart === el.value.length;
    const allSelected = el.selectionStart === 0 && el.selectionEnd === el.value.length;
    let next: [number, number] | null = null;
    if (e.key === 'ArrowUp') next = [Math.max(0, r - 1), c];
    else if (e.key === 'ArrowDown' || e.key === 'Enter') next = [Math.min(n - 1, r + 1), c];
    else if (e.key === 'ArrowLeft' && (atStart || allSelected)) next = [r, Math.max(0, c - 1)];
    else if (e.key === 'ArrowRight' && (atEnd || allSelected)) next = [r, Math.min(n - 1, c + 1)];
    else if (e.key === 'Home' && e.ctrlKey) next = [0, 0];
    else if (e.key === 'End' && e.ctrlKey) next = [n - 1, n - 1];
    if (next) {
      e.preventDefault();
      focusCell(next[0], next[1]);
    }
  };

  const setCell = (r: number, c: number, text: string) => {
    const trimmed = text.trim();
    onChange(values.map((row, i) => row.map((v, j) => (i === r && j === c ? trimmed : v))));
  };

  const canonicalize = (r: number, c: number) => {
    const v = values[r]![c]!;
    if (f.isValid(v) && f.canonical(v) !== v) setCell(r, c, f.canonical(v));
  };

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div role="group" aria-labelledby={`${id}-label`} aria-describedby={`${id}-help`}>
        <div id={`${id}-label`} className="field-label" style={{ marginBottom: 6 }}>
          {label}
        </div>
        <div
          className={`matrix${field === 'bn254' ? ' decimal' : ''}`}
          style={{ gridTemplateColumns: `repeat(${n}, auto)` }}
        >
          {values.map((row, r) =>
            row.map((v, c) => {
              const invalid = !f.isValid(v);
              return (
                <input
                  key={`${r}-${c}`}
                  ref={(el) => {
                    refs.current[r * n + c] = el;
                  }}
                  value={v}
                  inputMode={field === 'gf256' ? 'text' : 'numeric'}
                  spellCheck={false}
                  autoComplete="off"
                  maxLength={field === 'gf256' ? 2 : 78}
                  aria-label={`${label}, row ${r + 1}, column ${c + 1}`}
                  aria-invalid={invalid}
                  aria-describedby={invalid ? `${id}-errors` : undefined}
                  title={field === 'bn254' ? v : undefined}
                  style={emphasis.includes(`${r},${c}`) ? { borderColor: 'var(--accent)', borderWidth: 2 } : undefined}
                  onChange={(e) => setCell(r, c, e.target.value)}
                  onBlur={() => canonicalize(r, c)}
                  onKeyDown={(e) => onKey(e, r, c)}
                  onFocus={(e) => e.currentTarget.select()}
                />
              );
            }),
          )}
        </div>
        <p id={`${id}-help`} className="field-hint" style={{ marginTop: 6 }}>
          {field === 'gf256' ? 'Two hex digits per cell (00 to FF).' : 'Decimal field elements.'} Arrow keys move
          between cells.
        </p>
      </div>
      {errors.length ? (
        <div id={`${id}-errors`} className="error-text" role="alert">
          <IconWarning />
          <span>
            {errors.length === 1 ? 'Cell' : 'Cells'} {errors.map((e) => `(${e.r + 1}, ${e.c + 1})`).join(', ')}: enter{' '}
            {f.syntax}.
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** Read-only matrix display. */
export function MatrixView({ values, label, field }: { values: string[][]; label: string; field: FieldName }) {
  const f = fieldOps(field);
  return (
    <figure style={{ margin: 0 }} className="stack" aria-label={label}>
      <figcaption className="field-label">{label}</figcaption>
      <div className="matrix-static" style={{ gridTemplateColumns: `repeat(${values.length}, auto)` }} role="table">
        {values.map((row, r) => (
          <div key={r} role="row" style={{ display: 'contents' }}>
            {row.map((v, c) => (
              <span key={c} role="cell">
                {f.isValid(v) ? f.canonical(v) : v}
              </span>
            ))}
          </div>
        ))}
      </div>
    </figure>
  );
}
