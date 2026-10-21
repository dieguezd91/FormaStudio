import {
  applyBatch,
  createEmptyDocument,
  createScreen,
  createSequentialIdGenerator,
  validateDocument,
  type FormaDocument,
  type FormaNode,
  type OperationBatch,
} from '@forma/design-core';
import { expect } from 'vitest';
import { insertEntry } from './insert';

export const SCREEN_ID = 's1';
export const ROOT_ID = 'root';

export function makeBaseDoc(): FormaDocument {
  const doc = createEmptyDocument({
    id: 'doc',
    name: 'Doc',
    target: { platform: 'unity', ui: 'ugui' },
    now: '2026-10-21T00:00:00.000Z',
  });
  return { ...doc, screens: [createScreen({ id: SCREEN_ID, rootId: ROOT_ID, name: 'Pantalla' })] };
}

export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export interface Inserted {
  doc: FormaDocument;
  batch: OperationBatch;
  inverseBatch: OperationBatch;
  rootNodeId: string;
}

/** Inserts an entry into `doc`, applies the batch, and returns the result (throws on any failure). */
export function insertAndApply(
  doc: FormaDocument,
  entryId: string,
  params?: Record<string, unknown>,
  idGen = createSequentialIdGenerator(),
): Inserted {
  const inserted = insertEntry(doc, {
    entryId,
    screenId: SCREEN_ID,
    parentId: ROOT_ID,
    ...(params === undefined ? {} : { params }),
    idGen,
  });
  if (!inserted.ok) throw new Error(`insert failed: ${inserted.error.message}`);
  const applied = applyBatch(doc, inserted.value);
  if (!applied.ok) throw new Error(`apply failed: ${applied.error.message}`);
  expect(validateDocument(applied.doc)).toEqual([]);
  const rootOp = inserted.value.ops.find((op) => op.type === 'addNode' && op.parentId === ROOT_ID);
  if (rootOp?.type !== 'addNode') throw new Error('no root addNode op');
  return {
    doc: applied.doc,
    batch: inserted.value,
    inverseBatch: applied.inverseBatch,
    rootNodeId: rootOp.node.id,
  };
}

export function nodesOf(doc: FormaDocument, screenId = SCREEN_ID): FormaNode[] {
  const screen = doc.screens.find((s) => s.id === screenId);
  return screen ? Object.values(screen.nodes) : [];
}

export function nodesOfType<T extends FormaNode['type']>(
  doc: FormaDocument,
  type: T,
): Extract<FormaNode, { type: T }>[] {
  return nodesOf(doc).filter((n): n is Extract<FormaNode, { type: T }> => n.type === type);
}

export function subtree(doc: FormaDocument, rootId: string): FormaNode[] {
  const screen = doc.screens.find((s) => s.id === SCREEN_ID);
  const out: FormaNode[] = [];
  const visit = (id: string) => {
    const node = screen?.nodes[id];
    if (!node) return;
    out.push(node);
    node.children.forEach(visit);
  };
  visit(rootId);
  return out;
}

export const EXPECTED_IDS = [
  'button',
  'text',
  'panel',
  'tabBar',
  'contextMenu',
  'tooltip',
  'inventory.grid',
  'inventory.tabs',
  'inventory.equipment',
  'inventory.list',
  'inventory.grid+equipment',
] as const;
