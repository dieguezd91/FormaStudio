import {
  applyBatch,
  createEmptyDocument,
  createScreen,
  createSequentialIdGenerator,
  type DataSource,
  type FormaDocument,
  type FormaNode,
  type FormaScreen,
} from '@forma/design-core';
import { insertEntry } from '@forma/library';
import { createRuntime } from './runtime';
import type { DataRecord, Runtime, RuntimeOptions } from './types';

export const SCREEN_ID = 's1';
export const ROOT_ID = 'root';

/** An empty document with one screen, then a real library entry inserted into it. */
export function buildDoc(entryId: string, params?: Record<string, unknown>): FormaDocument {
  const empty = createEmptyDocument({
    id: 'doc',
    name: 'Doc',
    target: { platform: 'unity', ui: 'ugui' },
    now: '2026-10-21T00:00:00.000Z',
  });
  const doc = {
    ...empty,
    screens: [createScreen({ id: SCREEN_ID, rootId: ROOT_ID, name: 'Pantalla' })],
  };
  const inserted = insertEntry(doc, {
    entryId,
    screenId: SCREEN_ID,
    parentId: ROOT_ID,
    ...(params === undefined ? {} : { params }),
    idGen: createSequentialIdGenerator(),
  });
  if (!inserted.ok) throw new Error(inserted.error.message);
  const applied = applyBatch(doc, inserted.value);
  if (!applied.ok) throw new Error(applied.error.message);
  return applied.doc;
}

export const screenOf = (doc: FormaDocument): FormaScreen => {
  const screen = doc.screens.find((s) => s.id === SCREEN_ID);
  if (!screen) throw new Error('no screen');
  return screen;
};

export function nodeOf(doc: FormaDocument, id: string): FormaNode {
  const node = screenOf(doc).nodes[id];
  if (!node) throw new Error(`no node ${id}`);
  return node;
}

/** Descendants of `rootId` (itself included) in tree order. */
export function subtreeOf(doc: FormaDocument, rootId: string): FormaNode[] {
  const out: FormaNode[] = [];
  const visit = (id: string) => {
    const node = nodeOf(doc, id);
    out.push(node);
    node.children.forEach(visit);
  };
  visit(rootId);
  return out;
}

export const idsOfType = (doc: FormaDocument, type: FormaNode['type'], rootId = ROOT_ID) =>
  subtreeOf(doc, rootId)
    .filter((n) => n.type === type)
    .map((n) => n.id);

/** The `itemView` inside a slot. */
export function itemViewOf(doc: FormaDocument, slotId: string): string {
  const view = nodeOf(doc, slotId).children.find((id) => nodeOf(doc, id).type === 'itemView');
  if (!view) throw new Error(`slot ${slotId} has no itemView`);
  return view;
}

export function tabBarOf(doc: FormaDocument): {
  id: string;
  contentIds: string[];
  buttonIds: string[];
} {
  const bar = subtreeOf(doc, ROOT_ID).find((n) => n.behaviors.some((b) => b.kind === 'tabs'));
  const tabs = bar?.behaviors.find((b) => b.kind === 'tabs');
  if (!bar || tabs?.kind !== 'tabs') throw new Error('no tab bar');
  return {
    id: bar.id,
    contentIds: tabs.tabs.map((t) => t.contentNodeId),
    buttonIds: bar.children,
  };
}

/** Replaces the mock rows of the items data source (returns a new document). */
export function withItems(doc: FormaDocument, items: DataRecord[]): FormaDocument {
  return {
    ...doc,
    dataSources: doc.dataSources.map((d) =>
      d.id === 'inventory.items' ? { ...d, mock: items as unknown as DataSource['mock'] } : d,
    ),
  };
}

export function withConnection(
  doc: FormaDocument,
  intentId: string,
  connection: 'simulated' | 'unconnected' | 'connected',
): FormaDocument {
  return {
    ...doc,
    intents: doc.intents.map((i) => (i.id === intentId ? { ...i, connection } : i)),
  };
}

export const rec = (id: string, overrides: DataRecord = {}): DataRecord => ({
  id,
  name: id,
  icon: `mock/icons/${id}.png`,
  quantity: 1,
  maxStack: 1,
  category: 'Materiales',
  slotType: 'none',
  rarity: 'común',
  ...overrides,
});

export const iconOf = (id: string) => `mock/icons/${id}.png`;

export function start(doc: FormaDocument, options?: RuntimeOptions): Runtime {
  return createRuntime(doc, SCREEN_ID, options);
}

export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** Returns a new document where `fn` has rewritten one node. */
export function patchNode(
  doc: FormaDocument,
  id: string,
  fn: (node: FormaNode) => FormaNode,
): FormaDocument {
  return {
    ...doc,
    screens: doc.screens.map((s) =>
      s.id === SCREEN_ID ? { ...s, nodes: { ...s.nodes, [id]: fn(nodeOf(doc, id)) } } : s,
    ),
  };
}
