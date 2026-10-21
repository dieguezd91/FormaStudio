import { createEmptyDocument, createNode, createScreen } from './factory';
import type { FormaDocument, FormaNode, FormaScreen } from './schema';

/** Deep copy of plain JSON data (the pure ES lib has no structuredClone). */
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Copies `doc`, lets `fn` mutate the copy, and returns it. */
export function mutate(doc: FormaDocument, fn: (draft: FormaDocument) => void): FormaDocument {
  const draft = clone(doc);
  fn(draft);
  return draft;
}

export function screenOf(doc: FormaDocument, id = 's1'): FormaScreen {
  const screen = doc.screens.find((s) => s.id === id);
  if (!screen) throw new Error(`fixture screen ${id} missing`);
  return screen;
}

export function nodeOf(doc: FormaDocument, nodeId: string, screenId = 's1'): FormaNode {
  const node = screenOf(doc, screenId).nodes[nodeId];
  if (!node) throw new Error(`fixture node ${nodeId} missing`);
  return node;
}

/**
 * Valid inventory-ish document:
 * root > panel > (tabs, grid > (slot1, slot2)); intents i_move/i_use; data source ds_inv.
 */
export function makeDoc(): FormaDocument {
  const base = createEmptyDocument({
    id: 'doc',
    name: 'Doc',
    target: { platform: 'unity', ui: 'ugui' },
    now: '2026-10-21T00:00:00.000Z',
  });
  const screen = createScreen({ id: 's1', rootId: 'root', name: 'Inventory' });
  const attach = (node: FormaNode) => {
    const parent = screen.nodes[node.parentId ?? ''];
    if (parent) parent.children.push(node.id);
    screen.nodes[node.id] = node;
  };
  attach(createNode('panel', { id: 'panel', name: 'Inventory Panel', parentId: 'root' }));
  attach(createNode('tabBar', { id: 'tabs', name: 'Tabs', parentId: 'panel' }));
  attach(createNode('inventoryGrid', { id: 'grid', name: 'Grid', parentId: 'panel' }));
  const slot1 = createNode('slot', { id: 'slot1', name: 'Slot 1', parentId: 'grid' });
  slot1.behaviors.push({ kind: 'dragDrop', role: 'both', intentId: 'i_move' });
  slot1.bindings.push({ id: 'b1', prop: 'icon', dataSourceId: 'ds_inv', path: '0.icon' });
  attach(slot1);
  attach(createNode('slot', { id: 'slot2', name: 'Slot 2', parentId: 'grid' }));
  const tabs = screen.nodes['tabs'];
  if (tabs) {
    tabs.behaviors.push({
      kind: 'tabs',
      tabs: [{ id: 't1', label: 'Items', contentNodeId: 'grid' }],
      initialTabId: 't1',
    });
  }
  return {
    ...base,
    screens: [screen],
    intents: [
      {
        id: 'i_move',
        name: 'inventory.moveItem',
        description: 'Move an item',
        payload: [{ name: 'from', type: 'number' }],
        connection: 'simulated',
      },
      {
        id: 'i_use',
        name: 'inventory.useItem',
        description: 'Use an item',
        payload: [],
        connection: 'unconnected',
      },
    ],
    dataSources: [
      {
        id: 'ds_inv',
        name: 'Inventory',
        kind: 'collection',
        fields: [{ name: 'icon', type: 'image' }],
        mock: [{ icon: 'sword.png' }],
        connection: 'simulated',
      },
    ],
  };
}

/** Recursively freezes plain data so accidental mutation throws in strict mode. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
