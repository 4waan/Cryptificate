import { describe, expect, it } from 'vitest';
import { searchPresets } from '../lib/library';
import { groupedPresets } from './PresetPicker';

const ids = (groups: ReturnType<typeof groupedPresets>) => groups.flatMap((g) => g.items.map((p) => p.id));

describe('groupedPresets', () => {
  it.each(['gf256', 'bn254'] as const)('without a query, keeps kind order and lists %s presets first in each group', (field) => {
    const groups = groupedPresets('', field);
    expect(groups.map((g) => g.kind)).toEqual(['design', 'matrix', 'sbox', 'circuit']);
    for (const g of groups) {
      const firstOther = g.items.findIndex((p) => p.field !== field);
      if (firstOther >= 0) expect(g.items.slice(firstOther).every((p) => p.field !== field)).toBe(true);
      expect(g.items[0]!.field).toBe(field);
    }
    expect(groups[0]!.items[0]!.id).toBe(field === 'gf256' ? 'design.aes' : 'design.poseidon2-bn254-t3');
  });

  it('lists every match exactly once', () => {
    for (const q of ['', 'aes', 'poseidon', 'circ', 'identity', 'xyzzy']) {
      const listed = ids(groupedPresets(q, 'gf256'));
      expect(new Set(listed).size).toBe(listed.length);
      expect([...listed].sort()).toEqual(searchPresets(q).map((p) => p.id).sort());
    }
  });

  it('with a query, orders groups and items by relevance, not by field', () => {
    const q = 'circ';
    const rank = new Map(searchPresets(q).map((p, i) => [p.id, i]));
    const groups = groupedPresets(q, 'bn254');
    const firsts = groups.map((g) => rank.get(g.items[0]!.id)!);
    expect(firsts).toEqual([...firsts].sort((a, b) => a - b));
    for (const g of groups) {
      const r = g.items.map((p) => rank.get(p.id)!);
      expect(r).toEqual([...r].sort((a, b) => a - b));
    }
    // The best match leads even though it is a GF(2^8) preset and the workspace is BN254.
    expect(groups[0]!.items[0]!.id).toBe(searchPresets(q)[0]!.id);
    expect(groups[0]!.items[0]!.field).toBe('gf256');
  });

  it('narrows a query to the matching preset of each kind', () => {
    const groups = groupedPresets('poseidon', 'gf256');
    expect(groups.every((g) => g.items.every((p) => p.field === 'bn254'))).toBe(true);
    expect(groups[0]!.kind).toBe('design');
  });

  it('returns no groups when nothing matches', () => {
    expect(groupedPresets('xyzzy', 'gf256')).toEqual([]);
  });
});
