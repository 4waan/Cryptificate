import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, PREFS_KEY, parsePrefs, readPrefs, serializePrefs, writePrefs } from './prefs';

describe('prefs', () => {
  it('everything is off by default', () => {
    expect(DEFAULT_PREFS).toEqual({ autoCheck: false, notify: false, sound: false });
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
  });

  it('round-trips', () => {
    const p = { autoCheck: true, notify: false, sound: true };
    expect(parsePrefs(serializePrefs(p))).toEqual(p);
  });

  it.each(['{', '[]', '{"version":2,"autoCheck":true}', '{"autoCheck":true}', '"x"', 'null'])('ignores %s', (text) => {
    expect(parsePrefs(text)).toEqual(DEFAULT_PREFS);
  });

  it('only accepts true for each flag', () => {
    expect(parsePrefs('{"version":1,"autoCheck":"yes","notify":1,"sound":true}')).toEqual({
      autoCheck: false,
      notify: false,
      sound: true,
    });
  });

  it('reads and writes storage, tolerating storage that throws', () => {
    const map = new Map<string, string>();
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
    expect(writePrefs(storage, { autoCheck: true, notify: false, sound: false })).toBe(true);
    expect(map.has(PREFS_KEY)).toBe(true);
    expect(readPrefs(storage).autoCheck).toBe(true);
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    expect(readPrefs(broken)).toEqual(DEFAULT_PREFS);
    expect(writePrefs(broken, DEFAULT_PREFS)).toBe(false);
    expect(writePrefs(null, DEFAULT_PREFS)).toBe(false);
  });
});
