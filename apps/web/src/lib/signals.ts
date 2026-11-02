import type { Claim, Report } from './types';

/**
 * Completion signals: a mark in the tab title, an optional desktop
 * notification and an optional short tone. The wording follows the
 * evidence vocabulary: an execution outcome is never called a refutation.
 */

export type TitleMark = 'running' | 'done' | 'failed' | null;

const MARKS: Record<Exclude<TitleMark, null>, string> = {
  running: '◌ Running',
  done: '✓ Done',
  failed: '✕ Stopped',
};

export function titleWithMark(base: string, mark: TitleMark): string {
  return mark ? `${MARKS[mark]} · ${base}` : base;
}

const TERMINAL_OK = new Set(['completed']);

/** Whether a finished run counts as done (it ran to the end) or not. */
export function finishedMark(state: string): 'done' | 'failed' {
  return TERMINAL_OK.has(state) ? 'done' : 'failed';
}

function claimCounts(claims: Claim[]): string {
  const n = (s: Claim['status']) => claims.filter((c) => c.status === s).length;
  const parts = [
    [n('proved'), 'proved'],
    [n('refuted'), 'refuted'],
    [n('not_established'), 'not established'],
  ] as const;
  return parts
    .filter(([k]) => k > 0)
    .map(([k, w]) => `${k} ${w}`)
    .join(', ');
}

/** Title and body for the notification when a run ends. */
export function completionMessage(
  kind: 'analysis' | 'experiment',
  state: string,
  report: Report | null,
): { title: string; body: string } {
  const what = kind === 'analysis' ? 'Check' : 'Experiment';
  if (state !== 'completed') {
    const how = { failed: 'failed', timeout: 'hit its time limit', cancelled: 'was stopped', invalid: 'was rejected as invalid input' }[
      state
    ];
    return {
      title: `${what} ${how ?? 'ended'}`,
      body: 'An execution outcome, not a mathematical result. Open the workbench for details.',
    };
  }
  if (report?.kind === 'experiment') {
    const n = report.candidates.length;
    return { title: `${what} finished`, body: `${n} candidate${n === 1 ? '' : 's'}. Open the workbench for the evidence and timings.` };
  }
  const counts = report?.kind === 'analysis' ? claimCounts(report.claims) : '';
  return { title: `${what} finished`, body: counts ? `Claims: ${counts}.` : 'Open the workbench to read the evidence.' };
}

/** A short, quiet two-note tone. Does nothing where Web Audio is missing. */
export function playTone(): void {
  try {
    const Ctx =
      (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const t0 = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.05, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
    [660, 880].forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      osc.connect(gain);
      osc.start(t0 + i * 0.12);
      osc.stop(t0 + 0.14 + i * 0.12);
    });
    window.setTimeout(() => void ctx.close(), 600);
  } catch {
    // Audio is best effort.
  }
}

export type NotifyPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export function notifyPermission(): NotifyPermission {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission as NotifyPermission;
}
