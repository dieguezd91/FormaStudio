import { z } from 'zod';
import { dataSourceSchema, intentSchema } from './data';
import { nodeSchema, sizeSchema } from './node';
import { styleTokensSchema } from './tokens';
import { SCHEMA_VERSION } from './version';

const id = z.string().min(1);

export const screenSchema = z.strictObject({
  id,
  name: z.string(),
  size: sizeSchema,
  rootId: id,
  /** Flat normalized map; hierarchy lives in `parentId` / `children`. */
  nodes: z.record(id, nodeSchema),
});
/** Named `FormaScreen` to avoid colliding with the DOM `Screen` global in consumers. */
export type FormaScreen = z.infer<typeof screenSchema>;

export const targetSchema = z.strictObject({
  platform: z.enum(['unity', 'web']),
  ui: z.enum(['ugui', 'uitoolkit']).optional(),
});
export type Target = z.infer<typeof targetSchema>;

export const formaDocumentSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id,
  name: z.string(),
  target: targetSchema,
  tokens: styleTokensSchema,
  screens: z.array(screenSchema),
  dataSources: z.array(dataSourceSchema),
  intents: z.array(intentSchema),
  meta: z.strictObject({ createdAt: z.string(), updatedAt: z.string() }),
});
export type FormaDocument = z.infer<typeof formaDocumentSchema>;
