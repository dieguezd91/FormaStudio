import { describe, expect, it } from 'vitest';
import { resolveItemPreview } from '@forma/runtime';
import { inventoryDoc, nodesOfType, screenOf } from '../testing';

/** The design canvas shows items through the runtime's resolver (one implementation for all modes). */
describe('resolveItemPreview', () => {
  const doc = inventoryDoc();
  const screen = screenOf(doc);
  const itemViews = nodesOfType(screen, 'itemView');

  it('shows icon, name and quantity of the bound mock item', () => {
    const preview = resolveItemPreview(doc, itemViews[0]!);
    expect(preview).toMatchObject({ name: 'Espada de hierro', quantity: 1, connection: 'simulated' });
    expect(preview?.icon).toContain('espada-de-hierro');
  });

  it('resolves the filtered rows of a later tab', () => {
    const consumable = itemViews.find((n) =>
      n.bindings.some((b) => b.path.startsWith('items[category=Consumibles][0]')),
    )!;
    expect(resolveItemPreview(doc, consumable)).toMatchObject({
      name: 'Poción de vida',
      quantity: 5,
    });
  });

  it('returns undefined when the row does not exist', () => {
    const empty = itemViews.find((n) =>
      n.bindings.some((b) => b.path.startsWith('items[category=Armas][10]')),
    );
    expect(empty).toBeDefined();
    expect(resolveItemPreview(doc, empty!)).toBeUndefined();
  });

  it('returns undefined for a node without bindings', () => {
    expect(resolveItemPreview(doc, screen.nodes[screen.rootId]!)).toBeUndefined();
  });
});
