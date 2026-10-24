/**
 * Log sanitation: subprocess output is shown to users and written into
 * evidence bundles, so it must not carry terminal escapes, local paths or
 * unbounded length.
 */
import { homedir } from 'node:os';

const ANSI = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g;
// Control characters other than tab and newline.
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

export interface SanitizeOptions {
  /** Absolute paths replaced by a placeholder, longest first. */
  replacements?: Array<[string, string]>;
  maxLength?: number;
}

export function sanitizeLog(text: string, opts: SanitizeOptions = {}): string {
  let s = text.replace(/\r\n/g, '\n').replace(ANSI, '').replace(CONTROL, '');
  const reps = [...(opts.replacements ?? [])];
  const home = homedir();
  if (home && home !== '/') reps.push([home, '~']);
  reps.sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of reps) {
    if (from.length > 1) s = s.split(from).join(to);
  }
  const max = opts.maxLength ?? 256 * 1024;
  if (s.length > max) s = `${s.slice(0, max)}\n[output truncated]\n`;
  return s;
}

/** First line that looks like a Lean or engine error, for short notes. */
export function firstErrorLine(text: string): string | undefined {
  for (const line of text.split('\n')) {
    if (/\berror\b/i.test(line)) return line.trim().slice(0, 300);
  }
  return undefined;
}
