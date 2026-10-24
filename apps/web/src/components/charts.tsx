import { useLayoutEffect, useRef, useState } from 'react';
import { formatNumber, niceTicks, samplesPerColumn, summarize } from '../lib/stats';
import type { Comparison, Workload } from '../lib/types';

/** Width of an element, kept current with ResizeObserver. */
function useWidth<T extends HTMLElement>(fallback = 640): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(Math.max(280, el.clientWidth || fallback));
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.floor(entry!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, width];
}

interface Tip {
  x: number;
  y: number;
  value: string;
  label: string;
}

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div className="chart-tip" style={{ left: tip.x + 12, top: tip.y - 8 }} role="presentation">
      <strong>{tip.value}</strong>
      <span className="muted">{tip.label}</span>
    </div>
  );
}

export interface VariantSeries {
  /** Candidate id, e.g. "c3" or "baseline-known". */
  id: string;
  label: string;
  emphasis: boolean;
  workload: Workload;
}

const LABEL_W = 150;
const ROW = 34;
const PAD_T = 12;
const AXIS_H = 34;
const PAD_R = 20;

/**
 * Strip plot for one workload: every raw sample as a dot, the median as a
 * tick and the interquartile range as a band, one row per variant. The
 * variant under study is in the accent colour, references in grey.
 */
export function MeasurementChart({ title, series }: { title: string; series: VariantSeries[] }) {
  const [ref, width] = useWidth<HTMLElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const [table, setTable] = useState(false);
  const rows = series.map((s) => {
    const values = samplesPerColumn(s.workload);
    return { ...s, values, sum: summarize(values) };
  });
  const all = rows.flatMap((r) => r.values);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const ticks = niceTicks(
    lo - (hi - lo) * 0.05,
    hi + (hi - lo) * 0.05,
    Math.max(3, Math.floor((width - LABEL_W) / 90)),
  );
  const x0 = ticks[0] ?? lo;
  const x1 = ticks[ticks.length - 1] ?? hi;
  const plotW = width - LABEL_W - PAD_R;
  const sx = (v: number) => LABEL_W + ((v - x0) / (x1 - x0 || 1)) * plotW;
  const height = PAD_T + rows.length * ROW + AXIS_H;
  const id = `mc-${title.replace(/\W+/g, '-')}`;

  return (
    <figure ref={ref} className="stack" style={{ margin: 0, gap: 8 }} aria-labelledby={`${id}-cap`}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <figcaption id={`${id}-cap`} className="field-label">
          {title}: nanoseconds per column (lower is faster)
        </figcaption>
        <button type="button" className="btn btn-sm" aria-pressed={table} onClick={() => setTable((t) => !t)}>
          {table ? 'Show chart' : 'Show table'}
        </button>
      </div>
      {table ? (
        <div className="table-wrap" tabIndex={0} role="region" aria-label={`${title} samples`}>
          <table className="data">
            <caption className="visually-hidden">{title} samples</caption>
            <thead>
              <tr>
                <th scope="col">Variant</th>
                <th scope="col" className="num">
                  Median ns/column
                </th>
                <th scope="col" className="num">
                  IQR
                </th>
                <th scope="col" className="num">
                  MiB/s
                </th>
                <th scope="col" className="num">
                  Samples
                </th>
                <th scope="col">Raw samples (ns/column)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-highlight={r.emphasis ? 'true' : undefined}>
                  <th scope="row">{r.label}</th>
                  <td className="num">{formatNumber(r.workload.medianNsPerColumn, 4)}</td>
                  <td className="num">{formatNumber(r.workload.iqr, 3)}</td>
                  <td className="num">{formatNumber(r.workload.mibPerSec, 4)}</td>
                  <td className="num">{r.values.length}</td>
                  <td className="mono small" style={{ whiteSpace: 'normal' }}>
                    {r.values.map((v) => formatNumber(v, 4)).join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart-wrap" onPointerLeave={() => setTip(null)}>
          <svg className="chart" width={width} height={height} role="img" aria-labelledby={`${id}-cap ${id}-desc`}>
            <desc id={`${id}-desc`}>
              {rows
                .map(
                  (r) =>
                    `${r.label}: median ${formatNumber(r.sum.median, 4)} ns per column, IQR ${formatNumber(r.sum.q3 - r.sum.q1, 3)}`,
                )
                .join('; ')}
            </desc>
            <g className="grid">
              {ticks.map((t) => (
                <line key={t} x1={sx(t)} x2={sx(t)} y1={PAD_T - 4} y2={PAD_T + rows.length * ROW} />
              ))}
            </g>
            <g className="axis">
              <line x1={LABEL_W} x2={LABEL_W + plotW} y1={PAD_T + rows.length * ROW} y2={PAD_T + rows.length * ROW} />
              {ticks.map((t) => (
                <text key={t} x={sx(t)} y={PAD_T + rows.length * ROW + 16} textAnchor="middle">
                  {formatNumber(t, 4)}
                </text>
              ))}
            </g>
            {rows.map((r, i) => {
              const cy = PAD_T + i * ROW + ROW / 2;
              const accent = r.emphasis;
              return (
                <g
                  key={r.id}
                  className="mark"
                  tabIndex={0}
                  aria-label={`${r.label}: median ${formatNumber(r.sum.median, 4)} ns per column, interquartile range ${formatNumber(r.sum.q1, 4)} to ${formatNumber(r.sum.q3, 4)}, ${r.values.length} samples`}
                  onFocus={() =>
                    setTip({
                      x: sx(r.sum.median),
                      y: cy,
                      value: `${formatNumber(r.sum.median, 4)} ns/column`,
                      label: `${r.label}, median of ${r.values.length}`,
                    })
                  }
                  onBlur={() => setTip(null)}
                >
                  <text className="label" x={LABEL_W - 10} y={cy + 4} textAnchor="end">
                    {r.label}
                  </text>
                  <rect
                    className={accent ? 'iqr-accent' : 'iqr'}
                    x={sx(r.sum.q1)}
                    y={cy - 9}
                    width={Math.max(2, sx(r.sum.q3) - sx(r.sum.q1))}
                    height={18}
                    rx={4}
                  />
                  {r.values.map((v, k) => (
                    <g key={k}>
                      <circle
                        className="hit"
                        cx={sx(v)}
                        cy={cy}
                        r={10}
                        onPointerEnter={() =>
                          setTip({
                            x: sx(v),
                            y: cy,
                            value: `${formatNumber(v, 4)} ns/column`,
                            label: `${r.label}, sample ${k + 1}`,
                          })
                        }
                      />
                      <circle className={`dot${accent ? ' dot-accent' : ''}`} cx={sx(v)} cy={cy} r={4} />
                    </g>
                  ))}
                  <line className="median" x1={sx(r.sum.median)} x2={sx(r.sum.median)} y1={cy - 11} y2={cy + 11} />
                </g>
              );
            })}
          </svg>
          <Tooltip tip={tip} />
        </div>
      )}
    </figure>
  );
}

export interface RatioRow {
  key: string;
  label: string;
  emphasis: boolean;
  comparison: Comparison;
}

/**
 * Speedup of a candidate over each baseline (baseline time / candidate time,
 * above 1 is faster) with its 95% paired bootstrap interval, against the
 * 1.02 threshold that "locally confirmed" requires.
 */
export function RatioChart({ title, rows, threshold = 1.02 }: { title: string; rows: RatioRow[]; threshold?: number }) {
  const [ref, width] = useWidth<HTMLElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const [table, setTable] = useState(false);
  const values = rows
    .flatMap((r) => [r.comparison.ci95[0], r.comparison.ci95[1], r.comparison.ratio])
    .concat([1, threshold]);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const ticks = niceTicks(
    lo - (hi - lo) * 0.08,
    hi + (hi - lo) * 0.08,
    Math.max(3, Math.floor((width - LABEL_W - 40) / 80)),
  );
  const x0 = ticks[0] ?? lo;
  const x1 = ticks[ticks.length - 1] ?? hi;
  const labelW = LABEL_W + 40;
  const plotW = width - labelW - PAD_R;
  const sx = (v: number) => labelW + ((v - x0) / (x1 - x0 || 1)) * plotW;
  const top = PAD_T + 18;
  const height = top + rows.length * ROW + AXIS_H;
  const id = `rc-${title.replace(/\W+/g, '-')}`;
  const ciText = (c: Comparison) =>
    `${c.ratio.toFixed(3)}× (95% CI ${c.ci95[0].toFixed(3)} to ${c.ci95[1].toFixed(3)})`;

  return (
    <figure ref={ref} className="stack" style={{ margin: 0, gap: 8 }} aria-labelledby={`${id}-cap`}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <figcaption id={`${id}-cap`} className="field-label">
          {title}: speedup over each baseline (above 1 is faster)
        </figcaption>
        <button type="button" className="btn btn-sm" aria-pressed={table} onClick={() => setTable((t) => !t)}>
          {table ? 'Show chart' : 'Show table'}
        </button>
      </div>
      {table ? (
        <div className="table-wrap" tabIndex={0} role="region" aria-label={`${title} speedups`}>
          <table className="data">
            <caption className="visually-hidden">{title} speedups</caption>
            <thead>
              <tr>
                <th scope="col">Comparison</th>
                <th scope="col" className="num">
                  Ratio
                </th>
                <th scope="col" className="num">
                  95% CI low
                </th>
                <th scope="col" className="num">
                  95% CI high
                </th>
                <th scope="col">Clears {threshold}?</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} data-highlight={r.emphasis ? 'true' : undefined}>
                  <th scope="row">{r.label}</th>
                  <td className="num">{r.comparison.ratio.toFixed(3)}</td>
                  <td className="num">{r.comparison.ci95[0].toFixed(3)}</td>
                  <td className="num">{r.comparison.ci95[1].toFixed(3)}</td>
                  <td>{r.comparison.ci95[0] > threshold ? 'yes' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart-wrap" onPointerLeave={() => setTip(null)}>
          <svg className="chart" width={width} height={height} role="img" aria-labelledby={`${id}-cap ${id}-desc`}>
            <desc id={`${id}-desc`}>{rows.map((r) => `${r.label}: ${ciText(r.comparison)}`).join('; ')}</desc>
            <g className="grid">
              {ticks.map((t) => (
                <line key={t} x1={sx(t)} x2={sx(t)} y1={top - 4} y2={top + rows.length * ROW} />
              ))}
            </g>
            <line className="unity" x1={sx(1)} x2={sx(1)} y1={top - 14} y2={top + rows.length * ROW} />
            <text x={sx(1)} y={top - 18} textAnchor="end">
              no change 1.00
            </text>
            <line
              className="threshold"
              x1={sx(threshold)}
              x2={sx(threshold)}
              y1={top - 14}
              y2={top + rows.length * ROW}
            />
            <text x={sx(threshold) + 4} y={top - 18} textAnchor="start">
              threshold {threshold.toFixed(2)}
            </text>
            <g className="axis">
              <line x1={labelW} x2={labelW + plotW} y1={top + rows.length * ROW} y2={top + rows.length * ROW} />
              {ticks.map((t) => (
                <text key={t} x={sx(t)} y={top + rows.length * ROW + 16} textAnchor="middle">
                  {t.toFixed(2)}
                </text>
              ))}
            </g>
            {rows.map((r, i) => {
              const cy = top + i * ROW + ROW / 2;
              const c = r.comparison;
              const show = () =>
                setTip({
                  x: sx(c.ratio),
                  y: cy,
                  value: `${c.ratio.toFixed(3)}×`,
                  label: `${r.label}, 95% CI ${c.ci95[0].toFixed(3)}–${c.ci95[1].toFixed(3)}`,
                });
              return (
                <g
                  key={r.key}
                  className="mark"
                  tabIndex={0}
                  aria-label={`${r.label}: ${ciText(c)}`}
                  onFocus={show}
                  onBlur={() => setTip(null)}
                  onPointerEnter={show}
                >
                  <text className="label" x={labelW - 10} y={cy + 4} textAnchor="end">
                    {r.label}
                  </text>
                  <rect
                    className="hit"
                    x={sx(c.ci95[0]) - 6}
                    y={cy - 12}
                    width={Math.max(24, sx(c.ci95[1]) - sx(c.ci95[0]) + 12)}
                    height={24}
                  />
                  <line
                    className={`ci${r.emphasis ? ' ci-accent' : ''}`}
                    x1={sx(c.ci95[0])}
                    x2={sx(c.ci95[1])}
                    y1={cy}
                    y2={cy}
                  />
                  <circle className={`ratio${r.emphasis ? ' ratio-accent' : ''}`} cx={sx(c.ratio)} cy={cy} r={5} />
                </g>
              );
            })}
          </svg>
          <Tooltip tip={tip} />
        </div>
      )}
    </figure>
  );
}
