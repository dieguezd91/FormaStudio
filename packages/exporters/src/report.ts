import { z } from 'zod';

/** Same four levels as the library's per-target compatibility hints (design doc §10.7). */
export const compatibilityStatusSchema = z.enum([
  'supported',
  'adapted',
  'approximate',
  'unavailable',
]);
export type CompatibilityStatus = z.infer<typeof compatibilityStatusSchema>;

export const compatibilityItemSchema = z.strictObject({
  subject: z.strictObject({
    nodeId: z.string().optional(),
    behavior: z.string().optional(),
    property: z.string().optional(),
    dataSourceId: z.string().optional(),
    intentName: z.string().optional(),
  }),
  status: compatibilityStatusSchema,
  /** Spanish: the visual or functional effect in the target. */
  impact: z.string(),
  /** Spanish: what the developer or designer can do about it. */
  action: z.string(),
  /** Every node the item applies to when identical findings were merged (`subject.nodeId` is the first). */
  nodeIds: z.array(z.string()).optional(),
});
export type CompatibilityItem = z.infer<typeof compatibilityItemSchema>;

export const compatibilityReportSchema = z.strictObject({
  items: z.array(compatibilityItemSchema),
  summary: z.strictObject({
    counts: z.strictObject({
      supported: z.number().int().nonnegative(),
      adapted: z.number().int().nonnegative(),
      approximate: z.number().int().nonnegative(),
      unavailable: z.number().int().nonnegative(),
    }),
    youWillReceive: z.array(z.string()),
    youMustConnect: z.array(z.string()),
  }),
});
export type CompatibilityReport = z.infer<typeof compatibilityReportSchema>;
