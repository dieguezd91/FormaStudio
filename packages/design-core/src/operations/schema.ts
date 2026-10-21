import { z } from 'zod';
import { summarizeIssues, zodIssues, type Issue } from '../issues';
import type { Result } from '../result';
import {
  behaviorKindSchema,
  behaviorSchema,
  bindingSchema,
  dataSourceSchema,
  intentSchema,
  layoutSchema,
  nodeSchema,
  screenSchema,
  styleSchema,
  tokenGroupSchema,
  tokenValueSchema,
} from '../schema';

const id = z.string().min(1);
/** AI-only escape hatch for modifying locked nodes (design doc §3.5). */
const force = z.boolean().optional();
const index = z.number().int().nonnegative().optional();

/** Patch section: partial, where `null` removes the key. */
const nullablePartial = <S extends z.ZodRawShape>(shape: S) =>
  z.strictObject(
    Object.fromEntries(
      Object.entries(shape).map(([key, value]) => [key, z.optional(z.nullable(value))]),
    ) as { [K in keyof S]: z.ZodOptional<z.ZodNullable<S[K]>> },
  );

/** Shallow-merged per section. `null` deletes a key; the merged node is re-validated. */
export const nodePatchSchema = z.strictObject({
  name: z.string().optional(),
  layout: nullablePartial(layoutSchema.shape).optional(),
  style: nullablePartial(styleSchema.shape).optional(),
  props: z.record(z.string(), z.json()).optional(),
  locked: z.boolean().nullable().optional(),
});
export type NodePatch = z.infer<typeof nodePatchSchema>;

const op = <const T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
  z.strictObject({ type: z.literal(type), ...shape });

export const operationSchema = z.discriminatedUnion('type', [
  op('addNode', { screenId: id, node: nodeSchema, parentId: id, index, force }),
  op('removeNode', { screenId: id, nodeId: id, force }),
  op('updateNode', { screenId: id, nodeId: id, patch: nodePatchSchema, force }),
  op('moveNode', {
    screenId: id,
    nodeId: id,
    newParentId: id,
    index: z.number().int().nonnegative(),
    force,
  }),
  op('setBehavior', { screenId: id, nodeId: id, behavior: behaviorSchema, index, force }),
  op('removeBehavior', { screenId: id, nodeId: id, kind: behaviorKindSchema, force }),
  op('setBinding', { screenId: id, nodeId: id, binding: bindingSchema, index, force }),
  op('removeBinding', { screenId: id, nodeId: id, bindingId: id, force }),
  op('setToken', { group: tokenGroupSchema, name: id, value: tokenValueSchema }),
  op('removeToken', { group: tokenGroupSchema, name: id }),
  op('addScreen', { screen: screenSchema, index }),
  op('removeScreen', { screenId: id, force }),
  op('renameScreen', { screenId: id, name: z.string() }),
  op('upsertDataSource', { dataSource: dataSourceSchema, index }),
  op('removeDataSource', { dataSourceId: id }),
  op('upsertIntent', { intent: intentSchema, index }),
  op('removeIntent', { intentId: id }),
]);
export type Operation = z.infer<typeof operationSchema>;
export type OperationType = Operation['type'];

export const batchSourceSchema = z.enum(['manual', 'ai', 'library']);
export type BatchSource = z.infer<typeof batchSourceSchema>;

export const operationBatchSchema = z.strictObject({
  id,
  label: z.string(),
  source: batchSourceSchema,
  ops: z.array(operationSchema),
});
export type OperationBatch = z.infer<typeof operationBatchSchema>;

export interface BatchParseError {
  message: string;
  issues: Issue[];
}

/** Validates untrusted JSON (e.g. AI output) into a batch. Never throws. */
export function parseOperationBatch(raw: unknown): Result<OperationBatch, BatchParseError> {
  const parsed = operationBatchSchema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issues = zodIssues(parsed.error);
  return { ok: false, error: { message: summarizeIssues('Operation batch', issues), issues } };
}
