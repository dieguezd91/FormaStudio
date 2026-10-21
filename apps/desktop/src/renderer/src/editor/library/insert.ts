import type { FormaScreen, NodeType } from '@forma/design-core';

const CONTAINERS: ReadonlySet<NodeType> = new Set(['frame', 'panel', 'scroll']);

/**
 * Where a library entry goes: the selected container, else the closest container above the
 * selection, else the screen root.
 */
export function insertionParent(screen: FormaScreen, selection: readonly string[]): string {
  const [first] = selection;
  if (selection.length !== 1 || !first) return screen.rootId;
  for (let id: string | null = first; id; id = screen.nodes[id]?.parentId ?? null) {
    const node = screen.nodes[id];
    if (node && CONTAINERS.has(node.type)) return node.id;
  }
  return screen.rootId;
}
