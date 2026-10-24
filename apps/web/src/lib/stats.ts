import type { Workload } from './types';

export function quantile(sorted: readonly number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export function median(values: readonly number[]): number {
  return quantile([...values].sort((a, b) => a - b), 0.5);
}

/**
 * Raw samples expressed in nanoseconds per column. The harness times a fixed,
 * calibrated number of batch calls per sample, so a sample and the reported
 * median per column differ by one constant factor per workload; samples that
 * are already per column (factor near 1) are returned unchanged.
 */
export function samplesPerColumn(w: Workload): number[] {
  if (!w.samples.length || !(w.medianNsPerColumn > 0)) return [...w.samples];
  const factor = median(w.samples) / w.medianNsPerColumn;
  if (!(factor > 0) || (factor > 0.5 && factor < 2)) return [...w.samples];
  return w.samples.map((s) => s / factor);
}

export interface Summary {
  median: number;
  q1: number;
  q3: number;
  min: number;
  max: number;
}

export function summarize(values: readonly number[]): Summary {
  const s = [...values].sort((a, b) => a - b);
  return { median: quantile(s, 0.5), q1: quantile(s, 0.25), q3: quantile(s, 0.75), min: s[0] ?? NaN, max: s[s.length - 1] ?? NaN };
}

/** Round tick values covering [min, max]. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.floor(min / step + 1e-9) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.5 + 1e-12; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1 << 20 && bytes % (1 << 20) === 0) return `${bytes / (1 << 20)} MiB`;
  if (bytes >= 1024) return `${+(bytes / 1024).toFixed(1)} KiB`;
  return `${bytes} B`;
}

export function formatNumber(x: number, digits = 3): string {
  if (!Number.isFinite(x)) return '–';
  if (Math.abs(x) >= 1000) return x.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return Number(x.toPrecision(digits)).toString();
}
