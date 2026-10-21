import { describe, expect, it } from 'vitest';
import { describeBatch } from './describe';
import { createNode, createScreen } from './factory';
import type { OperationBatch } from './operations';
import { deepFreeze, makeDoc, mutate, nodeOf } from './test-fixtures';

const doc = deepFreeze(makeDoc());

const batch = (
  ops: OperationBatch['ops'],
  source: OperationBatch['source'] = 'ai',
): OperationBatch => ({ id: 'b', label: 'AI edit', source, ops });

describe('describeBatch', () => {
  it('returns nothing for an empty batch', () => {
    expect(describeBatch(doc, batch([]))).toEqual([]);
  });

  it('describes node additions, removals and moves by name', () => {
    const lines = describeBatch(
      doc,
      batch([
        {
          type: 'addNode',
          screenId: 's1',
          node: createNode('button', { id: 'search', name: 'Search' }),
          parentId: 'panel',
        },
        {
          type: 'addNode',
          screenId: 's1',
          node: createNode('button', { id: 'sort', name: 'Sort' }),
          parentId: 'root',
        },
        { type: 'removeNode', screenId: 's1', nodeId: 'slot1' },
        { type: 'removeNode', screenId: 's1', nodeId: 'grid' },
        { type: 'moveNode', screenId: 's1', nodeId: 'tabs', newParentId: 'panel', index: 1 },
      ]),
    );
    expect(lines).toEqual([
      "Add node 'Search' to 'Inventory Panel'",
      "Add node 'Sort' to screen 'Inventory'",
      "Remove node 'Slot 1'",
      "Remove node 'Grid' (and 1 nested node)",
      "Move 'Tabs' into 'Inventory Panel'",
    ]);
  });

  it('describes node updates per changed section', () => {
    const lines = describeBatch(
      doc,
      batch([
        {
          type: 'updateNode',
          screenId: 's1',
          nodeId: 'grid',
          patch: {
            name: 'First',
            style: { fill: '#fff', opacity: 0.5 },
            layout: { x: 3 },
            props: { rows: 6 },
            locked: true,
          },
        },
        { type: 'updateNode', screenId: 's1', nodeId: 'slot2', patch: { locked: null } },
      ]),
    );
    expect(lines).toEqual([
      "Rename 'Grid' to 'First'",
      "Change layout of 'Grid' (x)",
      "Change style of 'Grid' (fill, opacity)",
      "Change properties of 'Grid' (rows)",
      "Lock 'Grid'",
      "Unlock 'Slot 2'",
    ]);
  });

  it('describes behaviors, bindings and document-level changes', () => {
    const lines = describeBatch(
      doc,
      batch([
        {
          type: 'setBehavior',
          screenId: 's1',
          nodeId: 'slot2',
          behavior: { kind: 'select', mode: 'single' },
        },
        {
          type: 'setBehavior',
          screenId: 's1',
          nodeId: 'slot1',
          behavior: { kind: 'dragDrop', role: 'source', intentId: 'i_move' },
        },
        { type: 'removeBehavior', screenId: 's1', nodeId: 'slot1', kind: 'dragDrop' },
        {
          type: 'setBinding',
          screenId: 's1',
          nodeId: 'slot2',
          binding: { id: 'b9', prop: 'icon', dataSourceId: 'ds_inv', path: '1.icon' },
        },
        { type: 'removeBinding', screenId: 's1', nodeId: 'slot1', bindingId: 'b1' },
        { type: 'setToken', group: 'colors', name: 'primary', value: '#fff' },
        { type: 'removeToken', group: 'colors', name: 'primary' },
        { type: 'addScreen', screen: createScreen({ id: 's2', rootId: 'r2', name: 'Equipment' }) },
        { type: 'renameScreen', screenId: 's1', name: 'Bag' },
        { type: 'removeScreen', screenId: 's1' },
        { type: 'removeDataSource', dataSourceId: 'ds_inv' },
        { type: 'removeIntent', intentId: 'i_use' },
      ]),
    );
    expect(lines).toEqual([
      "Add 'select' behavior to 'Slot 2'",
      "Change 'dragDrop' behavior of 'Slot 1'",
      "Remove 'dragDrop' behavior from 'Slot 1'",
      "Bind 'icon' of 'Slot 2' to 'Inventory' (1.icon)",
      "Remove binding 'icon' from 'Slot 1'",
      'Set token colors.primary to #fff',
      'Remove token colors.primary',
      "Add screen 'Equipment'",
      "Rename screen 'Inventory' to 'Bag'",
      "Remove screen 'Bag'",
      "Remove data source 'Inventory'",
      "Remove intent 'inventory.useItem'",
    ]);
  });

  it('resolves names of nodes created earlier in the same batch', () => {
    const lines = describeBatch(
      doc,
      batch([
        {
          type: 'addNode',
          screenId: 's1',
          node: createNode('button', { id: 'search', name: 'Search' }),
          parentId: 'panel',
        },
        { type: 'updateNode', screenId: 's1', nodeId: 'search', patch: { name: 'Find' } },
      ]),
    );
    expect(lines[1]).toBe("Rename 'Search' to 'Find'");
  });

  it('flags operations that would be rejected, with the reason', () => {
    const locked = mutate(doc, (d) => {
      nodeOf(d, 'panel').locked = true;
    });
    const lines = describeBatch(
      locked,
      batch([
        { type: 'updateNode', screenId: 's1', nodeId: 'panel', patch: { style: { fill: '#000' } } },
        { type: 'removeNode', screenId: 's1', nodeId: 'ghost' },
        { type: 'updateNode', screenId: 's1', nodeId: 'slot1', patch: { name: 'Still described' } },
      ]),
    );
    expect(lines[0]).toMatch(/^Change style of 'Inventory Panel' \(fill\) — rejected: .*locked/);
    expect(lines[1]).toMatch(/^Remove node 'ghost' — rejected: /);
    expect(lines[2]).toBe("Rename 'Slot 1' to 'Still described'");
  });

  it('does not mutate the document', () => {
    expect(() =>
      describeBatch(doc, batch([{ type: 'removeNode', screenId: 's1', nodeId: 'grid' }])),
    ).not.toThrow();
  });
});
