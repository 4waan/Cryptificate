import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { filterCommands } from '../lib/commands';
import { PRESETS } from '../lib/library';
import { aesDesign } from '../lib/presets';
import { resizeAesDesign } from '../lib/width';
import { getState, initialState, setState } from '../state/store';
import { DesignEditor } from './DesignEditor';
import { appCommands, shortcutRows } from './Overlays';

const ctx = { setTheme: () => {}, mod: 'Ctrl' };

describe('command palette commands', () => {
  beforeEach(() => setState({ ...initialState(), view: 'workspace' }));

  it('covers views, presets, theme and export', () => {
    const cmds = appCommands(getState(), ctx);
    const groups = new Set(cmds.map((c) => c.group));
    for (const g of ['Run', 'Go to', 'Presets', 'Theme', 'Export', 'Edit', 'Help']) expect(groups).toContain(g);
    expect(cmds.filter((c) => c.group === 'Presets')).toHaveLength(PRESETS.length);
    expect(new Set(cmds.map((c) => c.id)).size).toBe(cmds.length);
    expect(filterCommands('dark', cmds)[0]!.id).toBe('theme.dark');
    expect(filterCommands('experiments', cmds)[0]!.id).toBe('go.experiments');
  });

  it('says why a command cannot run', () => {
    let cmds = appCommands(getState(), ctx);
    const byId = (id: string) => cmds.find((c) => c.id === id)!;
    expect(byId('run.stop').disabled).toBe('Nothing is running.');
    expect(byId('export.bundle').disabled).toMatch(/No finished check/);
    expect(byId('edit.undo').disabled).toBe('Nothing to undo.');
    expect(byId('run.check').disabled).toBeUndefined();
    setState({ design: { ...aesDesign(), rounds: 99 } });
    cmds = appCommands(getState(), ctx);
    expect(byId('run.check').disabled).toBe('Fix the input problems first.');
    expect(byId('export.share').disabled).toMatch(/Fix the input problems/);
  });

  it('lists every shortcut it handles', () => {
    const text = JSON.stringify(shortcutRows('Ctrl'));
    for (const k of ['Enter', 'Esc', 'K', '?', 'Z']) expect(text).toContain(`"${k}"`);
  });
});

describe('width selector', () => {
  it('marks widths 3 and 2 experimental and words the hints for the width', () => {
    const four = renderToStaticMarkup(<DesignEditor design={aesDesign()} target="matrix" />);
    expect(four).toMatch(/role="radio"[^>]*aria-checked="true"[^>]*>4×4/);
    expect((four.match(/experimental<\/span>/g) ?? []).length).toBe(2);
    expect(four).toContain('All four offsets differ');
    const three = resizeAesDesign(aesDesign(), null, 3).design;
    const html = renderToStaticMarkup(<DesignEditor design={three} target="matrix" />);
    expect(html).toMatch(/aria-checked="true"[^>]*>3×3/);
    expect(html).toContain('All three offsets differ');
    expect(html).toContain('not established by this method');
    expect(html).toContain('&quot;experimental&quot;: true');
  });
});
