import {
  createId,
  type FormaNode,
  type FormaScreen,
  type IdGenerator,
  type Operation,
  type OperationBatch,
} from '@forma/design-core';
import { makeBatch, topLevelIds } from './batches';

export interface CloneOptions {
  /** Pixels added to x/y of the copy, applied only inside absolutely laid-out containers. */
  offset?: number;
}

export interface Clone {
  rootId: string;
  /** `addNode` operations, parents before children. */
  ops: Operation[];
}

/**
 * Copies a node and its descendants with fresh ids. The copy lands right after the original;
 * bindings, behaviors and styles are kept as they are.
 */
export function cloneSubtree(
  screen: FormaScreen,
  nodeId: string,
  idGen: IdGenerator,
  options: CloneOptions = {},
  taken: Set<string> = new Set(Object.keys(screen.nodes)),
): Clone {
  const original = screen.nodes[nodeId];
  if (!original) throw new Error(`Node '${nodeId}' does not exist in the screen.`);
  const parent = original.parentId ? screen.nodes[original.parentId] : undefined;

  const freshId = (type: string): string => {
    for (;;) {
      const id = createId(type, idGen);
      if (!taken.has(id)) {
        taken.add(id);
        return id;
      }
    }
  };

  const ops: Operation[] = [];
  const copy = (node: FormaNode, parentId: string, index: number | undefined, isRoot: boolean) => {
    const id = freshId(node.type);
    const shift = isRoot && parent?.layout.mode === 'absolute' ? (options.offset ?? 0) : 0;
    const clone = {
      ...structuredClone(node),
      id,
      parentId,
      children: [],
      name: isRoot ? `${node.name} (copia)` : node.name,
      layout: { ...node.layout, x: node.layout.x + shift, y: node.layout.y + shift },
      origin: { ...node.origin },
    } as FormaNode;
    ops.push({
      type: 'addNode',
      screenId: screen.id,
      node: clone,
      parentId,
      ...(index === undefined ? {} : { index }),
    });
    for (const childId of node.children) {
      const child = screen.nodes[childId];
      if (child) copy(child, id, undefined, false);
    }
    return id;
  };

  if (!parent) throw new Error(`Node '${original.name}' has no parent and cannot be duplicated.`);
  const rootId = copy(original, parent.id, parent.children.indexOf(nodeId) + 1, true);
  return { rootId, ops };
}

/** Duplicates the given nodes (skipping the root and nodes nested in other selected ones). */
export function duplicateBatch(
  screen: FormaScreen,
  ids: readonly string[],
  idGen: IdGenerator,
  offset = 16,
): { batch: OperationBatch; newRootIds: string[] } | undefined {
  const targets = topLevelIds(screen, ids);
  if (targets.length === 0) return undefined;
  const taken = new Set(Object.keys(screen.nodes));
  const ops: Operation[] = [];
  const newRootIds: string[] = [];
  for (const id of targets) {
    const clone = cloneSubtree(screen, id, idGen, { offset }, taken);
    ops.push(...clone.ops);
    newRootIds.push(clone.rootId);
  }
  const [first] = targets;
  const label =
    targets.length === 1 && first
      ? `Duplicar '${screen.nodes[first]?.name ?? first}'`
      : `Duplicar ${targets.length} elementos`;
  return { batch: makeBatch(label, ops), newRootIds };
}
