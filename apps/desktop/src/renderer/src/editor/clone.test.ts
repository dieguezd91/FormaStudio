import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  createSequentialIdGenerator,
  validateDocument,
  type OperationBatch,
} from '@forma/design-core';
import { cloneSubtree, duplicateBatch } from './clone';
import { inventoryDoc, nodesOfType, screenOf, SCREEN_ID } from './testing';

const doc = inventoryDoc();
const screen = screenOf(doc);
const grid = nodesOfType(screen, 'inventoryGrid')[0]!;
const slot = nodesOfType(screen, 'slot')[0]!;

describe('cloneSubtree', () => {
  it('emits parent-first addNode ops with fresh unique ids for the whole subtree', () => {
    const { rootId, ops } = cloneSubtree(screen, slot.id, createSequentialIdGenerator());
    // slot + its itemView
    expect(ops).toHaveLength(2);
    const ids = ops.map((op) => (op.type === 'addNode' ? op.node.id : ''));
    expect(new Set(ids).size).toBe(2);
    expect(ids.some((id) => id in screen.nodes)).toBe(false);
    expect(ids[0]).toBe(rootId);
    const [rootOp, childOp] = ops;
    if (rootOp?.type !== 'addNode' || childOp?.type !== 'addNode') throw new Error('addNode expected');
    expect(childOp.parentId).toBe(rootId);
    expect(rootOp.parentId).toBe(slot.parentId);
    expect(rootOp.node.children).toEqual([]);
  });

  it('places the copy right after the original and marks its name', () => {
    const { ops } = cloneSubtree(screen, slot.id, createSequentialIdGenerator());
    const rootOp = ops[0];
    if (rootOp?.type !== 'addNode') throw new Error('addNode expected');
    const parent = screen.nodes[slot.parentId!]!;
    expect(rootOp.index).toBe(parent.children.indexOf(slot.id) + 1);
    expect(rootOp.node.name).toBe(`${slot.name} (copia)`);
  });

  it('offsets copies placed in absolute containers only', () => {
    const panel = screen.nodes[grid.parentId!]!;
    const { ops } = cloneSubtree(screen, grid.id, createSequentialIdGenerator(), { offset: 16 });
    const rootOp = ops[0];
    if (rootOp?.type !== 'addNode') throw new Error('addNode expected');
    expect(panel.layout.mode).toBe('absolute');
    expect(rootOp.node.layout.x).toBe(grid.layout.x + 16);

    const slotCopy = cloneSubtree(screen, slot.id, createSequentialIdGenerator(), { offset: 16 });
    const slotOp = slotCopy.ops[0];
    if (slotOp?.type !== 'addNode') throw new Error('addNode expected');
    expect(screen.nodes[slot.parentId!]!.layout.mode).toBe('grid');
    expect(slotOp.node.layout.x).toBe(slot.layout.x);
  });

  it('keeps bindings and behaviors of cloned nodes', () => {
    const { ops } = cloneSubtree(screen, slot.id, createSequentialIdGenerator());
    const [rootOp, childOp] = ops;
    if (rootOp?.type !== 'addNode' || childOp?.type !== 'addNode') throw new Error('addNode expected');
    expect(rootOp.node.behaviors).toEqual(slot.behaviors);
    expect(childOp.node.bindings.length).toBeGreaterThan(0);
  });
});

describe('duplicateBatch', () => {
  it('produces a batch that applies cleanly and leaves a valid document', () => {
    const result = duplicateBatch(screen, [grid.id], createSequentialIdGenerator());
    expect(result).toBeDefined();
    const { batch, newRootIds } = result!;
    const applied = applyBatch(doc, batch satisfies OperationBatch);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(validateDocument(applied.doc)).toEqual([]);
    const nextScreen = applied.doc.screens.find((s) => s.id === SCREEN_ID)!;
    expect(Object.keys(nextScreen.nodes).length).toBe(
      Object.keys(screen.nodes).length + 1 + grid.children.length * 2,
    );
    expect(newRootIds).toHaveLength(1);
    expect(nextScreen.nodes[newRootIds[0]!]?.name).toContain('(copia)');
  });

  it('is undone by its inverse batch', () => {
    const { batch } = duplicateBatch(screen, [slot.id], createSequentialIdGenerator())!;
    const applied = applyBatch(doc, batch);
    if (!applied.ok) throw new Error(applied.error.message);
    const undone = applyBatch(applied.doc, applied.inverseBatch);
    expect(undone.ok && undone.doc.screens).toEqual(doc.screens);
  });

  it('skips the root node and nested duplicates', () => {
    expect(duplicateBatch(screen, [screen.rootId], createSequentialIdGenerator())).toBeUndefined();
    const result = duplicateBatch(screen, [slot.id, grid.id], createSequentialIdGenerator());
    // slot is a descendant of grid, so only the grid is cloned
    expect(result?.newRootIds).toHaveLength(1);
  });
});
