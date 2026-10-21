import type { FormaDocument, FormaNode } from '../schema';
import { nodeSchema } from '../schema';
import type { NodePatch, Operation } from './schema';
import {
  clampIndex,
  fail,
  failure,
  findNode,
  findScreen,
  insertAt,
  lockViolation,
  removeBy,
  replaceScreen,
  subtreeIds,
  success,
  upsertBy,
  withNodes,
  type ApplyContext,
  type ApplyResult,
  type OperationError,
} from './support';

type Ctx = Required<ApplyContext>;
type Op<T extends Operation['type']> = Extract<Operation, { type: T }>;

export function addNode(doc: FormaDocument, op: Op<'addNode'>, ctx: Ctx): ApplyResult {
  const screen = findScreen(doc, op.screenId);
  if (!screen.ok) return failure(screen.error);
  const parent = findNode(screen.value, op.parentId);
  if (!parent.ok) return failure(parent.error);
  const locked = lockViolation(ctx, op.force, screen.value, [parent.value.id]);
  if (locked) return failure(locked);

  const where = { screenId: op.screenId, nodeId: op.node.id };
  if (screen.value.nodes[op.node.id]) {
    return fail('duplicateId', `Node id '${op.node.id}' already exists in this screen.`, where);
  }
  if (op.node.children.length > 0) {
    return fail(
      'invalidOperation',
      'A node must be added without children; add children separately.',
      where,
    );
  }
  const parsed = nodeSchema.safeParse(op.node);
  if (!parsed.success) {
    return fail(
      'invalidOperation',
      `Invalid node '${op.node.name}': ${parsed.error.issues[0]?.message}`,
      where,
    );
  }

  const node = { ...op.node, parentId: parent.value.id };
  const index = clampIndex(op.index, parent.value.children.length);
  const parentNext = {
    ...parent.value,
    children: insertAt(parent.value.children, index, node.id),
  };
  return success(replaceScreen(doc, withNodes(screen.value, [parentNext, node])), [
    { type: 'removeNode', screenId: op.screenId, nodeId: node.id },
  ]);
}

export function removeNode(doc: FormaDocument, op: Op<'removeNode'>, ctx: Ctx): ApplyResult {
  const screen = findScreen(doc, op.screenId);
  if (!screen.ok) return failure(screen.error);
  const node = findNode(screen.value, op.nodeId);
  if (!node.ok) return failure(node.error);
  const where = { screenId: op.screenId, nodeId: op.nodeId };
  if (op.nodeId === screen.value.rootId) {
    return fail(
      'rootImmutable',
      'The root node of a screen cannot be removed; remove the screen instead.',
      where,
    );
  }
  const parent = node.value.parentId === null ? undefined : screen.value.nodes[node.value.parentId];
  if (!parent) return fail('invalidOperation', `Node '${node.value.name}' has no parent.`, where);

  const ids = subtreeIds(screen.value, op.nodeId);
  const locked = lockViolation(ctx, op.force, screen.value, [...ids, parent.id]);
  if (locked) return failure(locked);

  const parentNext = { ...parent, children: parent.children.filter((id) => id !== op.nodeId) };
  const next = withNodes(screen.value, [parentNext], ids);
  const index = parent.children.indexOf(op.nodeId);
  // Pre-order restores parents first; descendants are appended in their original order.
  const inverse = ids.flatMap((id, i): Operation[] => {
    const original = screen.value.nodes[id];
    if (!original || original.parentId === null) return [];
    return [
      {
        type: 'addNode',
        screenId: op.screenId,
        node: { ...original, children: [] },
        parentId: original.parentId,
        ...(i === 0 ? { index } : {}),
      },
    ];
  });
  return success(replaceScreen(doc, next), inverse);
}

export function moveNode(doc: FormaDocument, op: Op<'moveNode'>, ctx: Ctx): ApplyResult {
  const screen = findScreen(doc, op.screenId);
  if (!screen.ok) return failure(screen.error);
  const node = findNode(screen.value, op.nodeId);
  if (!node.ok) return failure(node.error);
  const newParent = findNode(screen.value, op.newParentId);
  if (!newParent.ok) return failure(newParent.error);
  const where = { screenId: op.screenId, nodeId: op.nodeId };
  if (op.nodeId === screen.value.rootId) {
    return fail('rootImmutable', 'The root node of a screen cannot be moved.', where);
  }
  if (subtreeIds(screen.value, op.nodeId).includes(op.newParentId)) {
    return fail(
      'wouldCreateCycle',
      `Cannot move '${node.value.name}' into '${newParent.value.name}': it is inside the moved subtree.`,
      where,
    );
  }
  const oldParent =
    node.value.parentId === null ? undefined : screen.value.nodes[node.value.parentId];
  if (!oldParent)
    return fail('invalidOperation', `Node '${node.value.name}' has no parent.`, where);
  const locked = lockViolation(ctx, op.force, screen.value, [
    op.nodeId,
    oldParent.id,
    op.newParentId,
  ]);
  if (locked) return failure(locked);

  const oldIndex = oldParent.children.indexOf(op.nodeId);
  const withoutNode = oldParent.children.filter((id) => id !== op.nodeId);
  const sameParent = oldParent.id === newParent.value.id;
  const target = sameParent ? withoutNode : newParent.value.children;
  const insertIndex = clampIndex(op.index, target.length);
  const newParentNext = { ...newParent.value, children: insertAt(target, insertIndex, op.nodeId) };
  const updates: FormaNode[] = [newParentNext, { ...node.value, parentId: op.newParentId }];
  if (!sameParent) updates.push({ ...oldParent, children: withoutNode });
  return success(replaceScreen(doc, withNodes(screen.value, updates)), [
    {
      type: 'moveNode',
      screenId: op.screenId,
      nodeId: op.nodeId,
      newParentId: oldParent.id,
      index: oldIndex,
    },
  ]);
}

/** Applies `edit` to one node after the screen/node/lock checks shared by in-place edits. */
function editNode(
  doc: FormaDocument,
  ctx: Ctx,
  op: { screenId: string; nodeId: string; force?: boolean | undefined },
  edit: (node: FormaNode) => { node: FormaNode; inverse: Operation[] } | OperationError,
): ApplyResult {
  const screen = findScreen(doc, op.screenId);
  if (!screen.ok) return failure(screen.error);
  const node = findNode(screen.value, op.nodeId);
  if (!node.ok) return failure(node.error);
  const locked = lockViolation(ctx, op.force, screen.value, [op.nodeId]);
  if (locked) return failure(locked);
  const edited = edit(node.value);
  if ('code' in edited) return failure(edited);
  return success(replaceScreen(doc, withNodes(screen.value, [edited.node])), edited.inverse);
}

const isEmpty = (value: unknown) => value === undefined || value === null;

/** Shallow merge where `null` deletes a key; also returns the patch that undoes it. */
function mergeSection<T extends object>(
  current: T,
  patch: Record<string, unknown>,
): { merged: T; undo: Record<string, unknown> } {
  const before = current as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...before };
  const undo: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    undo[key] = isEmpty(before[key]) ? null : before[key];
    if (value === null) delete merged[key];
    else merged[key] = value;
  }
  return { merged: merged as T, undo };
}

export function updateNode(doc: FormaDocument, op: Op<'updateNode'>, ctx: Ctx): ApplyResult {
  return editNode(doc, ctx, op, (node) => {
    const { patch } = op;
    const undo: NodePatch = {};
    const candidate: Record<string, unknown> = { ...node };

    if (patch.name !== undefined) {
      candidate.name = patch.name;
      undo.name = node.name;
    }
    for (const section of ['layout', 'style', 'props'] as const) {
      const sectionPatch = patch[section];
      if (!sectionPatch) continue;
      const { merged, undo: sectionUndo } = mergeSection(node[section], sectionPatch);
      candidate[section] = merged;
      Object.assign(undo, { [section]: sectionUndo });
    }
    if (patch.locked !== undefined) {
      if (patch.locked === null) delete candidate.locked;
      else candidate.locked = patch.locked;
      undo.locked = node.locked ?? null;
    }

    const parsed = nodeSchema.safeParse(candidate);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return {
        code: 'invalidOperation',
        message: `Patch makes '${node.name}' invalid: ${issue?.path.join('.')}: ${issue?.message}`,
        screenId: op.screenId,
        nodeId: node.id,
      };
    }
    return {
      node: candidate as FormaNode,
      inverse: [{ type: 'updateNode', screenId: op.screenId, nodeId: node.id, patch: undo }],
    };
  });
}

export function setBehavior(doc: FormaDocument, op: Op<'setBehavior'>, ctx: Ctx): ApplyResult {
  return editNode(doc, ctx, op, (node) => {
    const sameKind = (b: { kind: string }) => b.kind === op.behavior.kind;
    const { list, previous } = upsertBy(node.behaviors, op.behavior, sameKind, op.index);
    const target = { screenId: op.screenId, nodeId: node.id };
    return {
      node: { ...node, behaviors: list },
      inverse: [
        previous
          ? { type: 'setBehavior', ...target, behavior: previous }
          : { type: 'removeBehavior', ...target, kind: op.behavior.kind },
      ],
    };
  });
}

export function removeBehavior(
  doc: FormaDocument,
  op: Op<'removeBehavior'>,
  ctx: Ctx,
): ApplyResult {
  return editNode(doc, ctx, op, (node) => {
    const removal = removeBy(node.behaviors, (b) => b.kind === op.kind);
    if (!removal) {
      return {
        code: 'itemNotFound',
        message: `Node '${node.name}' has no '${op.kind}' behavior.`,
        screenId: op.screenId,
        nodeId: node.id,
      };
    }
    return {
      node: { ...node, behaviors: removal.list },
      inverse: [
        {
          type: 'setBehavior',
          screenId: op.screenId,
          nodeId: node.id,
          behavior: removal.removed,
          index: removal.index,
        },
      ],
    };
  });
}

export function setBinding(doc: FormaDocument, op: Op<'setBinding'>, ctx: Ctx): ApplyResult {
  return editNode(doc, ctx, op, (node) => {
    const sameId = (b: { id: string }) => b.id === op.binding.id;
    const { list, previous } = upsertBy(node.bindings, op.binding, sameId, op.index);
    const target = { screenId: op.screenId, nodeId: node.id };
    return {
      node: { ...node, bindings: list },
      inverse: [
        previous
          ? { type: 'setBinding', ...target, binding: previous }
          : { type: 'removeBinding', ...target, bindingId: op.binding.id },
      ],
    };
  });
}

export function removeBinding(doc: FormaDocument, op: Op<'removeBinding'>, ctx: Ctx): ApplyResult {
  return editNode(doc, ctx, op, (node) => {
    const removal = removeBy(node.bindings, (b) => b.id === op.bindingId);
    if (!removal) {
      return {
        code: 'itemNotFound',
        message: `Node '${node.name}' has no binding '${op.bindingId}'.`,
        screenId: op.screenId,
        nodeId: node.id,
      };
    }
    return {
      node: { ...node, bindings: removal.list },
      inverse: [
        {
          type: 'setBinding',
          screenId: op.screenId,
          nodeId: node.id,
          binding: removal.removed,
          index: removal.index,
        },
      ],
    };
  });
}
