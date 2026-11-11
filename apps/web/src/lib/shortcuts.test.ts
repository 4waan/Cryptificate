import { describe, expect, it } from 'vitest';
import { appShortcut, historyShortcut, isMacPlatform, isTextField, keepsNativeUndo } from './shortcuts';

const key = (k: string, mods: Partial<{ ctrl: boolean; meta: boolean; shift: boolean; alt: boolean }> = {}) => ({
  key: k,
  ctrlKey: Boolean(mods.ctrl),
  metaKey: Boolean(mods.meta),
  shiftKey: Boolean(mods.shift),
  altKey: Boolean(mods.alt),
});

describe('historyShortcut', () => {
  it.each([
    [key('z', { ctrl: true }), 'undo'],
    [key('z', { meta: true }), 'undo'],
    [key('Z', { ctrl: true, shift: true }), 'redo'],
    [key('z', { meta: true, shift: true }), 'redo'],
    [key('y', { ctrl: true }), 'redo'],
    [key('y', { meta: true }), null],
    [key('z'), null],
    [key('z', { ctrl: true, alt: true }), null],
    [key('z', { ctrl: true, meta: true }), null],
    [key('x', { ctrl: true }), null],
  ])('%j -> %s', (e, action) => {
    expect(historyShortcut(e)).toBe(action);
  });
});

describe('keepsNativeUndo', () => {
  const el = (tagName: string, attrs: Record<string, string> = {}, editable = false) => ({
    tagName,
    isContentEditable: editable,
    getAttribute: (n: string) => attrs[n] ?? null,
  });
  it('keeps native undo in text areas, editable regions and marked inputs', () => {
    expect(keepsNativeUndo(el('TEXTAREA'))).toBe(true);
    expect(keepsNativeUndo(el('div', {}, true))).toBe(true);
    expect(keepsNativeUndo(el('INPUT', { 'data-native-undo': '' }))).toBe(true);
  });
  it('uses workspace undo in matrix cells, selects, buttons and the page', () => {
    expect(keepsNativeUndo(el('INPUT'))).toBe(false);
    expect(keepsNativeUndo(el('SELECT'))).toBe(false);
    expect(keepsNativeUndo(el('BUTTON'))).toBe(false);
    expect(keepsNativeUndo(null)).toBe(false);
  });
  it('detects Apple platforms', () => {
    expect(isMacPlatform('MacIntel')).toBe(true);
    expect(isMacPlatform('iPhone')).toBe(true);
    expect(isMacPlatform('Linux x86_64')).toBe(false);
  });
});

describe('appShortcut', () => {
  it.each([
    [key('Enter', { ctrl: true }), false, 'check'],
    [key('Enter', { meta: true }), true, 'check'],
    [key('Enter', { ctrl: true, shift: true }), true, 'experiment'],
    [key('k', { ctrl: true }), true, 'palette'],
    [key('K', { meta: true }), false, 'palette'],
    [key('k', { ctrl: true, shift: true }), false, null],
    [key('Enter', { ctrl: true, alt: true }), false, null],
    [key('Enter', { ctrl: true, meta: true }), false, null],
    [key('Escape'), false, 'stop'],
    [key('Escape'), true, null],
    [key('?', { shift: true }), false, 'help'],
    [key('?', { shift: true }), true, null],
    [key('?', { ctrl: true, shift: true }), false, null],
    [key('Enter'), false, null],
    [key('a'), false, null],
  ])('%j in text field %s -> %s', (e, inText, want) => {
    expect(appShortcut(e, inText)).toBe(want);
  });
});

describe('isTextField', () => {
  const el = (tagName: string, type?: string, editable = false) => ({ tagName, type, isContentEditable: editable });
  it.each([
    [el('INPUT', 'text'), true],
    [el('INPUT'), true],
    [el('INPUT', 'number'), true],
    [el('INPUT', 'search'), true],
    [el('INPUT', 'checkbox'), false],
    [el('INPUT', 'range'), false],
    [el('TEXTAREA'), true],
    [el('SELECT'), true],
    [el('BUTTON'), false],
    [el('DIV', undefined, true), true],
    [el('DIV'), false],
  ])('%j -> %s', (e, want) => {
    expect(isTextField(e)).toBe(want);
  });
  it('handles no element', () => {
    expect(isTextField(null)).toBe(false);
  });
});
