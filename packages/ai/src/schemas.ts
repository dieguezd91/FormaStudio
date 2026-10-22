import { z } from 'zod';
import { operationSchema, type Operation } from '@forma/design-core';

/**
 * Contracts the model must answer. They are deliberately smaller than the design-core schemas
 * (the full operation schema is ~160 KB of JSON Schema); everything the model returns is
 * validated again against design-core and the library before it is used.
 */

const text = (max: number) => z.string().min(1).max(max);

// Requirements (§5)
export const REQUIREMENT_KINDS = ['goal', 'data', 'flow', 'constraint', 'interaction'] as const;
export const REQUIREMENT_STATUSES = ['confirmed', 'assumed', 'contradiction', 'gap'] as const;

export const extractedRequirementSchema = z.strictObject({
  text: text(1000),
  kind: z.enum(REQUIREMENT_KINDS),
  status: z.enum(REQUIREMENT_STATUSES),
  sourceRefs: z
    .array(z.strictObject({ sourceId: text(200), excerpt: z.string().max(2000) }))
    .max(8),
});
export type ExtractedRequirement = z.infer<typeof extractedRequirementSchema>;

export const requirementsOutputSchema = z.strictObject({
  requirements: z.array(extractedRequirementSchema).max(60),
});
export type RequirementsOutput = z.infer<typeof requirementsOutputSchema>;

// Proposals (§6.2): a composition plan over library entries, never raw nodes.
const paramScalar = z.union([z.string(), z.number(), z.boolean()]);
export const paramValueSchema = z.union([paramScalar, z.null(), z.array(paramScalar)]);

export const placementSchema = z.strictObject({
  entryId: text(100),
  params: z.record(z.string(), paramValueSchema),
  /** Pixels, relative to the parent placement (or the screen when `parentRef` is absent). */
  region: z.strictObject({
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  /** Index in `layout` of an earlier placement that contains this one. */
  parentRef: z.int().nonnegative().optional(),
});
export type Placement = z.infer<typeof placementSchema>;

export const tokenOverridesSchema = z.strictObject({
  colors: z.record(z.string(), z.string()).optional(),
  fontSizes: z.record(z.string(), z.number()).optional(),
  spacing: z.record(z.string(), z.number()).optional(),
  radii: z.record(z.string(), z.number()).optional(),
});

export const compositionPlanSchema = z.strictObject({
  title: text(300),
  summary: z.string().max(2000),
  rationale: z.strictObject({
    need: z.string().max(2000),
    patterns: z.array(z.string().max(300)).max(10),
    tradeoffs: z.array(z.string().max(600)).max(10),
    fromReferences: z.array(z.string().max(200)).max(10),
    requirementIds: z.array(z.string().max(200)).max(30),
  }),
  layout: z.array(placementSchema).min(1).max(12),
  tokens: tokenOverridesSchema.optional(),
});
export type CompositionPlan = z.infer<typeof compositionPlanSchema>;

export const MAX_PROPOSALS = 5;

export const proposalsOutputSchema = z.strictObject({
  proposals: z.array(compositionPlanSchema).min(1).max(MAX_PROPOSALS),
});
export type ProposalsOutput = z.infer<typeof proposalsOutputSchema>;

// Natural-language edits (§6.4)
export const insertEntryRequestSchema = z.strictObject({
  insertEntry: z.strictObject({
    entryId: text(100),
    params: z.record(z.string(), paramValueSchema),
    parentId: text(200),
  }),
});
export type InsertEntryRequest = z.infer<typeof insertEntryRequestSchema>;

export type EditItem = Operation | InsertEntryRequest;

/** `addNode`/`addScreen` embed the full node schema (~73 KB each); new content goes through `insertEntry`. */
const MODEL_EXCLUDED_OPERATIONS = new Set<string>(['addNode', 'addScreen']);

const modelOperations = operationSchema.options.filter(
  (option) => !MODEL_EXCLUDED_OPERATIONS.has(option.shape.type.value),
);

export const editItemSchema = z.union([
  ...(modelOperations as [(typeof modelOperations)[number], ...(typeof modelOperations)[number][]]),
  insertEntryRequestSchema,
]) as z.ZodType<EditItem>;

export const editOutputSchema = z.strictObject({
  explanation: text(2000),
  warnings: z.array(z.string().max(500)).max(10),
  operations: z.array(editItemSchema).max(50),
});
export type EditOutput = z.infer<typeof editOutputSchema>;
