import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { FIELD_LABELS, KIND_LABELS, factLabels, searchPresets, type Preset, type PresetKind } from '../lib/library';
import type { FieldName } from '../lib/types';
import { applyPreset } from '../state/actions';
import { IconSearch } from './icons';

const KIND_ORDER: PresetKind[] = ['design', 'matrix', 'sbox', 'circuit'];

const SLOT_TEXT = { matrix: '', external: 'external matrix', internal: 'internal matrix' } as const;

/**
 * Presets matching the query, grouped by kind. Groups follow their best
 * match; without a query, presets of the current field come first.
 */
export function groupedPresets(query: string, field: FieldName): { kind: PresetKind; items: Preset[] }[] {
  const found = searchPresets(query);
  const rank = new Map(found.map((p, i) => [p, i]));
  const byField = (a: Preset, b: Preset) =>
    query.trim() ? 0 : Number(a.field !== field) - Number(b.field !== field);
  return KIND_ORDER.map((kind) => ({
    kind,
    items: found.filter((p) => p.kind === kind).sort((a, b) => byField(a, b) || rank.get(a)! - rank.get(b)!),
  }))
    .filter((g) => g.items.length)
    .sort((a, b) => rank.get(a.items[0]!)! - rank.get(b.items[0]!)! || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}

/**
 * Searchable preset library (ARIA combobox with a grouped listbox). Arrow
 * keys move, Enter loads, Escape closes. Loading replaces the workspace
 * inputs as one undo step.
 */
export function PresetPicker({ field }: { field: FieldName }) {
  const id = useId();
  const listId = `${id}-list`;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const groups = useMemo(() => groupedPresets(query, field), [query, field]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const optionId = (p: Preset) => `${id}-opt-${p.id.replace(/[^a-z0-9-]/gi, '-')}`;
  const current = flat[Math.min(active, flat.length - 1)];

  useEffect(() => {
    if (open && current) document.getElementById(optionId(current))?.scrollIntoView({ block: 'nearest' });
  }, [open, current]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const choose = (p: Preset) => {
    applyPreset(p);
    setOpen(false);
    setQuery('');
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (flat.length ? (a + step + flat.length) % flat.length : 0));
    } else if (e.key === 'PageDown' || e.key === 'PageUp') {
      if (!open) return;
      e.preventDefault();
      setActive((a) => Math.max(0, Math.min(flat.length - 1, a + (e.key === 'PageDown' ? 5 : -5))));
    } else if (e.key === 'Enter') {
      if (open && current) {
        e.preventDefault();
        choose(current);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
      } else if (query) {
        e.preventDefault();
        setQuery('');
        setActive(0);
      }
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  let index = -1;
  return (
    <div className="picker" ref={rootRef}>
      <label className="field-label" htmlFor={`${id}-input`}>
        Presets
      </label>
      <div className="picker-control">
        <IconSearch size={14} />
        <input
          ref={inputRef}
          id={`${id}-input`}
          className="input picker-input"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && current ? optionId(current) : undefined}
          aria-describedby={`${id}-hint`}
          autoComplete="off"
          spellCheck={false}
          data-native-undo=""
          placeholder="AES, circulant, Poseidon2, S-box…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </div>
      <span id={`${id}-hint`} className="visually-hidden">
        Arrow keys choose a preset, Enter loads it into the workspace, Escape closes the list.
      </span>
      {open ? (
        <div className="picker-pop">
          {flat.length ? (
            <ul className="picker-list" role="listbox" id={listId} aria-label="Presets">
              {groups.map((g) => (
                <li key={g.kind} role="presentation">
                  <div className="picker-group" aria-hidden="true">
                    {KIND_LABELS[g.kind]}
                  </div>
                  <ul role="group" aria-label={KIND_LABELS[g.kind]} className="picker-sublist">
                    {g.items.map((p) => {
                      index++;
                      const i = index;
                      const selected = current === p;
                      const facts = factLabels(p);
                      return (
                        <li
                          key={p.id}
                          id={optionId(p)}
                          role="option"
                          aria-selected={selected}
                          className="picker-option"
                          onPointerDown={(e) => e.preventDefault()}
                          onPointerMove={() => (active !== i ? setActive(i) : undefined)}
                          onClick={() => choose(p)}
                        >
                          <span className="picker-label">{p.label}</span>
                          <span className="picker-chips">
                            <span className="chip">{FIELD_LABELS[p.field]}</span>
                            {p.slot && SLOT_TEXT[p.slot] ? <span className="chip">{SLOT_TEXT[p.slot]}</span> : null}
                            {facts.map((f) => (
                              <span key={f} className="chip chip-fact">
                                {f}
                              </span>
                            ))}
                            {p.weak ? <span className="chip chip-weak">weak on purpose</span> : null}
                          </span>
                          <span className="picker-summary">{p.summary}</span>
                          {selected ? <span className="picker-scope">{p.scope}</span> : null}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          ) : (
            <p className="picker-empty" role="status" id={listId}>
              No preset matches “{query}”.
            </p>
          )}
          <p className="picker-foot">
            Dashed chips are browser previews, re-run by the unit tests, not proofs: Check gives evidence. Loading
            replaces the workspace inputs; Undo brings them back.
          </p>
        </div>
      ) : null}
    </div>
  );
}
