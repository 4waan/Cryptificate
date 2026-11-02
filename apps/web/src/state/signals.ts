import { recordTiming, parseTimings, timingKey, TIMINGS_KEY } from '../lib/progress';
import { completionMessage, finishedMark, notifyPermission, playTone } from '../lib/signals';
import { runIsActive } from './actions';
import { getState, setState, subscribe, type AppState, type Run } from './store';

/**
 * Side effects when a run ends: its duration is kept for the next
 * estimate, and the user is told (tab title mark while the page is in the
 * background, plus the notification and tone they opted into).
 */

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function pageInBackground(): boolean {
  if (typeof document === 'undefined') return false;
  return document.visibilityState === 'hidden' || !document.hasFocus();
}

/** Runs the user is looking at or waiting for: the workspace/experiment runs and the story's runs. */
function followed(s: AppState, key: string): boolean {
  return s.current.analysis === key || s.current.experiment === key || Object.values(s.story.runs).includes(key);
}

function remember(run: Run): void {
  if (run.source !== 'live' || run.state !== 'completed' || run.startedAt === undefined || run.finishedAt === undefined) return;
  // Cached results come back at once and would make every estimate look instant.
  if (run.report?.provenance?.origin === 'cached') return;
  const timings = recordTiming(getState().timings, timingKey(run.kind, run.profile), run.finishedAt - run.startedAt);
  setState({ timings });
  try {
    storage()?.setItem(TIMINGS_KEY, JSON.stringify(timings));
  } catch {
    // Estimates still work for this visit.
  }
}

function tell(run: Run): void {
  const s = getState();
  const background = pageInBackground();
  const mark = finishedMark(run.state);
  if (background) setState({ attention: mark });
  // Auto-checks run while the user is editing; they only mark the title.
  if (run.auto && !background) return;
  if (s.prefs.sound) playTone();
  if (s.prefs.notify && background && notifyPermission() === 'granted') {
    const { title, body } = completionMessage(run.kind, run.state, run.report);
    try {
      const n = new Notification(`${title} · Cryptificate`, { body, tag: 'cryptificate-run' });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {
      // Some browsers only allow notifications from a service worker.
    }
  }
}

/** Starts watching runs. Returns a stop function. */
export function startSignals(): () => void {
  try {
    setState({ timings: parseTimings(storage()?.getItem(TIMINGS_KEY)) });
  } catch {
    // No stored timings.
  }
  const active = new Set<string>();
  for (const r of Object.values(getState().runs)) if (runIsActive(r)) active.add(r.key);
  const unsubscribe = subscribe(() => {
    const s = getState();
    for (const r of Object.values(s.runs)) {
      if (runIsActive(r)) {
        active.add(r.key);
        continue;
      }
      if (!active.has(r.key)) continue;
      active.delete(r.key);
      if (r.state === 'unavailable') continue;
      remember(r);
      // Replayed runs come back at once from recordings: nothing to wait for, nothing to signal.
      if (r.source === 'live' && followed(s, r.key)) tell(r);
    }
  });
  const clear = () => {
    if (!pageInBackground() && getState().attention) setState({ attention: null });
  };
  window.addEventListener('focus', clear);
  document.addEventListener('visibilitychange', clear);
  return () => {
    unsubscribe();
    window.removeEventListener('focus', clear);
    document.removeEventListener('visibilitychange', clear);
  };
}

/** Asks for permission (from a click) and turns notifications on if granted. */
export async function enableNotifications(): Promise<'granted' | 'denied' | 'default' | 'unsupported'> {
  const before = notifyPermission();
  if (before === 'unsupported') return before;
  const result = before === 'granted' ? 'granted' : await Notification.requestPermission();
  return result as 'granted' | 'denied' | 'default';
}
