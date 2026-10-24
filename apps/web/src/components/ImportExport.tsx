import { useId, useRef, useState } from 'react';
import { normalizeDesign, normalizeProgram, type WorkspaceInputs } from '../lib/canonical';
import { downloadJson } from '../lib/download';
import { parseImport } from '../lib/importer';
import { getState } from '../state/store';
import { loadInputs } from '../state/actions';
import { exportRequest } from './ResultsPanel';
import { IconDownload, IconUpload, IconWarning } from './icons';

function safe<T>(f: () => T, fallback: T): T {
  try {
    return f();
  } catch {
    return fallback;
  }
}

export function ImportExport({ inputs }: { inputs: WorkspaceInputs }) {
  const id = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const apply = (source: string) => {
    setMessage(null);
    try {
      const imported = parseImport(source);
      const s = getState();
      const design = imported.design ?? s.design;
      const program = imported.program === undefined ? s.program : imported.program;
      loadInputs({ design, program, target: imported.target });
      setError(null);
      setMessage(
        `Imported ${[imported.design ? 'design' : null, imported.program ? 'circuit' : null].filter(Boolean).join(' and ') || 'request'}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.');
    }
  };

  return (
    <section className="panel" aria-labelledby={`${id}-h`}>
      <div className="panel-head">
        <h2 id={`${id}-h`}>Import and export</h2>
        <span className="panel-sub">JSON in the public request format</span>
      </div>
      <div className="stack">
        <div className="row">
          <button type="button" className="btn btn-sm" onClick={() => exportRequest(inputs)}>
            <IconDownload size={14} /> Request (design + circuit)
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() =>
              downloadJson(
                'cryptificate-design.json',
                safe(() => normalizeDesign(inputs.design), inputs.design),
              )
            }
          >
            <IconDownload size={14} /> Design
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={!inputs.program}
            onClick={() =>
              inputs.program &&
              downloadJson(
                `${inputs.program.name ?? 'circuit'}.json`,
                safe(() => normalizeProgram(inputs.program!), inputs.program),
              )
            }
          >
            <IconDownload size={14} /> Circuit
          </button>
        </div>
        <details>
          <summary className="small">Import JSON</summary>
          <div className="stack" style={{ marginTop: 8, gap: 8 }}>
            <label className="field-hint" htmlFor={`${id}-text`}>
              Paste a request ({'{'}"design", "program"{'}'}), a design, or a circuit.
            </label>
            <textarea
              id={`${id}-text`}
              className="textarea"
              rows={6}
              value={text}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${id}-err` : undefined}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="row">
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={!text.trim()}
                onClick={() => apply(text)}
              >
                Load into workspace
              </button>
              <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}>
                <IconUpload size={14} /> Choose file…
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const content = await file.text();
                  setText(content);
                  apply(content);
                  e.target.value = '';
                }}
              />
            </div>
            {error ? (
              <p id={`${id}-err`} className="error-text" role="alert">
                <IconWarning /> {error}
              </p>
            ) : null}
            {message ? (
              <p className="small" role="status">
                {message}
              </p>
            ) : null}
          </div>
        </details>
      </div>
    </section>
  );
}
