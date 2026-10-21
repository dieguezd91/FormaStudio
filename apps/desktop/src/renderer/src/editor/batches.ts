import {
  createId,
  createScreen,
  type FormaDocument,
  type FormaScreen,
  type NodePatch,
  type Operation,
  type OperationBatch,
  type Size,
  type TokenGroup,
} from '@forma/design-core';

/** Manual batches: everything the editor UI changes goes through one of these builders. */
export function makeBatch(label: string, ops: Operation[]): OperationBatch {
  return { id: createId('batch'), label, source: 'manual', ops };
}

const nameOf = (screen: FormaScreen, nodeId: string): string => screen.nodes[nodeId]?.name ?? nodeId;

export function updateNodeBatch(
  screen: FormaScreen,
  nodeId: string,
  patch: NodePatch,
  action = 'Editar',
): OperationBatch {
  return makeBatch(`${action} '${nameOf(screen, nodeId)}'`, [
    { type: 'updateNode', screenId: screen.id, nodeId, patch },
  ]);
}

export interface LayoutUpdate {
  nodeId: string;
  layout: { x?: number; y?: number; width?: number; height?: number };
}

/** One batch for any number of moved/resized nodes, so a drag is a single undo step. */
export function layoutBatch(
  screen: FormaScreen,
  updates: readonly LayoutUpdate[],
  action = 'Mover',
): OperationBatch {
  const first = updates[0];
  const label =
    updates.length === 1 && first
      ? `${action} '${nameOf(screen, first.nodeId)}'`
      : `${action} ${updates.length} elementos`;
  return makeBatch(
    label,
    updates.map(({ nodeId, layout }) => ({
      type: 'updateNode',
      screenId: screen.id,
      nodeId,
      patch: { layout },
    })),
  );
}

/** Ids from `ids` that exist, are not the root, and do not sit inside another listed node. */
export function topLevelIds(screen: FormaScreen, ids: readonly string[]): string[] {
  const wanted = new Set(ids.filter((id) => id !== screen.rootId));
  return ids.filter((id) => {
    if (id === screen.rootId || !screen.nodes[id]) return false;
    let parent: string | null | undefined = screen.nodes[id]?.parentId;
    for (; parent; parent = screen.nodes[parent]?.parentId) {
      if (wanted.has(parent)) return false;
    }
    return true;
  });
}

export function removeNodesBatch(
  screen: FormaScreen,
  ids: readonly string[],
): OperationBatch | undefined {
  const targets = topLevelIds(screen, ids);
  const [only] = targets;
  if (only === undefined) return undefined;
  const label =
    targets.length === 1 ? `Eliminar '${nameOf(screen, only)}'` : `Eliminar ${targets.length} elementos`;
  return makeBatch(
    label,
    targets.map((nodeId) => ({ type: 'removeNode', screenId: screen.id, nodeId })),
  );
}

/** Moves a node `delta` positions among its siblings; undefined at the ends of the list. */
export function reorderBatch(
  screen: FormaScreen,
  nodeId: string,
  delta: -1 | 1,
): OperationBatch | undefined {
  const node = screen.nodes[nodeId];
  const parent = node?.parentId ? screen.nodes[node.parentId] : undefined;
  if (!node || !parent) return undefined;
  const index = parent.children.indexOf(nodeId) + delta;
  if (index < 0 || index >= parent.children.length) return undefined;
  return makeBatch(`Reordenar '${node.name}'`, [
    { type: 'moveNode', screenId: screen.id, nodeId, newParentId: parent.id, index },
  ]);
}

export function setTokenBatch(group: TokenGroup, name: string, value: string | number) {
  return makeBatch(`Cambiar token ${group}.${name}`, [{ type: 'setToken', group, name, value }]);
}

export const SCREEN_PRESETS: readonly { label: string; size: Size }[] = [
  { label: '1920 × 1080', size: { width: 1920, height: 1080 } },
  { label: '1280 × 720', size: { width: 1280, height: 720 } },
  { label: '2560 × 1440', size: { width: 2560, height: 1440 } },
  { label: '1080 × 1920 (móvil vertical)', size: { width: 1080, height: 1920 } },
];

export function renameScreenBatch(screen: FormaScreen, name: string): OperationBatch {
  return makeBatch(`Renombrar pantalla '${screen.name}'`, [
    { type: 'renameScreen', screenId: screen.id, name },
  ]);
}

export function addScreenBatch(doc: FormaDocument): OperationBatch {
  const screen = createScreen({ name: `Pantalla ${doc.screens.length + 1}` });
  return makeBatch(`Agregar pantalla '${screen.name}'`, [{ type: 'addScreen', screen }]);
}

/**
 * The document has no "resize screen" operation, so the screen is swapped for a copy with the new
 * size inside one batch (one undo step). The stretched root follows the screen size.
 */
export function resizeScreenBatch(
  doc: FormaDocument,
  screenId: string,
  size: Size,
): OperationBatch | undefined {
  const index = doc.screens.findIndex((s) => s.id === screenId);
  const screen = doc.screens[index];
  const root = screen?.nodes[screen.rootId];
  if (!screen || !root) return undefined;
  const resized: FormaScreen = {
    ...screen,
    size,
    nodes: {
      ...screen.nodes,
      [root.id]: { ...root, layout: { ...root.layout, width: size.width, height: size.height } },
    },
  };
  return makeBatch(`Cambiar tamaño de '${screen.name}' a ${size.width}×${size.height}`, [
    { type: 'removeScreen', screenId },
    { type: 'addScreen', screen: resized, index },
  ]);
}
