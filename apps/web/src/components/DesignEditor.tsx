import { useId, useState } from 'react';
import { activityBound, activityFormula, EXPONENT_MAX, ROUNDS_MAX, ROUNDS_MIN, validateDesign } from '../lib/design';
import { aesSbox, formatGfHex, isGfHex } from '../lib/gf256';
import { AES_MIXCOLUMNS, aesDesign, aesSharedSum, hadesDesign, hadesSharedSum } from '../lib/presets';
import { identityMatrix } from '../lib/design';
import type { AesLikeDesign, CandidateDesign, HadesDesign, ProgramTarget } from '../lib/types';
import { loadInputs, setDesign, setTarget } from '../state/actions';
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
  const switchTo = (field: 'gf256' | 'bn254') => {
    if (field === design.field) return;
    if (field === 'gf256') loadInputs({ design: aesDesign(), program: aesSharedSum(), target: 'matrix' });
    else loadInputs({ design: hadesDesign(), program: hadesSharedSum(), target: 'external' });
  };
  return (
    <div className="field">
      <span className="field-label" id="profile-label">
        Profile
      </span>
      <div className="segmented" role="radiogroup" aria-labelledby="profile-label">
        <button type="button" role="radio" aria-checked={design.field === 'gf256'} onClick={() => switchTo('gf256')}>
          AES-like, GF(2⁸)
        </button>
        <button type="button" role="radio" aria-checked={design.field === 'bn254'} onClick={() => switchTo('bn254')}>
          HADES, BN254
        </button>
      </div>
    </div>
  );
}

function AesFields({ design }: { design: AesLikeDesign }) {
  const id = useId();
  const [tableText, setTableText] = useState('');
  const [tableError, setTableError] = useState<string | null>(null);
  const update = (patch: Partial<AesLikeDesign>) => setDesign({ ...design, ...patch });
  const issues = validateDesign(design);
  const roundsInvalid = issues.some((i) => i.path === '/rounds');
  const distinct = new Set(design.offsets).size === design.offsets.length;

  return (
    <div className="stack-lg">
      <div className="stack">
        <MatrixEditor
          id={`${id}-matrix`}
          label="MixColumns matrix M (y = M·x)"
          field="gf256"
          values={design.matrix}
          onChange={(matrix) => update({ matrix })}
        />
        <div className="row">
          <span className="small muted">Load:</span>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => update({ matrix: AES_MIXCOLUMNS.map((r) => [...r]) })}
          >
            AES MixColumns
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              const m = AES_MIXCOLUMNS.map((r) => [...r]);
              m[0] = ['04', '06', '02', '02'];
              update({ matrix: m });
            }}
          >
            Row-scaled AES
          </button>
          <button type="button" className="btn btn-sm" onClick={() => update({ matrix: identityMatrix(4, 'gf256') })}>
            Identity
          </button>
        </div>
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
                {[0, 1, 2, 3].map((v) => (
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
            ? 'All four offsets differ, so each column spreads over all four columns.'
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
            : `If M is MDS and the offsets differ: at least ${activityBound(design.rounds)} active S-boxes (${activityFormula(design.rounds)}).`}
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

function HadesFields({ design, target }: { design: HadesDesign; target: ProgramTarget }) {
  const id = useId();
  const update = (patch: Partial<HadesDesign>) => setDesign({ ...design, ...patch });
  const issues = validateDesign(design);
  const has = (p: string) => issues.find((i) => i.path === p)?.message;
  return (
    <div className="stack-lg">
      <MatrixEditor
        id={`${id}-ext`}
        label="External matrix (full rounds)"
        field="bn254"
        values={design.external}
        onChange={(external) => update({ external })}
      />
      <MatrixEditor
        id={`${id}-int`}
        label="Internal matrix (partial rounds)"
        field="bn254"
        values={design.internal}
        onChange={(internal) => update({ internal })}
      />
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
      <div className="row" style={{ alignItems: 'flex-start', gap: 24 }}>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-exp`}>
            S-box exponent e (x ↦ xᵉ)
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
          {design.partialMask.map((on, i) => (
            <label key={i} className="row small" style={{ gap: 6 }}>
              <input
                type="checkbox"
                checked={on}
                onChange={(e) =>
                  update({ partialMask: design.partialMask.map((x, j) => (j === i ? e.target.checked : x)) })
                }
              />
              x{i}
            </label>
          ))}
        </div>
        <span className="field-hint">
          Round constants:{' '}
          {design.constants.kind === 'reference'
            ? 'reference constants'
            : `${design.constants.values.length} explicit rows`}{' '}
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
