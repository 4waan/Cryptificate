import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { copyText } from '../lib/clipboard';
import { displayElement, fieldOps, type DisplayField } from '../lib/field';
import { MATRIX_FORMATS, formatMatrix, normalizeCell, parseMatrixText, type MatrixFormat, type Radix } from '../lib/notation';
import { IconCopy, IconPaste, IconWarning } from './icons';

interface Props {
  id: string;
  label: string;
  field: DisplayField;
  values: string[][];
  /** `cell` ("row,col") is set for typing in one cell; it is absent for pastes and imports. */
  onChange: (next: string[][], cell?: string) => void;
  /** Cells to emphasise, as "row,col". */
  emphasis?: string[];
  /** Variable name used by "Copy as" (M, M_E, M_I). */
  exportName?: string;
  /** Show the paste and "Copy as" tools under the grid. */
  tools?: boolean;
}

/** Splits pasted text into cell values when every token is an element; otherwise null. */
export function pastedCells(text: string, field: DisplayField): string[] | null {
  const tokens = text.split(/[\s,;[\]{}()]+/).filter(Boolean);
  const cells = tokens.map((t) => normalizeCell(t.replace(/^["']|["']$/g, ''), field));
  return cells.length && cells.every((c): c is string => c !== null) ? cells : null;
}

/**
 * How a run of `count` pasted values starting at flat index `start` fits an
 * n×n grid: 'fits', 'overflows' past the last cell, or 'none' when the text
 * did not read as a run of values. A run as long as the whole grid counts as
 * a matrix, whose own parse error is more useful.
 */
export function planCellPaste(cells: string[] | null, start: number, n: number): 'fits' | 'overflows' | 'none' {
  if (!cells) return 'none';
  if (start + cells.length <= n * n) return 'fits';
  return cells.length < n * n ? 'overflows' : 'none';
}

/**
 * Square matrix editor. Hex cells for GF(2^8), decimal cells for BN254.
 * Arrow keys move between cells; invalid cells are marked inline. Cells
 * are normalized on blur ("1" becomes 01, "0x1b" becomes 1B). Pasting a
 * whole matrix in any supported notation fills the grid; pasting a run of
 * values fills cells from the focused one, row by row.
 */
export function MatrixEditor({ id, label, field, values, onChange, emphasis = [], exportName = 'M', tools = true }: Props) {
  const f = fieldOps(field);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const n = values.length;
  const errors: { r: number; c: number }[] = [];
  values.forEach((row, r) => row.forEach((v, c) => (!f.isValid(v) ? errors.push({ r, c }) : null)));
  const [pasteNote, setPasteNote] = useState<{ error: boolean; text: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const pasteToggleRef = useRef<HTMLButtonElement>(null);

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
    onChange(
      values.map((row, i) => row.map((v, j) => (i === r && j === c ? trimmed : v))),
      `${r},${c}`,
    );
  };

  const canonicalize = (r: number, c: number) => {
    const v = values[r]![c]!;
    const norm = normalizeCell(v, field);
    if (norm !== null && norm !== v) setCell(r, c, norm);
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>, r: number, c: number) => {
    const text = e.clipboardData.getData('text/plain');
    // A single value pastes normally and is normalized on blur.
    if (!text.trim() || !/[\s,;[\]{}]/.test(text.trim())) return;
    e.preventDefault();
    const full = parseMatrixText(text, field, { size: n });
    if (full.ok) {
      onChange(full.matrix);
      setPasteNote({ error: false, text: [`Pasted a ${n}×${n} matrix.`, ...full.notes].join(' ') });
      return;
    }
    const cells = pastedCells(text, field);
    const start = r * n + c;
    const plan = planCellPaste(cells, start, n);
    if (cells && plan === 'fits') {
      const flat = values.flat();
      cells.forEach((v, k) => {
        flat[start + k] = v;
      });
      onChange(Array.from({ length: n }, (_, i) => flat.slice(i * n, i * n + n)));
      setPasteNote({
        error: false,
        text: `Pasted ${cells.length} values from row ${r + 1}, column ${c + 1}, row by row.`,
      });
      return;
    }
    setPasteNote({
      error: true,
      text:
        cells && plan === 'overflows'
          ? `Paste not applied: ${cells.length} values from row ${r + 1}, column ${c + 1} run past the last cell.`
          : `Paste not applied. ${full.error}`,
    });
  };

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div role="group" aria-labelledby={`${id}-label`} aria-describedby={`${id}-help`}>
        <div id={`${id}-label`} className="field-label" style={{ marginBottom: 6 }}>
          {label}
        </div>
        {/* A wide matrix (Poseidon2 widths up to 24) scrolls inside its own box. */}
        <div style={n > 4 ? { overflowX: 'auto', maxWidth: '100%' } : undefined}>
          <div
            className={`matrix${field !== 'gf256' ? ' decimal' : ''}`}
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
                    maxLength={field === 'gf256' ? 4 : 80}
                    aria-label={`${label}, row ${r + 1}, column ${c + 1}`}
                    aria-invalid={invalid}
                    aria-describedby={invalid ? `${id}-errors` : undefined}
                    title={field !== 'gf256' ? v : undefined}
                    data-emphasis={emphasis.includes(`${r},${c}`) ? 'true' : undefined}
                    onChange={(e) => setCell(r, c, e.target.value)}
                    onBlur={() => canonicalize(r, c)}
                    onKeyDown={(e) => onKey(e, r, c)}
                    onFocus={(e) => e.currentTarget.select()}
                    onPaste={(e) => onPaste(e, r, c)}
                  />
                );
              }),
            )}
          </div>
        </div>
        <p id={`${id}-help`} className="field-hint" style={{ marginTop: 6 }}>
          {field === 'gf256' ? 'Two hex digits per cell (00 to FF); 1 or 0x1b are normalized.' : 'Decimal field elements.'}{' '}
          Arrow keys move between cells. Paste a whole matrix into any cell.
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
      <p className={pasteNote?.error ? 'error-text' : 'small muted'} role="status" aria-live="polite" hidden={!pasteNote}>
        {pasteNote ? (
          <>
            {pasteNote.error ? <IconWarning /> : null}
            <span>{pasteNote.text}</span>
          </>
        ) : null}
      </p>
      {tools ? (
        <>
          <div className="row matrix-tools">
            <button
              ref={pasteToggleRef}
              type="button"
              className="btn btn-sm"
              aria-expanded={importing}
              aria-controls={`${id}-import`}
              onClick={() => setImporting((v) => !v)}
            >
              <IconPaste size={14} /> Paste matrix…
            </button>
            <CopyMenu values={values} field={field} name={exportName} label={label} />
          </div>
          {importing ? (
            <MatrixImport
              id={`${id}-import`}
              field={field}
              n={n}
              onApply={(m, note) => {
                onChange(m);
                setPasteNote({ error: false, text: note });
                setImporting(false);
                // The box unmounts; send focus to the first cell so keyboard users stay in the grid.
                focusCell(0, 0);
              }}
              onClose={() => {
                // Move focus before the box unmounts, so it never falls back to the page.
                pasteToggleRef.current?.focus();
                setImporting(false);
              }}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

const RADIX_TEXT: Record<Radix, string> = { auto: 'Auto', hex: 'Hex', dec: 'Decimal' };

/** Paste box with a live preview of the parsed matrix. */
function MatrixImport({
  id,
  field,
  n,
  onApply,
  onClose,
}: {
  id: string;
  field: DisplayField;
  n: number;
  onApply: (m: string[][], note: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [radix, setRadix] = useState<Radix>('auto');
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const parsed = useMemo(
    () => (text.trim() ? parseMatrixText(text, field, { size: n, radix }) : null),
    [text, field, n, radix],
  );
  useEffect(() => areaRef.current?.focus(), []);

  return (
    <div className="matrix-import" id={id}>
      <label className="field-hint" htmlFor={`${id}-text`}>
        A {n}×{n} matrix as a hex grid, a C or Rust array, a Python, NumPy or Sage list, or LaTeX.
      </label>
      <textarea
        ref={areaRef}
        id={`${id}-text`}
        className="textarea"
        rows={5}
        value={text}
        spellCheck={false}
        placeholder={field === 'gf256' ? '{{0x02, 0x03, 0x01, 0x01}, …}' : '[[2, 1, 1], [1, 2, 1], [1, 1, 3]]'}
        aria-invalid={parsed ? !parsed.ok : undefined}
        aria-describedby={`${id}-result`}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
      />
      {field === 'gf256' ? (
        <div className="row" style={{ gap: 8 }}>
          <span className="small muted" id={`${id}-radix`}>
            Numbers without 0x
          </span>
          <div className="segmented" role="radiogroup" aria-labelledby={`${id}-radix`}>
            {(['auto', 'hex', 'dec'] as const).map((r) => (
              <button key={r} type="button" role="radio" aria-checked={radix === r} onClick={() => setRadix(r)}>
                {RADIX_TEXT[r]}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <p id={`${id}-result`} className={parsed && !parsed.ok ? 'error-text' : 'small muted'} role="status" aria-live="polite">
        {parsed?.ok ? (
          <span>
            Reads as a {n}×{n} matrix{parsed.notes.length ? `. ${parsed.notes.join(' ')}` : '.'}
          </span>
        ) : parsed ? (
          <>
            <IconWarning />
            <span>{parsed.error}</span>
          </>
        ) : null}
      </p>
      {parsed?.ok ? <MatrixView values={parsed.matrix} label="Preview" field={field} /> : null}
      <div className="row">
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={!parsed?.ok}
          onClick={() => parsed?.ok && onApply(parsed.matrix, [`Pasted a ${n}×${n} matrix.`, ...parsed.notes].join(' '))}
        >
          Use this matrix
        </button>
        <button type="button" className="btn btn-sm btn-quiet" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** "Copy as" menu: JSON, C array, Rust array, Sage matrix, plain grid. */
function CopyMenu({ values, field, name, label }: { values: string[][]; field: DisplayField; name: string; label: string }) {
  const id = useId();
  const f = fieldOps(field);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const valid = values.every((row) => row.every((v) => f.isValid(v)));

  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const copy = async (format: MatrixFormat, text: string) => {
    setOpen(false);
    buttonRef.current?.focus();
    const canonical = values.map((row) => row.map((v) => f.canonical(v)));
    const ok = await copyText(formatMatrix(canonical, field, format, name));
    setStatus(ok ? `Copied as ${text}.` : 'The browser blocked the clipboard.');
  };

  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    let next: number | null = null;
    if (e.key === 'ArrowDown') next = (at + 1) % items.length;
    else if (e.key === 'ArrowUp') next = (at - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    } else if (e.key === 'Tab') setOpen(false);
    if (next !== null) {
      e.preventDefault();
      items[next]?.focus();
    }
  };

  return (
    <div className="menu-wrap" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="btn btn-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        disabled={!valid}
        title={valid ? `Copy ${label} for code or Sage` : undefined}
        aria-describedby={valid ? undefined : `${id}-why`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <IconCopy size={14} /> Copy as
      </button>
      {open ? (
        <ul className="menu" role="menu" id={`${id}-menu`} aria-label="Copy the matrix as" onKeyDown={onMenuKey}>
          {MATRIX_FORMATS.map((fmt, i) => (
            <li key={fmt.id} role="none">
              <button
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => void copy(fmt.id, fmt.label)}
              >
                {fmt.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <span className="small muted" role="status">
        {status}
      </span>
      {valid ? null : (
        <span className="small muted" id={`${id}-why`}>
          Fix the invalid cells to copy.
        </span>
      )}
    </div>
  );
}

/** Read-only matrix display. Emphasised cells carry a marker and a text label, not colour alone. */
export function MatrixView({
  values,
  label,
  field,
  emphasis = [],
  emphasisLabel = 'differs',
}: {
  values: string[][];
  label: string;
  field: DisplayField;
  emphasis?: string[];
  emphasisLabel?: string;
}) {
  return (
    <figure style={{ margin: 0 }} className="stack" aria-label={label}>
      <figcaption className="field-label">{label}</figcaption>
      <div className="matrix-static" style={{ gridTemplateColumns: `repeat(${values.length}, auto)` }} role="table">
        {values.map((row, r) => (
          <div key={r} role="row" style={{ display: 'contents' }}>
            {row.map((v, c) => {
              const hl = emphasis.includes(`${r},${c}`);
              const d = displayElement(field, v);
              return (
                <span
                  key={c}
                  role="cell"
                  className={hl ? 'cell-diff' : undefined}
                  title={field !== 'gf256' ? d.full : undefined}
                >
                  {d.short ? (
                    <>
                      <span aria-hidden="true">{d.text}</span>
                      <span className="visually-hidden">{d.spoken}</span>
                    </>
                  ) : (
                    d.text
                  )}
                  {hl ? <span className="visually-hidden"> ({emphasisLabel})</span> : null}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </figure>
  );
}
