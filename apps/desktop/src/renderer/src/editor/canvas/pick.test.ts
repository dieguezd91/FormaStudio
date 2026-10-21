import { describe, expect, it } from 'vitest';
import { inventoryDoc, nodesOfType, screenOf } from '../testing';
import { pickSelectable } from './pick';

const screen = screenOf(inventoryDoc());

describe('pickSelectable', () => {
  it('maps an item preview to its slot', () => {
    const item = nodesOfType(screen, 'itemView')[0]!;
    expect(pickSelectable(screen, item.id)).toBe(item.parentId);
  });

  it('keeps every other node as is', () => {
    const grid = nodesOfType(screen, 'inventoryGrid')[0]!;
    expect(pickSelectable(screen, grid.id)).toBe(grid.id);
    expect(pickSelectable(screen, 'missing')).toBe('missing');
  });
});
