import { useMemo } from 'react';
import { matrixDiff, naiveCircuit, type MatrixCellDiff } from '../lib/circuit';
import { targetMatrix } from '../lib/design';
import { displayElement, displayFieldOf, fieldOps, type DisplayField } from '../lib/field';
import type { CandidateDesign, Program, ProgramTarget } from '../lib/types';
import { announce, setProgram } from '../state/actions';
import { getState } from '../state/store';
import { IconCircuit, IconInfo, IconPreview } from './icons';
import { MatrixView } from './MatrixEditor';

/** Short name of the matrix a circuit targets. */
export function targetName(design: CandidateDesign, target: ProgramTarget): string {
  if (design.field === 'gf256') return 'design matrix';
  return target === 'internal' ? 'internal matrix' : 'external matrix';
}

/** A circuit computing the target matrix term by term, or null while the matrix has invalid cells. */
export function circuitFromDesign(design: CandidateDesign, target: ProgramTarget): Program | null {
  // Circuits are offered over GF(2^8) and BN254 only.
  if (design.model === 'hades/prime/v1') return null;
  const m = targetMatrix(design, target);
  const f = fieldOps(design.field);
  if (m.length !== design.width || m.some((row) => row.length !== design.width || row.some((x) => !f.isValid(x)))) {
    return null;
  }
  return naiveCircuit(m, design.field, 'term-by-term');
}

export function generateCircuit(design: CandidateDesign, target: ProgramTarget): void {
  const p = circuitFromDesign(design, target);
  if (!p) return;
  const replacing = getState().program !== null;
  setProgram(p);
  const what = `a term-by-term circuit with ${p.instructions.length} instructions for the ${targetName(design, target)}`;
  announce(
    replacing
      ? `Replaced the circuit with ${what}. Undo brings back the previous circuit.`
      : `Generated ${what}.`,
  );
}

/** The first differing coefficients in words, with long BN254 values shortened. */
export function describeCells(cells: MatrixCellDiff[], field: DisplayField): string {
  const show = (v: string) => displayElement(field, v).text;
  const shown = cells.slice(0, 4).map((c) => `(${c.row + 1}, ${c.col + 1}) needs ${show(c.want)}, gets ${show(c.got)}`);
  return shown.join('; ') + (cells.length > 4 ? `; and ${cells.length - 4} more` : '');
}

/**
 * The circuit's coefficient matrix beside the target, recomputed on every
 * edit, with differing coefficients marked. A browser preview, never a proof.
 */
export function ComputedMatrix({
  design,
  target,
  program,
  onSearch,
  searchLabel,
  searchDisabled,
  searchNote,
}: {
  design: CandidateDesign;
  target: ProgramTarget;
  program: Program;
  onSearch: () => void;
  searchLabel: string;
  searchDisabled: boolean;
  /** Visible reason the search is unavailable or what it will show; also its accessible description. */
  searchNote?: string;
}) {
  const want = targetMatrix(design, target);
  const diff = useMemo(
    () => (program.field === design.field && program.width === design.width ? matrixDiff(want, program) : null),
    [want, program, design.field, design.width],
  );
  const name = targetName(design, target);
  const canGenerate = circuitFromDesign(design, target) !== null;
  const emphasis = diff?.cells.map((c) => `${c.row},${c.col}`) ?? [];
  const total = design.width * design.width;

  return (
    <section className="panel" aria-labelledby="computed-heading">
      <div className="panel-head">
        <h2 id="computed-heading">Computed matrix</h2>
        <span className="status status-preview">
          <IconPreview /> Unchecked preview
        </span>
      </div>
      <div className="stack">
        {diff ? (
          <>
            <div className="row computed-pair" style={{ alignItems: 'flex-start', gap: 24 }}>
              <MatrixView values={want} label={`Target: ${name}`} field={displayFieldOf(design)} emphasis={emphasis} emphasisLabel="the circuit differs here" />
              <MatrixView values={diff.got} label="The circuit computes" field={displayFieldOf(design)} emphasis={emphasis} />
            </div>
            <p className={diff.cells.length ? 'diff-summary diff-summary-bad' : 'diff-summary'} role="status">
              {diff.cells.length === 0 ? (
                <>All {total} coefficients equal the {name}.</>
              ) : (
                <>
                  <strong>
                    {diff.cells.length} of {total} coefficients differ
                  </strong>{' '}
                  (marked ◆): {describeCells(diff.cells, displayFieldOf(design))}.
                </>
              )}
            </p>
          </>
        ) : (
          <p className="muted small">
            {program.field !== design.field
              ? 'The circuit and the design use different fields.'
              : program.width !== design.width
                ? 'The circuit and the design have different widths.'
                : 'Choose every operand and fix the matrix cells to compare the circuit with the design.'}
          </p>
        )}
        <p className="evidence">
          <IconInfo />
          <span>
            Evidence: <strong>Unchecked diagnostic</strong> (symbolic evaluation in this browser). Check the design
            to get the Lean equivalence proof.
          </span>
        </p>
        <div className="row">
          <button
            type="button"
            className="btn btn-sm"
            disabled={!canGenerate}
            aria-describedby={canGenerate ? undefined : 'computed-generate-why'}
            onClick={() => generateCircuit(design, target)}
          >
            <IconCircuit size={14} /> Replace circuit with term-by-term
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={searchDisabled}
            aria-describedby={searchNote ? 'computed-search-why' : undefined}
            onClick={onSearch}
          >
            {searchLabel}
          </button>
        </div>
        {!canGenerate || searchNote ? (
          <ul className="disabled-reasons small muted">
            {!canGenerate ? (
              <li id="computed-generate-why">Fix the matrix cells to generate a circuit from the matrix.</li>
            ) : null}
            {searchNote ? <li id="computed-search-why">{searchNote}</li> : null}
          </ul>
        ) : null}
        <p className="field-hint">
          The term-by-term circuit computes y = M·x directly: a correct baseline, not an optimized one, and it
          replaces the circuit above (Undo brings it back). The quick experiment searches for cheaper equivalent
          circuits and proves each one in Lean.
        </p>
      </div>
    </section>
  );
}
