import { expect } from 'vitest';
import type { FormaDocument } from '../schema';
import { deepFreeze } from '../test-fixtures';
import { applyOperation, type ApplyContext } from './apply';
import { operationSchema, type Operation } from './schema';

/**
 * Applies `op` to a frozen copy of `doc` (proving no mutation), checks that the op and its
 * inverse are valid serializable operations, and that applying the inverse restores `doc`.
 * Returns the document after the op.
 */
export function expectRoundTrip(
  doc: FormaDocument,
  op: Operation,
  ctx?: ApplyContext,
): FormaDocument {
  const before = JSON.stringify(doc);
  const frozen = deepFreeze(JSON.parse(before) as FormaDocument);
  expect(operationSchema.safeParse(JSON.parse(JSON.stringify(op))).success).toBe(true);

  const result = applyOperation(frozen, op, ctx);
  if (!result.ok) throw new Error(`op failed: ${result.error.message}`);
  expect(JSON.stringify(frozen)).toBe(before);

  let current = result.doc;
  for (const inverse of result.inverse) {
    expect(operationSchema.safeParse(JSON.parse(JSON.stringify(inverse))).success).toBe(true);
    const step = applyOperation(current, inverse);
    if (!step.ok) throw new Error(`inverse failed: ${step.error.message}`);
    current = step.doc;
  }
  expect(current).toEqual(doc);
  return result.doc;
}
