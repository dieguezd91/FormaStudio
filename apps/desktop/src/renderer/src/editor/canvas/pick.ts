import type { FormaScreen } from '@forma/design-core';

/**
 * What a click on `nodeId` selects. An item preview sits on top of its slot and covers it
 * completely, so clicking the item selects the slot (where behaviors live); the item itself is
 * reachable from the Capas tree.
 */
export function pickSelectable(screen: FormaScreen, nodeId: string): string {
  const node = screen.nodes[nodeId];
  const parent = node?.parentId ? screen.nodes[node.parentId] : undefined;
  return node?.type === 'itemView' && parent?.type === 'slot' ? parent.id : nodeId;
}
