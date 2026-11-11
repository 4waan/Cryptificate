import { useId, useState } from 'react';
import { activityBound, activityFormula, EXPONENT_MAX, ROUNDS_MAX, ROUNDS_MIN, validateDesign } from '../lib/design';
import { aesSbox, formatGfHex, isGfHex } from '../lib/gf256';
import {
  aesDesign,
  aesSharedSum,
  hadesDesign,
  hadesSharedSum,
  PLONKY3_COMMIT,
  PLONKY3_PRESETS,
  plonky3Design,
  primeDesign,
  primeDesign3,
  primeDesignWide,
} from '../lib/presets';
import { displayFieldOf } from '../lib/field';
import { modulusOf, PRIME_FIELD_PRESETS, primeFieldLabel } from '../lib/primefield';
import { PRIME_MINOR_WIDTH, PRIME_WIDTHS } from '../lib/types';
import type { AesLikeDesign, CandidateDesign, HadesDesign, HadesPrimeDesign, PrimeFieldName, ProgramTarget } from '../lib/types';
import { AES_WIDTHS, isExperimentalWidth, matrixLabel, resizeAesDesign, type AesWidth } from '../lib/width';
import { announce, loadInputs, setDesign, setTarget } from '../state/actions';
import { getState } from '../state/store';
import { MatrixEditor } from './MatrixEditor';
import { IconWarning } from './icons';

export function parseSboxTable(text: string): { table: string[] | null; error: string | null } {
  const tokens = text
    .split(/[\s,;[\]"']+/)
    .map((t) => t.replace(/^0x/i, ''))
    .filter(Boolean);
  if (tokens.length !== 256)
    return { table: null, error: `Found ${tokens.length} entries; a table needs exactly 256.` };
  const bad = tokens.findIndex((t) => !isGfHex(t.padStart(2, '0')) || t.length > 2);
  if (bad >= 0) return { table: null, error: `Entry ${bad} (“${tokens[bad]}”) is not a hex byte.` };
  return { table: tokens.map((t) => t.padStart(2, '0').toUpperCase()), error: null };
}

function ProfileSwitch({ design }: { design: CandidateDesign }) {
  const switchTo = (model: CandidateDesign['model']) => {
    if (model === design.model) return;
    if (model === 'aes-like/gf256/v1') loadInputs({ design: aesDesign(), program: aesSharedSum(), target: 'matrix' });
    else if (model === 'hades/bn254/v1') loadInputs({ design: hadesDesign(), program: hadesSharedSum(), target: 'external' });
    // Circuits, the search and native timing cover GF(2^8) and BN254 only.
    else loadInputs({ design: primeDesign('koalabear'), program: null, target: 'external' });
  };
  return (
    <div className="field">
      <span className="field-label" id="profile-label">
        Profile
      </span>
      <div className="segmented" role="radiogroup" aria-labelledby="profile-label">
        <button
          type="button"
          role="radio"
          aria-checked={design.model === 'aes-like/gf256/v1'}
          onClick={() => switchTo('aes-like/gf256/v1')}
        >
          AES-like, GF(2⁸)
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={design.model === 'hades/bn254/v1'}
          onClick={() => switchTo('hades/bn254/v1')}
        >
          HADES, BN254
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={design.model === 'hades/prime/v1'}
          onClick={() => switchTo('hades/prime/v1')}
        >
          HADES, 64-bit prime
        </button>
      </div>
    </div>
  );
}

/**
 * The field and width of a prime-field design: a named field or a custom
 * prime below 2^64, and one of the Poseidon2 widths 2, 3, 4, 8, 12, 16 and
 * 24. Changing the field keeps the matrices (entries must stay below the new
 * modulus); changing the width loads the matrices of that width. The
 * Plonky3 instances of the current field load with their rounds and S-box.
 */
function PrimeFieldPicker({ design }: { design: HadesPrimeDesign }) {
  const id = useId();
  const issues = validateDesign(design);
  const modulusIssue = issues.find((i) => i.path === '/modulus')?.message;
  const p = modulusOf(design);
  const preset = PRIME_FIELD_PRESETS.find((f) => f.id === design.field);
  const plonky3 = PLONKY3_PRESETS.filter((x) => x.field === design.field);
  const pick = (field: PrimeFieldName) => {
    if (field === design.field) return;
    const { modulus: _old, ...rest } = design;
    void _old;
    setDesign(field === 'prime' ? { ...rest, field, modulus: design.modulus ?? p?.toString() ?? '' } : { ...rest, field });
  };
  return (
    <div className="stack">
      <div className="field">
        <span className="field-label" id={`${id}-field`}>
          Prime field
        </span>
        <div className="segmented" role="radiogroup" aria-labelledby={`${id}-field`}>
          {PRIME_FIELD_PRESETS.map((f) => (
            <button key={f.id} type="button" role="radio" aria-checked={design.field === f.id} onClick={() => pick(f.id)}>
              {f.label}
            </button>
          ))}
          <button type="button" role="radio" aria-checked={design.field === 'prime'} onClick={() => pick('prime')}>
            Custom prime
          </button>
        </div>
        {preset ? (
          <span className="field-hint">
            <span className="mono">p = {preset.modulus}</span> = {preset.form}; p − 1 = {preset.pMinusOne}. x ↦ xᵉ
            is a permutation exactly when e shares no factor with p − 1.
          </span>
        ) : null}
      </div>
      {design.field === 'prime' ? (
        <div className="field">
          <label className="field-label" htmlFor={`${id}-modulus`}>
            Modulus p (a prime below 2⁶⁴)
          </label>
          <input
            id={`${id}-modulus`}
            className="input mono"
            inputMode="numeric"
            spellCheck={false}
            autoComplete="off"
            maxLength={20}
            style={{ width: 260 }}
            value={design.modulus ?? ''}
            aria-invalid={Boolean(modulusIssue)}
            aria-describedby={`${id}-modulus-hint`}
            onChange={(e) => setDesign({ ...design, modulus: e.target.value.trim() })}
          />
          <span id={`${id}-modulus-hint`} className={modulusIssue ? 'error-text' : 'field-hint'}>
            {modulusIssue ??
              'Prime by the Miller-Rabin test the engine also uses. Every report proves it prime in Lean from a Pratt certificate (claim field.prime).'}
          </span>
        </div>
      ) : null}
      <div className="field">
        <span className="field-label" id={`${id}-width`}>
          Width
        </span>
        <div className="segmented" role="radiogroup" aria-labelledby={`${id}-width`}>
          {(PRIME_WIDTHS as readonly HadesPrimeDesign['width'][]).map((w) => (
            <button
              key={w}
              type="button"
              role="radio"
              aria-checked={design.width === w}
              onClick={() => {
                if (w === design.width) return;
                const base =
                  w === 3
                    ? primeDesign3(design.field, design.modulus)
                    : w === 4
                      ? primeDesign(design.field, design.modulus)
                      : primeDesignWide(design.field, w, design.modulus);
                setDesign({ ...base, sbox: design.sbox, fullRounds: design.fullRounds, partialRounds: design.partialRounds });
              }}
            >
              t = {w}
            </button>
          ))}
        </div>
        <span className="field-hint">
          {design.width > PRIME_MINOR_WIDTH
            ? `Above width ${PRIME_MINOR_WIDTH} the external matrix's minors are not enumerated: the report checks whether it is circ(2 M4, M4, …, M4) with M4 MDS and whether it is invertible, refutes the MDS property with a singular 2 × 2 submatrix when there is one, and does not state the full-round activity bounds. `
            : ''}
          Circuits, the circuit search and native timing are not offered for {primeFieldLabel(design.field)}: only the
          design claims are checked.
        </span>
      </div>
      {plonky3.length > 0 && p !== null ? (
        <div className="field">
          <span className="field-label">Plonky3 instances</span>
          <div className="row">
            {plonky3.map((x) => (
              <button key={x.width} type="button" className="btn btn-sm" onClick={() => setDesign(plonky3Design(x, p))}>
                {preset?.label} t = {x.width}
              </button>
            ))}
          </div>
          <span className="field-hint">
            The internal diagonal, round numbers and S-box of Plonky3&apos;s Poseidon2 ({plonky3[0]!.source} at commit{' '}
            <span className="mono">{PLONKY3_COMMIT.slice(0, 12)}</span>) with its external matrix circ(2 M4, M4, …,
            M4). Round constants are not loaded, so constants.grain is not established until they are added (cryptificate import reads Plonky3's arrays).
          </span>
        </div>
      ) : null}
    </div>
  );
}

const WIDTH_WORDS: Record<number, string> = { 2: 'two', 3: 'three', 4: 'four' };

function WidthSwitch({ design }: { design: AesLikeDesign }) {
  const id = useId();
  const choose = (w: AesWidth) => {
    if (w === design.width) return;
    const s = getState();
    loadInputs({ ...resizeAesDesign(design, s.program, w), target: 'matrix' });
    announce(
      `Width ${w}${isExperimentalWidth(w) ? ', experimental' : ''}: loaded ${matrixLabel(w)} with offsets 0 to ${w - 1}${
        s.program ? ' and a term-by-term circuit' : ''
      }. Undo restores the previous inputs.`,
    );
  };
  const experimental = isExperimentalWidth(design.width);
  return (
    <div className="field">
      <span className="field-label" id={`${id}-width`}>
        State width
      </span>
      <div
        className="segmented"
        role="radiogroup"
        aria-labelledby={`${id}-width`}
        aria-describedby={`${id}-width-hint`}
        onKeyDown={(e) => {
          const i = AES_WIDTHS.indexOf(design.width as AesWidth);
          const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
          if (!step || i < 0) return;
          e.preventDefault();
          const group = e.currentTarget;
          const next = AES_WIDTHS[(i + step + AES_WIDTHS.length) % AES_WIDTHS.length]!;
          choose(next);
          window.requestAnimationFrame(() =>
            (group.querySelector(`[data-width="${next}"]`) as HTMLElement | null)?.focus(),
          );
        }}
      >
        {AES_WIDTHS.map((w) => (
          <button
            key={w}
            type="button"
            role="radio"
            data-width={w}
            aria-checked={design.width === w}
            tabIndex={design.width === w ? 0 : -1}
            onClick={() => choose(w)}
          >
            {w}×{w}
            {isExperimentalWidth(w) ? <span className="seg-tag">experimental</span> : null}
          </button>
        ))}
      </div>
      <span id={`${id}-width-hint`} className="field-hint">
        {experimental
          ? `Experimental: requests carry "experimental": true. No certificate template covers this width, so no Lean claim is established (out of scope); only native correctness of a circuit is tested, and the instant checks stay an unchecked browser preview.`
          : 'AES uses width 4; 3×3 and 2×2 are experimental. Changing the width loads a new matrix and a matching circuit (Undo restores).'}
      </span>
    </div>
  );
}

function AesFields({ design }: { design: AesLikeDesign }) {
  const id = useId();
  const [tableText, setTableText] = useState('');
  const [tableError, setTableError] = useState<string | null>(null);
  const update = (patch: Partial<AesLikeDesign>, group: string | null = `design:${Object.keys(patch).join(',')}`) =>
    setDesign({ ...design, ...patch }, { group });
  const issues = validateDesign(design);
  const roundsInvalid = issues.some((i) => i.path === '/rounds');
  const distinct = new Set(design.offsets).size === design.offsets.length;

  return (
    <div className="stack-lg">
      <WidthSwitch design={design} />
      <div className="stack">
        <MatrixEditor
          id={`${id}-matrix`}
          label="MixColumns matrix M (y = M·x)"
          field="gf256"
          values={design.matrix}
          exportName="M"
          onChange={(matrix, cell) => update({ matrix }, cell ? `design:matrix:${cell}` : null)}
        />
        <p className="field-hint">
          More matrices, from AES InvMixColumns to circulants that are not MDS, are in the Presets search above.
        </p>
      </div>

      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field-label">Row offsets (ShiftRows)</legend>
        <div className="row">
          {design.offsets.map((o, r) => (
            <label key={r} className="row small" style={{ gap: 6 }}>
              <span className="muted">Row {r}</span>
              <select
                className="select mono"
                value={o}
                aria-label={`Row ${r} offset`}
                onChange={(e) =>
                  update({ offsets: design.offsets.map((x, i) => (i === r ? Number(e.target.value) : x)) })
                }
              >
                {Array.from({ length: design.width }, (_, v) => v).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <span className="field-hint">
          {distinct
            ? `All ${WIDTH_WORDS[design.width] ?? design.width} offsets differ, so each column spreads over all ${WIDTH_WORDS[design.width] ?? design.width} columns.`
            : 'Two rows share an offset: the activity bound will not be established.'}
        </span>
      </fieldset>

      <div className="field">
        <label className="field-label" htmlFor={`${id}-rounds`}>
          Rounds
        </label>
        <div className="row">
          <input
            id={`${id}-rounds`}
            className="input mono"
            type="number"
            min={ROUNDS_MIN}
            max={ROUNDS_MAX}
            style={{ width: 90 }}
            value={Number.isFinite(design.rounds) ? design.rounds : ''}
            aria-invalid={roundsInvalid}
            aria-describedby={`${id}-rounds-hint`}
            onChange={(e) => update({ rounds: e.target.value === '' ? NaN : Number(e.target.value) })}
          />
          <input
            type="range"
            min={ROUNDS_MIN}
            max={ROUNDS_MAX}
            value={Number.isFinite(design.rounds) ? design.rounds : ROUNDS_MIN}
            aria-label="Rounds slider"
            onChange={(e) => update({ rounds: Number(e.target.value) })}
            style={{ flex: 1, minWidth: 120, accentColor: 'var(--accent)' }}
          />
        </div>
        <span id={`${id}-rounds-hint`} className={roundsInvalid ? 'error-text' : 'field-hint'}>
          {roundsInvalid
            ? `Choose ${ROUNDS_MIN} to ${ROUNDS_MAX} rounds.`
            : design.width === 4
              ? `If M is MDS and the offsets differ: at least ${activityBound(design.rounds)} active S-boxes (${activityFormula(design.rounds)}).`
              : `The active S-box bound is stated for width 4; at width ${design.width} it is not established by this method.`}
        </span>
      </div>

      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field-label">S-box</legend>
        <div className="segmented" role="radiogroup" aria-label="S-box">
          <button
            type="button"
            role="radio"
            aria-checked={design.sbox.kind === 'aes'}
            onClick={() => update({ sbox: { kind: 'aes' } })}
          >
            AES S-box
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={design.sbox.kind === 'table'}
            onClick={() => {
              const table = design.sbox.kind === 'table' ? design.sbox.table : aesSbox().map(formatGfHex);
              setTableText(table.join(' '));
              update({ sbox: { kind: 'table', table } });
            }}
          >
            Custom table
          </button>
        </div>
        {design.sbox.kind === 'table' ? (
          <div className="stack" style={{ gap: 6, marginTop: 8 }}>
            <label className="field-hint" htmlFor={`${id}-sbox`}>
              256 hex bytes, S(00) first, separated by spaces or commas (a JSON array also works).
            </label>
            <textarea
              id={`${id}-sbox`}
              className="textarea"
              rows={5}
              value={tableText || design.sbox.table.join(' ')}
              aria-invalid={Boolean(tableError)}
              onChange={(e) => {
                setTableText(e.target.value);
                setTableError(null);
              }}
            />
            <div className="row">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  const { table, error } = parseSboxTable(
                    tableText || (design.sbox.kind === 'table' ? design.sbox.table.join(' ') : ''),
                  );
                  setTableError(error);
                  if (table) update({ sbox: { kind: 'table', table } });
                }}
              >
                Apply table
              </button>
              <span className="small muted">{design.sbox.table.length} entries in use</span>
            </div>
            {tableError ? (
              <p className="error-text" role="alert">
                <IconWarning /> {tableError}
              </p>
            ) : null}
          </div>
        ) : null}
      </fieldset>
    </div>
  );
}

function HadesFields({ design, target }: { design: HadesDesign | HadesPrimeDesign; target: ProgramTarget }) {
  const id = useId();
  const update = (patch: Partial<HadesDesign> & Partial<HadesPrimeDesign>, group: string | null = `design:${Object.keys(patch).join(',')}`) =>
    setDesign({ ...design, ...patch } as CandidateDesign, { group });
  const issues = validateDesign(design);
  const has = (p: string) => issues.find((i) => i.path === p)?.message;
  const field = displayFieldOf(design);
  const mask = design.partialMask ?? Array.from({ length: design.width }, (_, i) => i === 0);
  const constants = design.constants ?? { kind: 'unspecified' as const };
  return (
    <div className="stack-lg">
      {design.model === 'hades/prime/v1' ? <PrimeFieldPicker design={design} /> : null}
      <MatrixEditor
        id={`${id}-ext`}
        label="External matrix (full rounds)"
        field={field}
        values={design.external}
        exportName="M_E"
        onChange={(external, cell) => update({ external }, cell ? `design:external:${cell}` : null)}
      />
      <MatrixEditor
        id={`${id}-int`}
        label="Internal matrix (partial rounds)"
        field={field}
        values={design.internal}
        exportName="M_I"
        onChange={(internal, cell) => update({ internal }, cell ? `design:internal:${cell}` : null)}
      />
      {design.model === 'hades/bn254/v1' ? (
        <div className="field">
          <span className="field-label" id={`${id}-target`}>
            The circuit implements
          </span>
          <div className="segmented" role="radiogroup" aria-labelledby={`${id}-target`}>
            {(['external', 'internal'] as const).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={target === t} onClick={() => setTarget(t)}>
                {t === 'external' ? 'External matrix' : 'Internal matrix'}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="row" style={{ alignItems: 'flex-start', gap: 24 }}>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-exp`}>
            S-box exponent <span className="case">e (x ↦ xᵉ)</span>
          </label>
          <div className="row">
            <input
              id={`${id}-exp`}
              className="input mono"
              type="number"
              min={1}
              max={EXPONENT_MAX}
              style={{ width: 100 }}
              value={Number.isFinite(design.sbox.exponent) ? design.sbox.exponent : ''}
              aria-invalid={Boolean(has('/sbox/exponent'))}
              onChange={(e) =>
                update({ sbox: { kind: 'power', exponent: e.target.value === '' ? NaN : Number(e.target.value) } })
              }
            />
            {[3, 5, 7].map((e) => (
              <button
                key={e}
                type="button"
                className="btn btn-sm"
                aria-pressed={design.sbox.exponent === e}
                onClick={() => update({ sbox: { kind: 'power', exponent: e } })}
              >
                {e}
              </button>
            ))}
          </div>
          {has('/sbox/exponent') ? <span className="error-text">{has('/sbox/exponent')}</span> : null}
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-full`}>
            Full rounds
          </label>
          <input
            id={`${id}-full`}
            className="input mono"
            type="number"
            min={2}
            step={2}
            style={{ width: 90 }}
            value={Number.isFinite(design.fullRounds) ? design.fullRounds : ''}
            aria-invalid={Boolean(has('/fullRounds'))}
            onChange={(e) => update({ fullRounds: e.target.value === '' ? NaN : Number(e.target.value) })}
          />
          {has('/fullRounds') ? <span className="error-text">{has('/fullRounds')}</span> : null}
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-partial`}>
            Partial rounds
          </label>
          <input
            id={`${id}-partial`}
            className="input mono"
            type="number"
            min={0}
            style={{ width: 90 }}
            value={Number.isFinite(design.partialRounds) ? design.partialRounds : ''}
            aria-invalid={Boolean(has('/partialRounds'))}
            onChange={(e) => update({ partialRounds: e.target.value === '' ? NaN : Number(e.target.value) })}
          />
          {has('/partialRounds') ? <span className="error-text">{has('/partialRounds')}</span> : null}
        </div>
      </div>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field-label">S-boxes in partial rounds</legend>
        <div className="row">
          {mask.map((on, i) => (
            <label key={i} className="row small" style={{ gap: 6 }}>
              <input
                type="checkbox"
                checked={on}
                onChange={(e) => update({ partialMask: mask.map((x, j) => (j === i ? e.target.checked : x)) })}
              />
              x{i}
            </label>
          ))}
        </div>
        <span className="field-hint">
          Round constants:{' '}
          {constants.kind === 'reference'
            ? 'reference constants'
            : constants.kind === 'unspecified'
              ? 'unspecified (every claim holds for all round constants)'
              : `${constants.values.length} explicit rows`}{' '}
          (import JSON to change).
        </span>
      </fieldset>
    </div>
  );
}

export function DesignEditor({ design, target }: { design: CandidateDesign; target: ProgramTarget }) {
  return (
    <section className="panel" aria-labelledby="design-heading">
      <div className="panel-head">
        <h2 id="design-heading">Design</h2>
        <span className="panel-sub">{design.model}</span>
      </div>
      <div className="stack-lg">
        <ProfileSwitch design={design} />
        {design.model === 'aes-like/gf256/v1' ? (
          <AesFields design={design} />
        ) : (
          <HadesFields design={design} target={target} />
        )}
      </div>
    </section>
  );
}
