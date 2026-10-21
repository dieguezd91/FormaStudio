import { z } from 'zod';

const id = z.string().min(1);

/** How a data source or intent is wired: mock data / local simulation, not yet, or real game. */
export const connectionSchema = z.enum(['simulated', 'unconnected', 'connected']);
export type Connection = z.infer<typeof connectionSchema>;

export const dataSourceSchema = z.strictObject({
  id,
  name: z.string(),
  kind: z.enum(['collection', 'object']),
  fields: z.array(
    z.strictObject({
      name: z.string(),
      type: z.enum(['string', 'number', 'boolean', 'image', 'id']),
    }),
  ),
  mock: z.json(),
  connection: connectionSchema,
});
export type DataSource = z.infer<typeof dataSourceSchema>;

export const bindingSchema = z.strictObject({
  id,
  prop: z.string().min(1),
  dataSourceId: id,
  path: z.string(),
});
export type Binding = z.infer<typeof bindingSchema>;

/** The UI expresses an intent; the game decides what happens (design doc §10.5). */
export const intentSchema = z.strictObject({
  id,
  name: z.string().min(1),
  description: z.string(),
  payload: z.array(
    z.strictObject({
      name: z.string(),
      type: z.enum(['string', 'number', 'boolean', 'image', 'id']),
    }),
  ),
  connection: connectionSchema,
});
export type Intent = z.infer<typeof intentSchema>;
