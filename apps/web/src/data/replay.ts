import { isStale, type WorkspaceInputs } from '../lib/canonical';
import type { AnalysisReport, ExperimentReport, JobKind, Report } from '../lib/types';

/**
 * Recorded runs for replay mode. `recorded/index.json` lists genuine runs
 * produced by the local service; each entry points at its report and,
 * optionally, its evidence bundle. Nothing here runs Lean or benchmarks.
 *
 * {
 *   "version": 1,
 *   "entries": [
 *     { "id": "beat-the-reference", "kind": "experiment", "title": "…",
 *       "story": 1, "report": "beat-the-reference/report.json",
 *       "bundle": "beat-the-reference/bundle.tar.gz" }
 *   ]
 * }
 */

export interface RecordedEntry {
  id: string;
  kind: JobKind;
  title?: string;
  story?: number;
  report: string;
  bundle?: string;
}

export interface RecordedIndex {
  version: number;
  entries: RecordedEntry[];
}

const base = import.meta.env.BASE_URL ?? './';
const root = `${base}recorded/`;

let indexPromise: Promise<RecordedIndex> | null = null;
const reportCache = new Map<string, Promise<Report | null>>();

export function recordedUrl(path: string): string {
  return `${root}${path.replace(/^\/+/, '')}`;
}

export function loadIndex(): Promise<RecordedIndex> {
  if (!indexPromise) {
    indexPromise = fetch(recordedUrl('index.json'))
      .then((r) => (r.ok ? (r.json() as Promise<RecordedIndex>) : { version: 1, entries: [] }))
      .then((idx) => ({ version: idx.version ?? 1, entries: Array.isArray(idx.entries) ? idx.entries : [] }))
      .catch(() => ({ version: 1, entries: [] }));
  }
  return indexPromise;
}

export function loadRecordedReport(entry: RecordedEntry): Promise<Report | null> {
  let p = reportCache.get(entry.report);
  if (!p) {
    p = fetch(recordedUrl(entry.report))
      .then((r) => (r.ok ? (r.json() as Promise<Report>) : null))
      .catch(() => null);
    reportCache.set(entry.report, p);
  }
  return p;
}

export function reportInputs(report: Report): WorkspaceInputs | null {
  if (report.kind === 'analysis') {
    const r = report as AnalysisReport;
    return r.inputs ? { design: r.inputs.design, program: r.inputs.program ?? null, target: r.inputs.target } : null;
  }
  const e = report as ExperimentReport;
  return e.inputs ? { design: e.inputs.design, program: e.inputs.program ?? null } : null;
}

export interface RecordingMatch {
  entry: RecordedEntry;
  report: Report;
}

/** Finds a recorded run of `kind` whose inputs equal `inputs` (by canonical digest). */
export async function findRecording(kind: JobKind, inputs: WorkspaceInputs): Promise<RecordingMatch | null> {
  const index = await loadIndex();
  for (const entry of index.entries.filter((e) => e.kind === kind)) {
    const report = await loadRecordedReport(entry);
    if (!report) continue;
    const recorded = reportInputs(report);
    if (recorded && !isStale(inputs, recorded)) return { entry, report };
  }
  return null;
}
