import { describe, expect, it } from 'vitest';
import { INVENTORY_ITEMS } from '@forma/library';
import {
  parseBindingPath,
  resolveBindingPath,
  resolveItemPreview,
  siblingFieldPath,
} from './bindings';
import { inventoryDoc, nodesOfType, screenOf } from './testing';

const items = INVENTORY_ITEMS;

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

  it('rejects malformed paths', () => {
    expect(parseBindingPath('')).toBeUndefined();
    expect(parseBindingPath('items[')).toBeUndefined();
    expect(parseBindingPath('items[a=b')).toBeUndefined();
    expect(parseBindingPath('items..name')).toBeUndefined();
    expect(parseBindingPath('[0]')).toBeUndefined();
  });
});

describe('resolveBindingPath', () => {
  it('returns the whole collection for the root path', () => {
    expect(resolveBindingPath(items, 'items')).toEqual(items);
  });

  it('applies filters before indexing', () => {
    const consumables = items.filter((i) => i.category === 'Consumibles');
    expect(resolveBindingPath(items, 'items[category=Consumibles][1]')).toEqual(consumables[1]);
    expect(resolveBindingPath(items, 'items[category=Consumibles][1].name')).toBe('Poción de maná');
  });

  it('indexes the unfiltered collection', () => {
    expect(resolveBindingPath(items, 'items[0].quantity')).toBe(1);
  });

  it('chains several filters', () => {
    expect(resolveBindingPath(items, 'items[category=Armas][rarity=raro][0].name')).toBe(
      'Bastón de runas',
    );
  });

  it('returns undefined when nothing matches', () => {
    expect(resolveBindingPath(items, 'items[category=Nada][0]')).toBeUndefined();
    expect(resolveBindingPath(items, 'items[99]')).toBeUndefined();
    expect(resolveBindingPath(items, 'items[0].nope')).toBeUndefined();
    expect(resolveBindingPath(items, 'bad[')).toBeUndefined();
  });

  it('reads object data sources by key', () => {
    expect(resolveBindingPath({ player: { name: 'Ana' } }, 'player.name')).toBe('Ana');
  });

  it('never walks the prototype chain', () => {
    expect(resolveBindingPath(items, 'items[0].constructor')).toBeUndefined();
  });
});

describe('siblingFieldPath', () => {
  it('replaces the trailing field', () => {
    expect(siblingFieldPath('items[category=Armas][2].icon', 'name')).toBe(
      'items[category=Armas][2].name',
    );
    expect(siblingFieldPath('items[2]', 'name')).toBeUndefined();
  });
});

describe('resolveItemPreview', () => {
  const doc = inventoryDoc();
  const screen = screenOf(doc);
  const itemViews = nodesOfType(screen, 'itemView');

  it('shows icon, name and quantity of the bound mock item', () => {
    const preview = resolveItemPreview(doc, itemViews[0]!);
    expect(preview).toMatchObject({ name: 'Espada de hierro', quantity: 1, connection: 'simulated' });
    expect(preview?.icon).toContain('espada-de-hierro');
  });

  it('resolves the filtered rows of a later tab', () => {
    const consumable = itemViews.find((n) =>
      n.bindings.some((b) => b.path.startsWith('items[category=Consumibles][0]')),
    )!;
    expect(resolveItemPreview(doc, consumable)).toMatchObject({
      name: 'Poción de vida',
      quantity: 5,
    });
  });

  it('returns undefined when the row does not exist', () => {
    const empty = itemViews.find((n) =>
      n.bindings.some((b) => b.path.startsWith('items[category=Armas][10]')),
    );
    expect(empty).toBeDefined();
    expect(resolveItemPreview(doc, empty!)).toBeUndefined();
  });

  it('returns undefined for a node without bindings', () => {
    expect(resolveItemPreview(doc, screen.nodes[screen.rootId]!)).toBeUndefined();
  });
});
