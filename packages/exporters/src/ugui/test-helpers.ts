import {
  applyBatch,
  createEmptyDocument,
  createNode,
  createScreen,
  createSequentialIdGenerator,
  type FormaDocument,
  type FormaNode,
  type Layout,
  type NodeStyle,
} from '@forma/design-core';
import { insertEntry, listEntries } from '@forma/library';
import type { ExportMeta } from '../types';

export const SCREEN_ID = 's1';
export const ROOT_ID = 'root';

export const META: ExportMeta = {
  projectId: 'proj_1',
  projectName: 'Proyecto de prueba',
  documentRevision: 7,
  exportedAt: '2026-10-22T10:00:00.000Z',
};

export function makeBaseDoc(): FormaDocument {
  const doc = createEmptyDocument({
    id: 'doc',
    name: 'Doc',
    target: { platform: 'unity', ui: 'ugui' },
    now: '2026-10-22T00:00:00.000Z',
  });
  return {
    ...doc,
    screens: [createScreen({ id: SCREEN_ID, rootId: ROOT_ID, name: 'Inventario' })],
  };
}

/** Inserts a library entry under the screen root and returns the resulting document. */
export function withEntry(
  doc: FormaDocument,
  entryId: string,
  params?: Record<string, unknown>,
): FormaDocument {
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

export const entryIds = (): string[] => listEntries().map((e) => e.id);
export const inventoryEntryIds = (): string[] =>
  entryIds().filter((id) => id.startsWith('inventory.'));

/** Adds `node` under `parentId` directly in the fixture screen (no operation machinery needed). */
export function withNode(
  doc: FormaDocument,
  init: {
    id: string;
    parentId?: string;
    type?: FormaNode['type'];
    layout?: Partial<Layout>;
    style?: NodeStyle;
    name?: string;
  },
): FormaDocument {
  const parentId = init.parentId ?? ROOT_ID;
  const node = createNode(init.type ?? 'panel', {
    id: init.id,
    name: init.name ?? init.id,
    parentId,
    layout: init.layout,
    style: init.style,
  });
  return {
    ...doc,
    screens: doc.screens.map((screen) =>
      screen.id === SCREEN_ID
        ? {
            ...screen,
            nodes: {
              ...screen.nodes,
              [init.id]: node,
              [parentId]: {
                ...screen.nodes[parentId]!,
                children: [...screen.nodes[parentId]!.children, init.id],
              },
            },
          }
        : screen,
    ),
  };
}
