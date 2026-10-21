import type { Result } from '../result';
import type { FormaDocument, FormaNode, FormaScreen } from '../schema';
import type { BatchSource, Operation } from './schema';

export type OperationErrorCode =
  | 'screenNotFound'
  | 'nodeNotFound'
  | 'itemNotFound'
  | 'duplicateId'
  | 'wouldCreateCycle'
  | 'locked'
  | 'rootImmutable'
  | 'invalidOperation';

export interface OperationError {
  code: OperationErrorCode;
  message: string;
  screenId?: string;
  nodeId?: string;
}

export type ApplyResult =
  { ok: true; doc: FormaDocument; inverse: Operation[] } | { ok: false; error: OperationError };

export interface ApplyContext {
  /** Who is applying the operation; defaults to `manual`. Only `ai` is subject to node locks. */
  source?: BatchSource;
}

export const success = (doc: FormaDocument, inverse: Operation[]): ApplyResult => ({
  ok: true,
  doc,
  inverse,
});

export const failure = (error: OperationError): ApplyResult => ({ ok: false, error });

export const fail = (
  code: OperationErrorCode,
  message: string,
  where: { screenId?: string; nodeId?: string } = {},
): ApplyResult => failure({ code, message, ...where });

export function findScreen(
  doc: FormaDocument,
  screenId: string,
): Result<FormaScreen, OperationError> {
  const screen = doc.screens.find((s) => s.id === screenId);
  return screen
    ? { ok: true, value: screen }
    : {
        ok: false,
        error: {
          code: 'screenNotFound',
          message: `Screen '${screenId}' does not exist.`,
          screenId,
        },
      };
}

export function findNode(screen: FormaScreen, nodeId: string): Result<FormaNode, OperationError> {
  const node = screen.nodes[nodeId];
  return node
    ? { ok: true, value: node }
    : {
        ok: false,
        error: {
          code: 'nodeNotFound',
          message: `Node '${nodeId}' does not exist in screen '${screen.name}'.`,
          screenId: screen.id,
          nodeId,
        },
      };
}

/**
 * Locked nodes are approved work: AI-sourced changes to them are rejected unless the
 * operation sets `force`. Manual and library changes are never blocked. The lock applies to
 * the node itself (properties and child list), not to its unlocked descendants.
 */
export function lockViolation(
  ctx: Required<ApplyContext>,
  force: boolean | undefined,
  screen: FormaScreen,
  nodeIds: readonly string[],
): OperationError | undefined {
  if (ctx.source !== 'ai' || force) return undefined;
  const locked = nodeIds.map((id) => screen.nodes[id]).find((n) => n?.locked);
  if (!locked) return undefined;
  return {
    code: 'locked',
    message: `Node '${locked.name}' is locked; AI changes to it require force: true.`,
    screenId: screen.id,
    nodeId: locked.id,
  };
}

export const clampIndex = (index: number | undefined, length: number): number =>
  index === undefined ? length : Math.min(index, length);

export const insertAt = <T>(list: readonly T[], index: number, item: T): T[] => [
  ...list.slice(0, index),
  item,
  ...list.slice(index),
];

/** Replaces the matching item (keeping its position) or inserts a new one. */
export function upsertBy<T>(
  list: readonly T[],
  item: T,
  matches: (existing: T) => boolean,
  index?: number,
): { list: T[]; previous: T | undefined } {
  const at = list.findIndex(matches);
  if (at >= 0) {
    return { list: list.map((existing, i) => (i === at ? item : existing)), previous: list[at] };
  }
  return { list: insertAt(list, clampIndex(index, list.length), item), previous: undefined };
}

export function removeBy<T>(
  list: readonly T[],
  matches: (existing: T) => boolean,
): { list: T[]; removed: T; index: number } | undefined {
  const index = list.findIndex(matches);
  const removed = list[index];
  if (removed === undefined) return undefined;
  return { list: list.filter((_, i) => i !== index), removed, index };
}

export function replaceScreen(doc: FormaDocument, screen: FormaScreen): FormaDocument {
  return { ...doc, screens: doc.screens.map((s) => (s.id === screen.id ? screen : s)) };
}

/** Returns a copy of the screen with `upserts` stored and `removedIds` dropped. */
export function withNodes(
  screen: FormaScreen,
  upserts: readonly FormaNode[],
  removedIds: readonly string[] = [],
): FormaScreen {
  const nodes = { ...screen.nodes };
  for (const id of removedIds) delete nodes[id];
  for (const node of upserts) nodes[node.id] = node;
  return { ...screen, nodes };
}

/** Node ids of the subtree rooted at `rootId`, parents before children. Cycle-safe. */
export function subtreeIds(screen: FormaScreen, rootId: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id) || !screen.nodes[id]) return;
    seen.add(id);
    ids.push(id);
    for (const child of screen.nodes[id].children) visit(child);
  };
  visit(rootId);
  return ids;
}
