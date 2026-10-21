import type { FormaDocument } from '../schema';
import * as documentOps from './document';
import * as nodeOps from './nodes';
import type { Operation } from './schema';
import type { ApplyContext, ApplyResult } from './support';

export type { ApplyContext, ApplyResult, OperationError, OperationErrorCode } from './support';

/**
 * Applies one operation without mutating `doc`. Returns the new document plus the operations
 * that undo it (apply them in order), or a typed error. Untrusted JSON must be validated with
 * `parseOperationBatch` first; node contents are additionally re-validated here.
 */
export function applyOperation(
  doc: FormaDocument,
  op: Operation,
  context: ApplyContext = {},
): ApplyResult {
  const ctx = { source: context.source ?? 'manual' };
  switch (op.type) {
    case 'addNode':
      return nodeOps.addNode(doc, op, ctx);
    case 'removeNode':
      return nodeOps.removeNode(doc, op, ctx);
    case 'updateNode':
      return nodeOps.updateNode(doc, op, ctx);
    case 'moveNode':
      return nodeOps.moveNode(doc, op, ctx);
    case 'setBehavior':
      return nodeOps.setBehavior(doc, op, ctx);
    case 'removeBehavior':
      return nodeOps.removeBehavior(doc, op, ctx);
    case 'setBinding':
      return nodeOps.setBinding(doc, op, ctx);
    case 'removeBinding':
      return nodeOps.removeBinding(doc, op, ctx);
    case 'setToken':
      return documentOps.setToken(doc, op);
    case 'removeToken':
      return documentOps.removeToken(doc, op);
    case 'addScreen':
      return documentOps.addScreen(doc, op);
    case 'removeScreen':
      return documentOps.removeScreen(doc, op, ctx);
    case 'renameScreen':
      return documentOps.renameScreen(doc, op);
    case 'upsertDataSource':
      return documentOps.upsertDataSource(doc, op);
    case 'removeDataSource':
      return documentOps.removeDataSource(doc, op);
    case 'upsertIntent':
      return documentOps.upsertIntent(doc, op);
    case 'removeIntent':
      return documentOps.removeIntent(doc, op);
  }
}
