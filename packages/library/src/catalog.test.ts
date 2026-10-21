import { describe, expect, it } from 'vitest';
import { dataSourceSchema, intentSchema } from '@forma/design-core';
import { COMPATIBILITY_TARGETS, libraryEntryMetaSchema } from './catalog';
import { INVENTORY_INTENTS, MENU_ACTION_INTENT } from './intents';
import {
  INVENTORY_ITEMS,
  INVENTORY_ITEM_CATEGORIES,
  INVENTORY_ITEMS_ID,
  inventoryItemsDataSource,
} from './mock/items';
import { getEntry, listEntries, listFamilies } from './registry';
import { EXPECTED_IDS } from './test-helpers';

describe('catalog', () => {
  it('ships exactly the planned entries', () => {
    expect(
      listEntries()
        .map((e) => e.id)
        .sort(),
    ).toEqual([...EXPECTED_IDS].sort());
  });

  it.each(EXPECTED_IDS)('%s has valid metadata and compatibility for every target', (id) => {
    const entry = getEntry(id);
    expect(entry).toBeDefined();
    if (!entry) return;
    const { params: _params, build: _build, ...meta } = entry;
    void _params;
    void _build;
    expect(libraryEntryMetaSchema.safeParse(meta).success).toBe(true);
    for (const target of COMPATIBILITY_TARGETS) {
      expect(entry.compatibility[target].note.length).toBeGreaterThan(0);
    }
    expect(entry.tags.length).toBeGreaterThanOrEqual(3);
    expect(entry.params.safeParse({}).success).toBe(true);
  });

  it('has unique ids and Spanish names for the headline entries', () => {
    const ids = listEntries().map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(getEntry('inventory.tabs')?.name).toBe('Inventario con pestañas');
    expect(getEntry('inventory.equipment')?.name).toBe('Panel de equipamiento');
    expect(getEntry('tabBar')?.name).toBe('Barra de pestañas');
    expect(getEntry('contextMenu')?.name).toBe('Menú contextual');
  });

  it('declares the behaviors each inventory variant is meant to demonstrate', () => {
    expect(getEntry('inventory.grid')?.behaviors).toEqual(
      expect.arrayContaining(['dragDrop', 'stack', 'select', 'contextMenu', 'tooltip', 'split']),
    );
    expect(getEntry('inventory.tabs')?.behaviors).toEqual(
      expect.arrayContaining(['tabs', 'dragDrop', 'stack']),
    );
    expect(getEntry('inventory.equipment')?.behaviors).toContain('dragDrop');
    expect(getEntry('tabBar')?.behaviors).toEqual(['tabs']);
  });
});

describe('families', () => {
  it('groups the inventory variants for choose-by-function', () => {
    const inventory = listFamilies().find((f) => f.id === 'inventory');
    expect(inventory?.name).toBe('Inventario');
    expect(inventory?.variants.map((v) => v.id)).toEqual([
      'inventory.grid',
      'inventory.tabs',
      'inventory.equipment',
      'inventory.list',
      'inventory.grid+equipment',
    ]);
    expect(inventory?.variants.every((v) => v.purpose.length > 0)).toBe(true);
  });

  it('does not create a family for family-less entries', () => {
    expect(listFamilies().map((f) => f.id)).toEqual(['inventory']);
  });
});

describe('shared inventory mock data and intents', () => {
  it('provides ~16 Spanish fantasy items covering every category', () => {
    expect(INVENTORY_ITEMS.length).toBeGreaterThanOrEqual(16);
    expect(INVENTORY_ITEM_CATEGORIES).toEqual(['Armas', 'Armaduras', 'Consumibles', 'Materiales']);
    for (const category of INVENTORY_ITEM_CATEGORIES) {
      expect(INVENTORY_ITEMS.filter((i) => i.category === category).length).toBeGreaterThanOrEqual(
        3,
      );
    }
    const ids = INVENTORY_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of INVENTORY_ITEMS) {
      expect(Object.keys(item).sort()).toEqual(
        ['category', 'icon', 'id', 'maxStack', 'name', 'quantity', 'rarity', 'slotType'].sort(),
      );
      expect(Number(item.quantity)).toBeGreaterThan(0);
      expect(Number(item.quantity)).toBeLessThanOrEqual(Number(item.maxStack));
    }
  });

  it('covers every equipment slot type with at least one item', () => {
    for (const slotType of ['head', 'chest', 'legs', 'weapon', 'offhand']) {
      expect(INVENTORY_ITEMS.some((i) => i.slotType === slotType)).toBe(true);
    }
  });

  it('exposes a simulated collection data source with typed fields', () => {
    const source = inventoryItemsDataSource();
    expect(source && dataSourceSchema.safeParse(source).success).toBe(true);
    expect(source).toMatchObject({
      id: INVENTORY_ITEMS_ID,
      kind: 'collection',
      connection: 'simulated',
    });
    expect(source?.fields.map((f) => [f.name, f.type])).toEqual([
      ['id', 'id'],
      ['name', 'string'],
      ['icon', 'image'],
      ['quantity', 'number'],
      ['maxStack', 'number'],
      ['category', 'string'],
      ['slotType', 'string'],
      ['rarity', 'string'],
    ]);
    expect(source?.mock).toEqual(INVENTORY_ITEMS);
  });

  it('declares the five unconnected inventory intents with the specified payloads', () => {
    const byName = Object.fromEntries(INVENTORY_INTENTS.map((i) => [i.name, i]));
    expect(Object.keys(byName).sort()).toEqual([
      'inventory.dropItem',
      'inventory.equipItem',
      'inventory.moveItem',
      'inventory.splitStack',
      'inventory.useItem',
    ]);
    for (const intent of INVENTORY_INTENTS) {
      expect(intentSchema.safeParse(intent).success).toBe(true);
      expect(intent.connection).toBe('unconnected');
      expect(intent.id).toBe(intent.name);
    }
    expect(byName['inventory.moveItem']?.payload.map((p) => p.name)).toEqual([
      'itemId',
      'fromSlot',
      'toSlot',
    ]);
    expect(byName['inventory.useItem']?.payload.map((p) => p.name)).toEqual(['itemId']);
    expect(byName['inventory.dropItem']?.payload.map((p) => p.name)).toEqual(['itemId']);
    expect(byName['inventory.splitStack']?.payload.map((p) => p.name)).toEqual([
      'itemId',
      'amount',
    ]);
    expect(byName['inventory.equipItem']?.payload.map((p) => p.name)).toEqual([
      'itemId',
      'slotType',
    ]);
    expect(MENU_ACTION_INTENT?.connection).toBe('unconnected');
  });
});
