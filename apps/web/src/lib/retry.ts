/**
 * Waiting out a busy service. The service holds one running job and a
 * short queue (capabilities.limits.maxQueued); a further submission is
 * refused with 429 and a Retry-After header. The page then waits and
 * submits again a bounded number of times.
 */

/** Resubmissions after a 429 before the run is reported as failed. */
export const BUSY_MAX_RETRIES = 5;
/** Submissions in all: the first one plus the retries. User-facing text counts these. */
export const BUSY_MAX_ATTEMPTS = BUSY_MAX_RETRIES + 1;
/** Longest wait between resubmissions, whatever Retry-After says. */
export const BUSY_MAX_DELAY_MS = 60_000;
const BUSY_MIN_DELAY_MS = 1_000;

/** Reads Retry-After: delta-seconds or an HTTP date. Returns whole seconds, or undefined. */
export function parseRetryAfter(value: string | null | undefined, nowMs: number = Date.now()): number | undefined {
  if (value == null) return undefined;
  const text = value.trim();
  if (!text) return undefined;
  if (/^\d+$/.test(text)) return Number(text);
  // Otherwise only an HTTP date (it always names a weekday and month) is accepted.
  if (!/[a-z]{3}/i.test(text)) return undefined;
  const at = Date.parse(text);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, Math.ceil((at - nowMs) / 1000));
}

/**
 * Milliseconds to wait before resubmission `attempt` (1-based). The
 * service's Retry-After wins when given; otherwise the wait doubles from
 * 2 s. Always between 1 s and BUSY_MAX_DELAY_MS.
 */
export function busyRetryDelayMs(attempt: number, retryAfterSeconds?: number): number {
  const n = Math.max(1, Math.floor(attempt));
  const ms = retryAfterSeconds !== undefined ? retryAfterSeconds * 1000 : 1000 * 2 ** Math.min(n, 6);
  return Math.min(BUSY_MAX_DELAY_MS, Math.max(BUSY_MIN_DELAY_MS, ms));
}

/** Whole seconds left until `at`, never negative. */
export function secondsUntil(at: number, nowMs: number): number {
  return Math.max(0, Math.ceil((at - nowMs) / 1000));
}

/**
 * How many more jobs the service accepts from this page: one running plus
 * `maxQueued` waiting, minus this page's own unfinished live jobs. Other
 * clients' jobs are unknown, so a 429 can still happen.
 */
export function queueRoom(maxQueued: number | undefined, ownActive: number): number {
  const capacity = 1 + Math.max(0, maxQueued ?? 2);
  return Math.max(0, capacity - ownActive);
}
