import type { FormaDocument } from '../schema';
import { applyOperation } from './apply';
import type { Operation, OperationBatch } from './schema';
import type { OperationError } from './support';

export interface BatchError extends OperationError {
  /** Index in `batch.ops` of the operation that failed. */
  opIndex: number;
}

export type BatchResult =
  | { ok: true; doc: FormaDocument; batch: OperationBatch; inverseBatch: OperationBatch }
  | { ok: false; error: BatchError };

/**
 * Applies all operations in order or none: the first failure aborts and the input document is
 * returned untouched. The inverse batch is attributed to `manual` because undoing is a user action
 * and must not be blocked by locks set after the original batch ran.
 */
export function applyBatch(doc: FormaDocument, batch: OperationBatch): BatchResult {
  let current = doc;
  const inverseGroups: Operation[][] = [];
  for (const [opIndex, op] of batch.ops.entries()) {
    const result = applyOperation(current, op, { source: batch.source });
    if (!result.ok) return { ok: false, error: { ...result.error, opIndex } };
    current = result.doc;
    inverseGroups.push(result.inverse);
  }
  return {
    ok: true,
    doc: current,
    batch,
    inverseBatch: {
      id: `${batch.id}:undo`,
      label: `Undo: ${batch.label}`,
      source: 'manual',
      ops: inverseGroups.reverse().flat(),
    },
  };
}
