/**
 * Per-browser settings: auto-check, completion notification and sound.
 * Everything is off by default; anything that does not parse is ignored.
 */

export const PREFS_KEY = 'cryptificate.prefs.v1';

export interface PrefsValue {
  autoCheck: boolean;
  notify: boolean;
  sound: boolean;
}

export const DEFAULT_PREFS: PrefsValue = { autoCheck: false, notify: false, sound: false };

export function parsePrefs(text: string | null | undefined): PrefsValue {
  if (!text) return { ...DEFAULT_PREFS };
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    if (typeof raw !== 'object' || raw === null || raw.version !== 1) return { ...DEFAULT_PREFS };
    return {
      autoCheck: raw.autoCheck === true,
      notify: raw.notify === true,
      sound: raw.sound === true,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function serializePrefs(p: PrefsValue): string {
  return JSON.stringify({ version: 1, autoCheck: p.autoCheck, notify: p.notify, sound: p.sound });
}

export function readPrefs(storage: Pick<Storage, 'getItem'> | null | undefined): PrefsValue {
  try {
    return parsePrefs(storage?.getItem(PREFS_KEY));
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/** Saves the settings; returns false when storage is unavailable. */
export function writePrefs(storage: Pick<Storage, 'setItem'> | null | undefined, p: PrefsValue): boolean {
  if (!storage) return false;
  try {
    storage.setItem(PREFS_KEY, serializePrefs(p));
    return true;
  } catch {
    return false;
  }
}
