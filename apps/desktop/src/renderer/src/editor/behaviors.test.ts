import { describe, expect, it } from 'vitest';
import { applyBatch, type Behavior } from '@forma/design-core';
import { actionLabelBatch, stackBatch, summarizeBehavior } from './behaviors';
import { inventoryDoc, nodesOfType, screenOf } from './testing';

const doc = inventoryDoc();
const screen = screenOf(doc);
const slot = nodesOfType(screen, 'slot')[0]!;
const behaviorOf = <K extends Behavior['kind']>(kind: K) =>
  slot.behaviors.find((b): b is Extract<Behavior, { kind: K }> => b.kind === kind)!;

describe('summarizeBehavior', () => {
  it('describes each behavior kind with its key parameters', () => {
    expect(summarizeBehavior(behaviorOf('stack'))).toBe('Pila · máx. 99 · muestra cantidad');
    expect(summarizeBehavior(behaviorOf('dragDrop'))).toContain('Arrastrar');
    expect(summarizeBehavior(behaviorOf('contextMenu'))).toContain('Usar, Dividir, Soltar');
    expect(summarizeBehavior(behaviorOf('select'))).toContain('simple');
    expect(summarizeBehavior(behaviorOf('tooltip'))).toContain('items[');
    expect(summarizeBehavior(behaviorOf('split'))).toContain('inventory.splitStack');
  });

  it('describes tabs', () => {
    const tabBar = nodesOfType(screen, 'tabBar')[0]!;
    const tabs = tabBar.behaviors.find((b) => b.kind === 'tabs')!;
    expect(summarizeBehavior(tabs)).toContain('4 pestañas');
  });
});

describe('stackBatch', () => {
  it('replaces the stack behavior of the node in one batch', () => {
    const batch = stackBatch(screen, slot.id, { maxStack: 20, showCount: false })!;
    const applied = applyBatch(doc, batch);
    if (!applied.ok) throw new Error(applied.error.message);
    const next = applied.doc.screens[0]!.nodes[slot.id]!;
    expect(next.behaviors.find((b) => b.kind === 'stack')).toEqual({
      kind: 'stack',
      maxStack: 20,
      showCount: false,
    });
    expect(next.behaviors).toHaveLength(slot.behaviors.length);
  });

  it('returns undefined when the node has no stack behavior', () => {
    expect(stackBatch(screen, screen.rootId, { maxStack: 2 })).toBeUndefined();
  });
});

describe('actionLabelBatch', () => {
  it('renames one context menu action keeping the others', () => {
    const batch = actionLabelBatch(screen, slot.id, 'use', 'Consumir')!;
    const applied = applyBatch(doc, batch);
    if (!applied.ok) throw new Error(applied.error.message);
    const menu = applied.doc.screens[0]!.nodes[slot.id]!.behaviors.find(
      (b) => b.kind === 'contextMenu',
    );
    expect(menu?.kind === 'contextMenu' && menu.actions.map((a) => a.label)).toEqual([
      'Consumir',
      'Dividir',
      'Soltar',
    ]);
  });

  it('returns undefined for unknown actions', () => {
    expect(actionLabelBatch(screen, slot.id, 'nope', 'X')).toBeUndefined();
  });
});
