import { describe, expect, it } from 'vitest';
import type { FormaDocument, FormaNode } from '@forma/design-core';
import { insertAndApply, makeBaseDoc, nodesOfType, subtree } from './test-helpers';

const insert = (entryId: string, params?: Record<string, unknown>) =>
  insertAndApply(makeBaseDoc(), entryId, params);

const behaviorOf = <K extends FormaNode['behaviors'][number]['kind']>(node: FormaNode, kind: K) =>
  node.behaviors.find((b): b is Extract<typeof b, { kind: K }> => b.kind === kind);

const childrenOf = (doc: FormaDocument, nodeId: string): FormaNode[] =>
  (doc.screens[0]?.nodes[nodeId]?.children ?? []).flatMap((id) => {
    const node = doc.screens[0]?.nodes[id];
    return node ? [node] : [];
  });

describe('inventory.grid', () => {
  it('builds columns x rows slots under an inventoryGrid with the requested props', () => {
    const { doc } = insert('inventory.grid', { columns: 3, rows: 2, slotSize: 48 });
    const [grid] = nodesOfType(doc, 'inventoryGrid');
    expect(grid?.props).toEqual({ columns: 3, rows: 2, slotSize: { width: 48, height: 48 } });
    expect(grid?.layout).toMatchObject({
      mode: 'grid',
      columns: 3,
      cellSize: { width: 48, height: 48 },
    });
    const slots = childrenOf(doc, grid?.id ?? '');
    expect(slots).toHaveLength(6);
    expect(slots.every((s) => s.type === 'slot')).toBe(true);
  });

  it('gives each slot drag & drop both ways, stack, select, split, context menu and tooltip', () => {
    const { doc } = insert('inventory.grid', { maxStack: 20, showCount: false });
    const [grid] = nodesOfType(doc, 'inventoryGrid');
    const slots = childrenOf(doc, grid?.id ?? '');
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(behaviorOf(slot, 'dragDrop')).toEqual({
        kind: 'dragDrop',
        role: 'both',
        accepts: ['item'],
        intentId: 'inventory.moveItem',
      });
      expect(behaviorOf(slot, 'stack')).toEqual({ kind: 'stack', maxStack: 20, showCount: false });
      expect(behaviorOf(slot, 'select')).toEqual({ kind: 'select', mode: 'single' });
      expect(behaviorOf(slot, 'split')).toEqual({
        kind: 'split',
        intentId: 'inventory.splitStack',
      });
      expect(behaviorOf(slot, 'contextMenu')).toEqual({
        kind: 'contextMenu',
        trigger: 'secondaryClick',
        actions: [
          { id: 'use', label: 'Usar', intentId: 'inventory.useItem' },
          { id: 'split', label: 'Dividir', intentId: 'inventory.splitStack' },
          { id: 'drop', label: 'Soltar', intentId: 'inventory.dropItem' },
        ],
      });
      expect(behaviorOf(slot, 'tooltip')?.bindingPath).toMatch(/^items\[\d+\]$/);
    }
  });

  it('binds the grid to the collection and each slot item view to its position', () => {
    const { doc } = insert('inventory.grid', { columns: 2, rows: 2 });
    const [grid] = nodesOfType(doc, 'inventoryGrid');
    expect(grid?.bindings).toEqual([
      expect.objectContaining({ prop: 'items', dataSourceId: 'inventory.items', path: 'items' }),
    ]);
    const slots = childrenOf(doc, grid?.id ?? '');
    expect(slots).toHaveLength(4);
    slots.forEach((slot, index) => {
      const [view] = childrenOf(doc, slot.id);
      expect(view?.type).toBe('itemView');
      expect(view?.bindings.map((b) => [b.prop, b.path])).toEqual([
        ['icon', `items[${index}].icon`],
        ['quantity', `items[${index}].quantity`],
      ]);
      expect(view?.bindings.every((b) => b.dataSourceId === 'inventory.items')).toBe(true);
      expect(behaviorOf(slot, 'tooltip')?.bindingPath).toBe(`items[${index}]`);
    });
  });
});

describe('inventory.tabs', () => {
  it('creates one tab and one filtered grid per category', () => {
    const { doc } = insert('inventory.tabs');
    const [tabBar] = nodesOfType(doc, 'tabBar');
    const tabs = tabBar && behaviorOf(tabBar, 'tabs');
    expect(tabs?.tabs.map((t) => t.label)).toEqual([
      'Armas',
      'Armaduras',
      'Consumibles',
      'Materiales',
    ]);
    expect(tabs?.initialTabId).toBe(tabs?.tabs[0]?.id);

    for (const tab of tabs?.tabs ?? []) {
      const grid = subtree(doc, tab.contentNodeId).find((n) => n.type === 'inventoryGrid');
      expect(grid?.bindings[0]?.path).toBe(`items[category=${tab.label}]`);
    }
    expect(nodesOfType(doc, 'inventoryGrid')).toHaveLength(4);
  });

  it('applies the filter convention to slot bindings and tooltips', () => {
    const { doc } = insert('inventory.tabs', { categories: ['Armas'], columns: 2, rows: 1 });
    const slots = nodesOfType(doc, 'slot');
    expect(slots).toHaveLength(2);
    const [view] = childrenOf(doc, slots[1]?.id ?? '');
    expect(view?.bindings[0]?.path).toBe('items[category=Armas][1].icon');
    expect(slots[1] && behaviorOf(slots[1], 'tooltip')?.bindingPath).toBe(
      'items[category=Armas][1]',
    );
  });

  it('rejects category names that would break the filter syntax', () => {
    expect(() => insert('inventory.tabs', { categories: ['a]b'] })).toThrow(/invalid/i);
  });
});

describe('inventory.equipment', () => {
  it('creates one equipment slot per slot type that accepts items of that type', () => {
    const { doc } = insert('inventory.equipment');
    const slots = nodesOfType(doc, 'equipmentSlot');
    expect(slots.map((s) => s.props.slotType)).toEqual([
      'head',
      'chest',
      'legs',
      'weapon',
      'offhand',
    ]);
    for (const slot of slots) {
      expect(behaviorOf(slot, 'dragDrop')).toEqual({
        kind: 'dragDrop',
        role: 'target',
        accepts: [slot.props.slotType],
        intentId: 'inventory.equipItem',
      });
    }
  });

  it('only builds the requested slot types, each at its own position', () => {
    const { doc } = insert('inventory.equipment', { slots: ['head', 'weapon'] });
    const slots = nodesOfType(doc, 'equipmentSlot');
    expect(slots.map((s) => s.props.slotType)).toEqual(['head', 'weapon']);
    const [a, b] = slots;
    expect(a && b && (a.layout.x !== b.layout.x || a.layout.y !== b.layout.y)).toBe(true);
  });
});

describe('inventory.list', () => {
  it('builds a vertical scroll of rows plus a search placeholder', () => {
    const { doc } = insert('inventory.list', { rows: 6 });
    const [scroll] = nodesOfType(doc, 'scroll');
    expect(scroll?.props).toEqual({ direction: 'vertical' });
    expect(scroll?.children).toHaveLength(6);
    const texts = nodesOfType(doc, 'text');
    expect(texts.some((t) => /buscar/i.test(t.props.text))).toBe(true);
  });

  it('binds rows to the collection, optionally filtered by category', () => {
    const { doc } = insert('inventory.list', { rows: 2, category: 'Armas' });
    const [scroll] = nodesOfType(doc, 'scroll');
    expect(scroll?.bindings[0]?.path).toBe('items[category=Armas]');
    const paths = subtree(doc, scroll?.children[1] ?? '').flatMap((n) =>
      n.bindings.map((b) => b.path),
    );
    expect(paths).toContain('items[category=Armas][1].name');
  });
});

describe('inventory.grid+equipment', () => {
  it('combines a grid and equipment slots side by side without overlap', () => {
    const { doc } = insert('inventory.grid+equipment');
    const [grid] = nodesOfType(doc, 'inventoryGrid');
    expect(nodesOfType(doc, 'equipmentSlot')).toHaveLength(5);
    expect(nodesOfType(doc, 'slot').length).toBe(
      (grid?.props.columns ?? 0) * (grid?.props.rows ?? 0),
    );
    const equipment = nodesOfType(doc, 'panel').find((p) => p.name === 'Panel de equipamiento');
    expect(equipment).toBeDefined();
    expect(equipment && grid && equipment.layout.x + equipment.layout.width <= grid.layout.x).toBe(
      true,
    );
  });
});
