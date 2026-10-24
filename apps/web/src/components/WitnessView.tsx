import { describeWitness, formatElement, witnessHeading } from '../lib/witness';
import type { FieldName, Witness } from '../lib/types';

interface CellsProps {
  field: FieldName;
  values: readonly string[];
  highlight?: readonly number[];
  highlightLabel?: string;
  /** "bad" marks a disagreement; "accent" marks entries that count, such as nonzero ones. */
  tone?: 'bad' | 'accent';
  prefix: string;
}

/** A vector of field elements: uppercase hex bytes or decimals, with optional highlighted coordinates. */
export function Cells({ field, values, highlight = [], highlightLabel = 'differs', tone = 'bad', prefix }: CellsProps) {
  return (
    <span className="bytes" role="list">
      {values.map((v, i) => {
        const hl = highlight.includes(i);
        return (
          <span
            key={i}
            role="listitem"
            className={`byte${field === 'bn254' ? ' decimal' : ''}${hl ? (tone === 'bad' ? ' byte-hl' : ' byte-nz') : ''}`}
            data-highlight={hl ? 'true' : undefined}
          >
            <span className="byte-index" aria-hidden="true">
              {prefix}
              {i}
            </span>
            <span className="visually-hidden">{`${prefix}${i} = `}</span>
            {formatElement(field, v)}
            {hl ? <span className="visually-hidden">{` (${highlightLabel})`}</span> : null}
          </span>
        );
      })}
    </span>
  );
}

function nonzero(values: readonly string[]): number[] {
  return values.map((v, i) => (/^0+$/.test(v) ? -1 : i)).filter((i) => i >= 0);
}

export function WitnessView({
  witness,
  field,
  preview = false,
  unchecked = false,
}: {
  witness: Witness;
  field: FieldName;
  preview?: boolean;
  /** Found by an unchecked engine diagnostic, not by a checked certificate. */
  unchecked?: boolean;
}) {
  const suffix = preview ? ' (computed in the browser)' : unchecked ? ' (engine diagnostic)' : '';
  const heading = `${witnessHeading(witness)}${suffix}`;
  return (
    <figure className="witness" style={{ margin: 0 }} aria-label={heading}>
      <figcaption className="witness-label">{heading}</figcaption>
      <WitnessBody witness={witness} field={field} />
      <p className="witness-sentence">{describeWitness(witness, field)}</p>
    </figure>
  );
}

function WitnessBody({ witness: w, field }: { witness: Witness; field: FieldName }) {
  switch (w.kind) {
    case 'distinguishing-input':
      return (
        <div className="witness-rows">
          <span className="witness-label">Input</span>
          <Cells field={field} values={w.input} prefix="x" />
          <span className="witness-label">Design gives</span>
          <Cells field={field} values={w.expected} highlight={w.differing} prefix="y" />
          <span className="witness-label">Circuit gives</span>
          <Cells field={field} values={w.actual} highlight={w.differing} prefix="y" />
        </div>
      );
    case 'branch':
      return (
        <div className="witness-rows">
          <span className="witness-label">Input x (weight {w.inputWeight})</span>
          <Cells
            field={field}
            values={w.input}
            highlight={nonzero(w.input)}
            highlightLabel="nonzero"
            tone="accent"
            prefix="x"
          />
          <span className="witness-label">Image M·x (weight {w.outputWeight})</span>
          <Cells
            field={field}
            values={w.output}
            highlight={nonzero(w.output)}
            highlightLabel="nonzero"
            tone="accent"
            prefix="y"
          />
          <span className="witness-label">Total</span>
          <span className="mono">
            {w.inputWeight} + {w.outputWeight} = {w.inputWeight + w.outputWeight} &lt; {w.bound}
          </span>
        </div>
      );
    case 'offset-collision':
      return (
        <div className="witness-rows">
          {w.rows.map((r) => (
            <span key={r} style={{ display: 'contents' }}>
              <span className="witness-label">Row {r}</span>
              <span className="mono">shift by {w.offset}</span>
            </span>
          ))}
        </div>
      );
    case 'sbox-collision':
      return (
        <div className="witness-rows">
          <span className="witness-label">Inputs</span>
          <Cells field="gf256" values={[w.x1, w.x2]} prefix="x" />
          <span className="witness-label">Shared output</span>
          <Cells field="gf256" values={[w.y]} highlight={[0]} highlightLabel="collision" prefix="S" />
        </div>
      );
    case 'power-collision':
      return (
        <div className="witness-rows">
          <span className="witness-label">x₁</span>
          <span className="mono" style={{ wordBreak: 'break-all' }}>
            {w.x1}
          </span>
          <span className="witness-label">x₂ = ω</span>
          <span className="mono" style={{ wordBreak: 'break-all' }}>
            {w.x2}
          </span>
          <span className="witness-label">Map</span>
          <span className="mono">
            x ↦ x^{w.exponent}, {w.note.replace(/omega/g, 'ω')}
          </span>
        </div>
      );
  }
}
