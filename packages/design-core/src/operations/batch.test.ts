import { describe, expect, it } from 'vitest';
import { createNode } from '../factory';
import { deepFreeze, makeDoc, mutate, nodeOf } from '../test-fixtures';
import { applyOperation } from './apply';
import { applyBatch } from './batch';
import { operationBatchSchema, parseOperationBatch, type OperationBatch } from './schema';

const doc = makeDoc();
const lockedDoc = mutate(doc, (d) => {
  nodeOf(d, 'panel').locked = true;
});
const lockedGrid = mutate(doc, (d) => {
  nodeOf(d, 'grid').locked = true;
});

const batch = (ops: OperationBatch['ops'], source: OperationBatch['source'] = 'manual') =>
  ({ id: 'b1', label: 'Test batch', source, ops }) satisfies OperationBatch;

describe('applyBatch', () => {
  it('applies operations in order, including ones that depend on earlier ones', () => {
    const result = applyBatch(
      deepFreeze(structuredCopy(doc)),
      batch([
        {
          type: 'addNode',
          screenId: 's1',
          node: createNode('panel', { id: 'search', name: 'Search' }),
          parentId: 'panel',
        },
        {
          type: 'addNode',
          screenId: 's1',
          node: createNode('button', { id: 'go', name: 'Go' }),
          parentId: 'search',
        },
      ]),
    );
    if (!result.ok) throw new Error(result.error.message);
    expect(nodeOf(result.doc, 'search').children).toEqual(['go']);
  });

  it('produces an inverse batch that restores the original document', () => {
    const original = batch([
      { type: 'updateNode', screenId: 's1', nodeId: 'slot1', patch: { name: 'First' } },
      { type: 'moveNode', screenId: 's1', nodeId: 'slot1', newParentId: 'panel', index: 0 },
      { type: 'removeNode', screenId: 's1', nodeId: 'slot2' },
      { type: 'setToken', group: 'colors', name: 'bg', value: '#000' },
    ]);
    const result = applyBatch(doc, original);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.batch).toEqual(original);
    expect(operationBatchSchema.safeParse(result.inverseBatch).success).toBe(true);
    expect(result.inverseBatch.source).toBe('manual');
    expect(result.inverseBatch.id).not.toBe(original.id);

    const undone = applyBatch(result.doc, result.inverseBatch);
    if (!undone.ok) throw new Error(undone.error.message);
    expect(undone.doc).toEqual(doc);
  });

  it('is atomic: a failing op leaves nothing applied and reports its index', () => {
    const result = applyBatch(
      doc,
      batch([
        { type: 'updateNode', screenId: 's1', nodeId: 'slot1', patch: { name: 'Changed' } },
        { type: 'removeNode', screenId: 's1', nodeId: 'missing' },
        { type: 'updateNode', screenId: 's1', nodeId: 'slot2', patch: { name: 'Never' } },
      ]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.opIndex).toBe(1);
      expect(result.error.code).toBe('nodeNotFound');
    }
    expect(nodeOf(doc, 'slot1').name).toBe('Slot 1');
  });

  it('accepts an empty batch', () => {
    const result = applyBatch(doc, batch([]));
    expect(result.ok && result.doc).toBe(doc);
  });
});

describe('locked nodes', () => {
  const rename = (nodeId: string, force?: boolean) =>
    ({
      type: 'updateNode',
      screenId: 's1',
      nodeId,
      patch: { name: 'AI rename' },
      ...(force ? { force } : {}),
    }) as const;

  it('rejects AI modifications of a locked node', () => {
    const result = applyBatch(lockedDoc, batch([rename('panel')], 'ai'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('locked');
      expect(result.error.nodeId).toBe('panel');
      expect(result.error.opIndex).toBe(0);
      expect(result.error.message).toMatch(/Inventory Panel/);
    }
  });

  it('allows AI modifications with force: true', () => {
    const result = applyBatch(lockedDoc, batch([rename('panel', true)], 'ai'));
    expect(result.ok && nodeOf(result.doc, 'panel').name).toBe('AI rename');
  });

  it('allows manual and library modifications of locked nodes', () => {
    for (const source of ['manual', 'library'] as const) {
      const result = applyBatch(lockedDoc, batch([rename('panel')], source));
      expect(result.ok, source).toBe(true);
    }
  });

  it('does not inherit the lock down to unlocked descendants', () => {
    const result = applyBatch(lockedDoc, batch([rename('grid')], 'ai'));
    expect(result.ok).toBe(true);
  });

  it('guards structural edits of a locked container for AI', () => {
    const add = {
      type: 'addNode',
      screenId: 's1',
      node: createNode('slot', { id: 'slot3', name: 'Slot 3' }),
      parentId: 'grid',
    } as const;
    const remove = { type: 'removeNode', screenId: 's1', nodeId: 'slot1' } as const;
    const moveOut = {
      type: 'moveNode',
      screenId: 's1',
      nodeId: 'slot1',
      newParentId: 'panel',
      index: 0,
    } as const;
    for (const op of [add, remove, moveOut]) {
      const result = applyBatch(lockedGrid, batch([op], 'ai'));
      expect(result.ok, op.type).toBe(false);
      expect(!result.ok && result.error.code).toBe('locked');
      expect(applyBatch(lockedGrid, batch([{ ...op, force: true }], 'ai')).ok).toBe(true);
    }
  });

  it('rejects AI removal of a subtree containing a locked node', () => {
    const result = applyBatch(
      lockedGrid,
      batch([{ type: 'removeNode', screenId: 's1', nodeId: 'panel' }], 'ai'),
    );
    expect(!result.ok && result.error.nodeId).toBe('grid');
  });

  it('guards behaviors, bindings and screens for AI', () => {
    const ops: OperationBatch['ops'] = [
      {
        type: 'setBehavior',
        screenId: 's1',
        nodeId: 'panel',
        behavior: { kind: 'select', mode: 'single' },
      },
      { type: 'removeBehavior', screenId: 's1', nodeId: 'panel', kind: 'select' },
      {
        type: 'setBinding',
        screenId: 's1',
        nodeId: 'panel',
        binding: { id: 'x', prop: 'p', dataSourceId: 'ds_inv', path: '' },
      },
      { type: 'removeScreen', screenId: 's1' },
    ];
    for (const op of ops) {
      const result = applyBatch(lockedDoc, batch([op], 'ai'));
      expect(!result.ok && result.error.code, op.type).toBe('locked');
    }
  });

  it('applyOperation defaults to the manual source', () => {
    expect(applyOperation(lockedDoc, rename('panel')).ok).toBe(true);
    expect(applyOperation(lockedDoc, rename('panel'), { source: 'ai' }).ok).toBe(false);
  });

  it('lets the inverse of an AI batch restore state even when nodes got locked meanwhile', () => {
    const applied = applyBatch(doc, batch([rename('panel')], 'ai'));
    if (!applied.ok) throw new Error('unexpected');
    const locked = mutate(applied.doc, (d) => {
      nodeOf(d, 'panel').locked = true;
    });
    expect(applyBatch(locked, applied.inverseBatch).ok).toBe(true);
  });
});

describe('operation schema', () => {
  it('parses a JSON batch as an AI would emit it', () => {
    const raw = JSON.parse(
      JSON.stringify(
        batch(
          [
            {
              type: 'updateNode',
              screenId: 's1',
              nodeId: 'slot1',
              patch: { style: { fill: null } },
            },
            { type: 'setToken', group: 'colors', name: 'x', value: '#fff' },
          ],
          'ai',
        ),
      ),
    );
    const parsed = parseOperationBatch(raw);
    expect(parsed.ok).toBe(true);
  });

  it('returns issues instead of throwing for invalid batches', () => {
    for (const raw of [
      null,
      { id: 'b', label: 'l', source: 'ai', ops: [{ type: 'explode' }] },
      { id: 'b', label: 'l', source: 'robot', ops: [] },
      { id: 'b', label: 'l', source: 'ai', ops: [{ type: 'removeNode', screenId: 's1' }] },
    ]) {
      const parsed = parseOperationBatch(raw);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.error.issues.length).toBeGreaterThan(0);
        expect(parsed.error.message).toBeTruthy();
      }
    }
  });
});

function structuredCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
