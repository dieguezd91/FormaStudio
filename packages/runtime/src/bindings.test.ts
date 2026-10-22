import { describe, expect, it } from 'vitest';
import { parseBindingPath, resolveBindingPath, siblingFieldPath } from './bindings';

const rows = [
  { id: 'a', category: 'Armas', icon: 'a.png' },
  { id: 'b', category: 'Armaduras', icon: 'b.png' },
  { id: 'c', category: 'Armas', icon: 'c.png' },
];

describe('parseBindingPath', () => {
  it('parses root, filters, indexes and fields', () => {
    expect(parseBindingPath('items[category=Armas][3].icon')).toEqual({
      root: 'items',
      steps: [
        { kind: 'filter', field: 'category', value: 'Armas' },
        { kind: 'index', index: 3 },
        { kind: 'field', name: 'icon' },
      ],
    });
  });

  it('rejects malformed paths instead of throwing', () => {
    for (const bad of ['', '[0]', 'items[', 'items[=x]', 'items.', 'items!']) {
      expect(parseBindingPath(bad)).toBeUndefined();
    }
  });
});

describe('resolveBindingPath', () => {
  it('resolves the whole collection, filters, positions inside filters and fields', () => {
    expect(resolveBindingPath(rows, 'items')).toEqual(rows);
    expect(resolveBindingPath(rows, 'items[category=Armas]')).toEqual([rows[0], rows[2]]);
    expect(resolveBindingPath(rows, 'items[category=Armas][1].icon')).toBe('c.png');
    expect(resolveBindingPath(rows, 'items[1].id')).toBe('b');
  });

  it('returns undefined for anything missing and never throws', () => {
    expect(resolveBindingPath(rows, 'items[9].icon')).toBeUndefined();
    expect(resolveBindingPath(rows, 'items[category=Nada][0]')).toBeUndefined();
    expect(resolveBindingPath(rows, 'items[0].nope')).toBeUndefined();
    expect(resolveBindingPath(undefined, 'items[0]')).toBeUndefined();
    expect(resolveBindingPath(rows, '???')).toBeUndefined();
  });

  it('does not expose runtime bookkeeping fields', () => {
    expect(resolveBindingPath([{ __uid: 'r1' }], 'items[0].__uid')).toBeUndefined();
  });
});

describe('siblingFieldPath', () => {
  it('swaps the trailing field', () => {
    expect(siblingFieldPath('items[x=1][2].icon', 'name')).toBe('items[x=1][2].name');
    expect(siblingFieldPath('items[2]', 'name')).toBeUndefined();
  });
});
