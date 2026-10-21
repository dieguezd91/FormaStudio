import { describe, expect, it } from 'vitest';
import { insertionParent } from './insert';
import { inventoryDoc, nodesOfType, screenOf } from '../testing';

const screen = screenOf(inventoryDoc());

describe('insertionParent', () => {
  it('uses the screen root without a selection or with several nodes selected', () => {
    expect(insertionParent(screen, [])).toBe(screen.rootId);
    const slots = nodesOfType(screen, 'slot');
    expect(insertionParent(screen, [slots[0]!.id, slots[1]!.id])).toBe(screen.rootId);
  });

  it('uses a selected container as is', () => {
    const panel = nodesOfType(screen, 'panel')[0]!;
    expect(insertionParent(screen, [panel.id])).toBe(panel.id);
  });

  it('climbs from a non-container to the closest container', () => {
    const slot = nodesOfType(screen, 'slot')[0]!;
    const container = insertionParent(screen, [slot.id]);
    expect(screen.nodes[container]?.type).toBe('panel');
  });
});
