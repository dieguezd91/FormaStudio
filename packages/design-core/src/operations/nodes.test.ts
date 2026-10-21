import { describe, expect, it } from 'vitest';
import { createNode } from '../factory';
import { makeDoc, nodeOf, screenOf } from '../test-fixtures';
import { validateDocument } from '../validate';
import { applyOperation } from './apply';
import { expectRoundTrip } from './testing';

const doc = makeDoc();
const newSlot = (id = 'slot3') => createNode('slot', { id, name: 'Slot 3' });

function failure(op: Parameters<typeof applyOperation>[1], source: 'manual' | 'ai' = 'manual') {
  const result = applyOperation(doc, op, { source });
  if (result.ok) throw new Error('expected failure');
  return result.error;
}

describe('addNode', () => {
  it('appends under the parent and fixes parentId', () => {
    const after = expectRoundTrip(doc, {
      type: 'addNode',
      screenId: 's1',
      node: newSlot(),
      parentId: 'grid',
    });
    expect(nodeOf(after, 'grid').children).toEqual(['slot1', 'slot2', 'slot3']);
    expect(nodeOf(after, 'slot3').parentId).toBe('grid');
    expect(validateDocument(after)).toEqual([]);
  });

  it('inserts at an index and clamps out-of-range indexes', () => {
    const at = expectRoundTrip(doc, {
      type: 'addNode',
      screenId: 's1',
      node: newSlot(),
      parentId: 'grid',
      index: 1,
    });
    expect(nodeOf(at, 'grid').children).toEqual(['slot1', 'slot3', 'slot2']);
    const clamped = expectRoundTrip(doc, {
      type: 'addNode',
      screenId: 's1',
      node: newSlot(),
      parentId: 'grid',
      index: 99,
    });
    expect(nodeOf(clamped, 'grid').children).toEqual(['slot1', 'slot2', 'slot3']);
  });

  it('rejects unknown screens/parents, duplicate ids, nested nodes and invalid nodes', () => {
    const base = { type: 'addNode', screenId: 's1', node: newSlot(), parentId: 'grid' } as const;
    expect(failure({ ...base, screenId: 'nope' }).code).toBe('screenNotFound');
    expect(failure({ ...base, parentId: 'nope' }).code).toBe('nodeNotFound');
    expect(failure({ ...base, node: newSlot('slot1') }).code).toBe('duplicateId');
    expect(failure({ ...base, node: { ...newSlot(), children: ['x'] } }).code).toBe(
      'invalidOperation',
    );
    const invalid = { ...newSlot(), props: { bogus: 1 } } as unknown as typeof base.node;
    expect(failure({ ...base, node: invalid }).code).toBe('invalidOperation');
  });

  it('reports errors with the offending ids', () => {
    const error = failure({
      type: 'addNode',
      screenId: 's1',
      node: newSlot(),
      parentId: 'nope',
    });
    expect(error.nodeId).toBe('nope');
    expect(error.screenId).toBe('s1');
    expect(error.message).toMatch(/nope/);
  });
});

describe('removeNode', () => {
  it('removes a leaf and restores it at the same index', () => {
    const after = expectRoundTrip(doc, { type: 'removeNode', screenId: 's1', nodeId: 'slot1' });
    expect(nodeOf(after, 'grid').children).toEqual(['slot2']);
    expect(screenOf(after).nodes['slot1']).toBeUndefined();
  });

  it('removes the whole subtree and restores it', () => {
    const after = expectRoundTrip(doc, { type: 'removeNode', screenId: 's1', nodeId: 'grid' });
    const ids = Object.keys(screenOf(after).nodes).sort();
    expect(ids).toEqual(['panel', 'root', 'tabs']);
    expect(validateDocument(after).map((i) => i.code)).toContain('unresolvedReference');
  });

  it('rejects the root and unknown nodes', () => {
    expect(failure({ type: 'removeNode', screenId: 's1', nodeId: 'root' }).code).toBe(
      'rootImmutable',
    );
    expect(failure({ type: 'removeNode', screenId: 's1', nodeId: 'zzz' }).code).toBe(
      'nodeNotFound',
    );
  });
});

describe('updateNode', () => {
  it('shallow-merges each section and restores the previous values', () => {
    const after = expectRoundTrip(doc, {
      type: 'updateNode',
      screenId: 's1',
      nodeId: 'panel',
      patch: {
        name: 'Backpack',
        layout: { x: 10 },
        style: { fill: { token: 'colors.bg' }, opacity: 0.5 },
        locked: true,
      },
    });
    const node = nodeOf(after, 'panel');
    expect(node.name).toBe('Backpack');
    expect(node.layout).toMatchObject({ x: 10, width: 100, mode: 'absolute' });
    expect(node.style).toEqual({ fill: { token: 'colors.bg' }, opacity: 0.5 });
    expect(node.locked).toBe(true);
  });

  it('merges props and removes optional keys with null', () => {
    const withAsset = expectRoundTrip(doc, {
      type: 'updateNode',
      screenId: 's1',
      nodeId: 'grid',
      patch: { props: { rows: 6 } },
    });
    expect(nodeOf(withAsset, 'grid').props).toMatchObject({ rows: 6, columns: 5 });

    const styled = expectRoundTrip(doc, {
      type: 'updateNode',
      screenId: 's1',
      nodeId: 'panel',
      patch: { style: { fill: '#fff' } },
    });
    const cleared = expectRoundTrip(styled, {
      type: 'updateNode',
      screenId: 's1',
      nodeId: 'panel',
      patch: { style: { fill: null } },
    });
    expect(nodeOf(cleared, 'panel').style).toEqual({});
  });

  it('rejects patches that make the node invalid, leaving the document untouched', () => {
    const base = { type: 'updateNode', screenId: 's1', nodeId: 'grid' } as const;
    expect(failure({ ...base, patch: { props: { rows: 0 } } }).code).toBe('invalidOperation');
    expect(failure({ ...base, patch: { props: { unknown: 1 } } }).code).toBe('invalidOperation');
    expect(failure({ ...base, patch: { layout: { width: null } } }).code).toBe('invalidOperation');
    expect(failure({ ...base, nodeId: 'zzz', patch: { name: 'x' } }).code).toBe('nodeNotFound');
  });
});

describe('moveNode', () => {
  it('re-parents a node at an index', () => {
    const after = expectRoundTrip(doc, {
      type: 'moveNode',
      screenId: 's1',
      nodeId: 'slot1',
      newParentId: 'panel',
      index: 0,
    });
    expect(nodeOf(after, 'panel').children).toEqual(['slot1', 'tabs', 'grid']);
    expect(nodeOf(after, 'grid').children).toEqual(['slot2']);
    expect(nodeOf(after, 'slot1').parentId).toBe('panel');
    expect(validateDocument(after)).toEqual([]);
  });

  it('reorders within the same parent (index is relative to the list without the node)', () => {
    const after = expectRoundTrip(doc, {
      type: 'moveNode',
      screenId: 's1',
      nodeId: 'slot1',
      newParentId: 'grid',
      index: 1,
    });
    expect(nodeOf(after, 'grid').children).toEqual(['slot2', 'slot1']);
  });

  it('rejects cycles, the root and unknown targets', () => {
    const base = { type: 'moveNode', screenId: 's1', index: 0 } as const;
    expect(failure({ ...base, nodeId: 'grid', newParentId: 'slot1' }).code).toBe(
      'wouldCreateCycle',
    );
    expect(failure({ ...base, nodeId: 'grid', newParentId: 'grid' }).code).toBe('wouldCreateCycle');
    expect(failure({ ...base, nodeId: 'root', newParentId: 'panel' }).code).toBe('rootImmutable');
    expect(failure({ ...base, nodeId: 'slot1', newParentId: 'zzz' }).code).toBe('nodeNotFound');
  });
});

describe('behaviors and bindings', () => {
  const selectBehavior = { kind: 'select', mode: 'multi' } as const;

  it('inserts a behavior and removes it again', () => {
    const after = expectRoundTrip(doc, {
      type: 'setBehavior',
      screenId: 's1',
      nodeId: 'slot2',
      behavior: selectBehavior,
    });
    expect(nodeOf(after, 'slot2').behaviors).toEqual([selectBehavior]);
  });

  it('upserts by kind, replacing in place', () => {
    const after = expectRoundTrip(doc, {
      type: 'setBehavior',
      screenId: 's1',
      nodeId: 'slot1',
      behavior: { kind: 'dragDrop', role: 'source', intentId: 'i_move' },
    });
    expect(nodeOf(after, 'slot1').behaviors).toEqual([
      { kind: 'dragDrop', role: 'source', intentId: 'i_move' },
    ]);
  });

  it('restores a removed behavior at its original position', () => {
    const two = expectRoundTrip(doc, {
      type: 'setBehavior',
      screenId: 's1',
      nodeId: 'slot1',
      behavior: selectBehavior,
    });
    const after = expectRoundTrip(two, {
      type: 'removeBehavior',
      screenId: 's1',
      nodeId: 'slot1',
      kind: 'dragDrop',
    });
    expect(nodeOf(after, 'slot1').behaviors).toEqual([selectBehavior]);
  });

  it('rejects removing a behavior or binding that does not exist', () => {
    expect(
      failure({ type: 'removeBehavior', screenId: 's1', nodeId: 'slot2', kind: 'stack' }).code,
    ).toBe('itemNotFound');
    expect(
      failure({ type: 'removeBinding', screenId: 's1', nodeId: 'slot2', bindingId: 'b1' }).code,
    ).toBe('itemNotFound');
  });

  it('upserts and removes bindings by id', () => {
    const added = expectRoundTrip(doc, {
      type: 'setBinding',
      screenId: 's1',
      nodeId: 'slot1',
      binding: { id: 'b2', prop: 'name', dataSourceId: 'ds_inv', path: '0.name' },
    });
    expect(nodeOf(added, 'slot1').bindings).toHaveLength(2);
    const replaced = expectRoundTrip(added, {
      type: 'setBinding',
      screenId: 's1',
      nodeId: 'slot1',
      binding: { id: 'b1', prop: 'icon', dataSourceId: 'ds_inv', path: '1.icon' },
    });
    expect(nodeOf(replaced, 'slot1').bindings[0]?.path).toBe('1.icon');
    const removed = expectRoundTrip(added, {
      type: 'removeBinding',
      screenId: 's1',
      nodeId: 'slot1',
      bindingId: 'b1',
    });
    expect(nodeOf(removed, 'slot1').bindings.map((b) => b.id)).toEqual(['b2']);
  });
});

describe('structural sharing', () => {
  it('keeps untouched screens and nodes by reference', () => {
    const two = {
      ...doc,
      screens: [...doc.screens, { ...screenOf(doc), id: 's2', name: 'Other' }],
    };
    const result = applyOperation(two, {
      type: 'updateNode',
      screenId: 's1',
      nodeId: 'slot2',
      patch: { name: 'Renamed' },
    });
    if (!result.ok) throw new Error('unexpected');
    expect(result.doc.screens[1]).toBe(two.screens[1]);
    expect(nodeOf(result.doc, 'slot1')).toBe(nodeOf(two, 'slot1'));
    expect(result.doc).not.toBe(two);
  });
});
