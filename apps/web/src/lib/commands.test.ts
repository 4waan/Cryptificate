import { describe, expect, it } from 'vitest';
import { filterCommands, scoreCommand, type Command } from './commands';

const cmd = (id: string, label: string, group = 'Run', keywords?: string): Command => ({ id, label, group, keywords, run: () => {} });

const list = [
  cmd('check', 'Check design and circuit', 'Run', 'lean verify'),
  cmd('exp', 'Run quick experiment', 'Run', 'timing'),
  cmd('ws', 'Workspace', 'Go to', 'editor circuit'),
  cmd('aes', 'Load AES MixColumns circ(02, 03, 01, 01)', 'Presets', 'matrix'),
  cmd('dark', 'Theme: Dark', 'Theme'),
];

describe('command filter', () => {
  it('keeps everything, in order, for an empty query', () => {
    expect(filterCommands('', list).map((c) => c.id)).toEqual(['check', 'exp', 'ws', 'aes', 'dark']);
    expect(filterCommands('   ', list)).toHaveLength(5);
  });

  it('ranks word starts above substrings above group and keywords', () => {
    expect(scoreCommand(list[0]!, ['che'])).toBe(8);
    expect(scoreCommand(list[0]!, ['ecK'.toLowerCase()])).toBe(5);
    expect(scoreCommand(list[0]!, ['lean'])).toBe(3);
    expect(scoreCommand(list[0]!, ['zzz'])).toBe(0);
    expect(filterCommands('circ', list).map((c) => c.id)).toEqual(['check', 'aes', 'ws']);
  });

  it('needs every word to match', () => {
    expect(filterCommands('load aes', list).map((c) => c.id)).toEqual(['aes']);
    expect(filterCommands('theme dark', list).map((c) => c.id)).toEqual(['dark']);
    expect(filterCommands('theme light', list)).toEqual([]);
  });

  it('matches letters in order as a last resort', () => {
    expect(filterCommands('wrkspc', list).map((c) => c.id)).toEqual(['ws']);
  });
});
