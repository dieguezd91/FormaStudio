import { describe, expect, it } from 'vitest';
import { applyBatch } from '@forma/design-core';
import {
  addScreenBatch,
  layoutBatch,
  removeNodesBatch,
  renameScreenBatch,
  reorderBatch,
  resizeScreenBatch,
  setTokenBatch,
  updateNodeBatch,
} from './batches';
import { inventoryDoc, nodesOfType, screenOf, SCREEN_ID } from './testing';

const doc = inventoryDoc();
const screen = screenOf(doc);
const slots = nodesOfType(screen, 'slot');
const grid = nodesOfType(screen, 'inventoryGrid')[0]!;

describe('updateNodeBatch', () => {
  it('builds a single updateNode operation labelled with the node name', () => {
    const batch = updateNodeBatch(screen, slots[0]!.id, { name: 'Casilla A' }, 'Renombrar');
    expect(batch.source).toBe('manual');
    expect(batch.ops).toEqual([
      { type: 'updateNode', screenId: SCREEN_ID, nodeId: slots[0]!.id, patch: { name: 'Casilla A' } },
    ]);
    expect(batch.label).toContain('Renombrar');
    expect(batch.label).toContain(slots[0]!.name);
  });
});

describe('layoutBatch', () => {
  it('moves several nodes in ONE batch', () => {
    const batch = layoutBatch(screen, [
      { nodeId: slots[0]!.id, layout: { x: 5, y: 6 } },
      { nodeId: slots[1]!.id, layout: { x: 7, y: 8, width: 30, height: 40 } },
    ]);
    expect(batch.ops).toHaveLength(2);
    const applied = applyBatch(doc, batch);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const next = applied.doc.screens[0]!;
    expect(next.nodes[slots[1]!.id]!.layout).toMatchObject({ x: 7, y: 8, width: 30, height: 40 });
  });
});

describe('removeNodesBatch', () => {
  it('drops the root and nodes whose ancestor is also removed', () => {
    const batch = removeNodesBatch(screen, [screen.rootId, grid.id, slots[0]!.id])!;
    expect(batch.ops).toEqual([{ type: 'removeNode', screenId: SCREEN_ID, nodeId: grid.id }]);
  });

  it('returns undefined when nothing can be removed', () => {
    expect(removeNodesBatch(screen, [screen.rootId])).toBeUndefined();
    expect(removeNodesBatch(screen, [])).toBeUndefined();
  });

  it('removes an unlocked node with a manual batch that applies cleanly', () => {
    const batch = removeNodesBatch(screen, [slots[0]!.id])!;
    expect(applyBatch(doc, batch).ok).toBe(true);
  });
});

describe('reorderBatch', () => {
  const parent = screen.nodes[grid.id]!;
  it('moves a node one position down within its parent', () => {
    const batch = reorderBatch(screen, parent.children[0]!, 1)!;
    expect(batch.ops[0]).toMatchObject({
      type: 'moveNode',
      nodeId: parent.children[0],
      newParentId: grid.id,
      index: 1,
    });
    const applied = applyBatch(doc, batch);
    if (!applied.ok) throw new Error(applied.error.message);
    expect(applied.doc.screens[0]!.nodes[grid.id]!.children[1]).toBe(parent.children[0]);
  });

  it('returns undefined at the boundaries', () => {
    expect(reorderBatch(screen, parent.children[0]!, -1)).toBeUndefined();
    expect(reorderBatch(screen, parent.children.at(-1)!, 1)).toBeUndefined();
    expect(reorderBatch(screen, screen.rootId, 1)).toBeUndefined();
  });
});

describe('setTokenBatch', () => {
  it('sets a token as a manual batch', () => {
    const batch = setTokenBatch('colors', 'accent', '#ff0000');
    expect(batch.ops).toEqual([{ type: 'setToken', group: 'colors', name: 'accent', value: '#ff0000' }]);
    expect(batch.source).toBe('manual');
  });
});

describe('screen batches', () => {
  it('resizes a screen (and its root) in one undoable batch, keeping its nodes', () => {
    const batch = resizeScreenBatch(doc, SCREEN_ID, { width: 1280, height: 720 })!;
    const applied = applyBatch(doc, batch);
    if (!applied.ok) throw new Error(applied.error.message);
    const next = applied.doc.screens[0]!;
    expect(next.size).toEqual({ width: 1280, height: 720 });
    expect(next.nodes[next.rootId]!.layout).toMatchObject({ width: 1280, height: 720 });
    expect(Object.keys(next.nodes)).toEqual(Object.keys(screen.nodes));
    expect(applied.doc.screens).toHaveLength(1);
    const undone = applyBatch(applied.doc, applied.inverseBatch);
    expect(undone.ok && undone.doc.screens).toEqual(doc.screens);
  });

  it('keeps the screen position among several screens', () => {
    const two = applyBatch(doc, addScreenBatch(doc));
    if (!two.ok) throw new Error(two.error.message);
    const batch = resizeScreenBatch(two.doc, SCREEN_ID, { width: 1080, height: 1920 })!;
    const applied = applyBatch(two.doc, batch);
    expect(applied.ok && applied.doc.screens[0]?.id).toBe(SCREEN_ID);
  });

  it('renames and adds screens', () => {
    const renamed = applyBatch(doc, renameScreenBatch(screen, 'Mochila'));
    expect(renamed.ok && renamed.doc.screens[0]?.name).toBe('Mochila');
    const added = applyBatch(doc, addScreenBatch(doc));
    expect(added.ok && added.doc.screens).toHaveLength(2);
  });

  it('returns undefined for an unknown screen', () => {
    expect(resizeScreenBatch(doc, 'nope', { width: 1, height: 1 })).toBeUndefined();
  });
});
