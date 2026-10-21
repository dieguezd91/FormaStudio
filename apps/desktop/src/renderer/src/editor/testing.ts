import {
  applyBatch,
  createEmptyDocument,
  createScreen,
  createSequentialIdGenerator,
  type FormaDocument,
  type FormaNode,
  type FormaScreen,
} from '@forma/design-core';
import { insertEntry } from '@forma/library';

export const SCREEN_ID = 'screen_1';
export const ROOT_ID = 'root_1';

export function emptyDoc(): FormaDocument {
  const doc = createEmptyDocument({
    name: 'Prueba',
    target: { platform: 'unity', ui: 'ugui' },
    id: 'doc_test',
    now: '2026-01-01T00:00:00.000Z',
  });
  return { ...doc, screens: [createScreen({ name: 'Pantalla 1', id: SCREEN_ID, rootId: ROOT_ID })] };
}

/** A document with one screen holding the library's tabbed inventory (real node ids/bindings). */
export function inventoryDoc(entryId = 'inventory.tabs'): FormaDocument {
  const doc = emptyDoc();
  const inserted = insertEntry(doc, {
    entryId,
    screenId: SCREEN_ID,
    parentId: ROOT_ID,
    idGen: createSequentialIdGenerator(),
  });
  if (!inserted.ok) throw new Error(inserted.error.message);
  const applied = applyBatch(doc, inserted.value);
  if (!applied.ok) throw new Error(applied.error.message);
  return applied.doc;
}

export const screenOf = (doc: FormaDocument): FormaScreen => {
  const screen = doc.screens[0];
  if (!screen) throw new Error('document without screens');
  return screen;
};

export const nodesOfType = <T extends FormaNode['type']>(screen: FormaScreen, type: T) =>
  Object.values(screen.nodes).filter(
    (node): node is Extract<FormaNode, { type: T }> => node.type === type,
  );
