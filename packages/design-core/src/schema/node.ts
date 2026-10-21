import { z } from 'zod';
import { behaviorSchema } from './behavior';
import { bindingSchema } from './data';
import { styleValue } from './tokens';

const id = z.string().min(1);

export const sizeSchema = z.strictObject({
  width: z.number().positive(),
  height: z.number().positive(),
});
export type Size = z.infer<typeof sizeSchema>;

export const anchorSchema = z.enum([
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
  'stretch',
]);
export type Anchor = z.infer<typeof anchorSchema>;

export const layoutSchema = z.strictObject({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  anchor: anchorSchema.optional(),
  mode: z.enum(['absolute', 'row', 'column', 'grid']),
  gap: styleValue(z.number()).optional(),
  padding: styleValue(z.number()).optional(),
  columns: z.number().int().positive().optional(),
  cellSize: sizeSchema.optional(),
});
export type Layout = z.infer<typeof layoutSchema>;

export const styleSchema = z.strictObject({
  fill: styleValue(z.string()).optional(),
  stroke: styleValue(z.string()).optional(),
  strokeWidth: styleValue(z.number().nonnegative()).optional(),
  radius: styleValue(z.number().nonnegative()).optional(),
  opacity: styleValue(z.number().min(0).max(1)).optional(),
  textColor: styleValue(z.string()).optional(),
  fontSize: styleValue(z.number().positive()).optional(),
  fontWeight: styleValue(z.number().int().min(100).max(900)).optional(),
});
export type NodeStyle = z.infer<typeof styleSchema>;

export const originSchema = z.strictObject({
  source: z.enum(['manual', 'library', 'ai']),
  ref: z.string().optional(),
});
export type Origin = z.infer<typeof originSchema>;

const nodeBase = {
  id,
  name: z.string(),
  parentId: id.nullable(),
  children: z.array(id),
  layout: layoutSchema,
  style: styleSchema,
  behaviors: z.array(behaviorSchema),
  bindings: z.array(bindingSchema),
  origin: originSchema,
  locked: z.boolean().optional(),
};

const nodeOf = <const T extends string, P extends z.ZodType>(type: T, props: P) =>
  z.strictObject({ ...nodeBase, type: z.literal(type), props });

const noProps = z.strictObject({});

export const nodeSchema = z.discriminatedUnion('type', [
  nodeOf('frame', noProps),
  nodeOf('panel', noProps),
  nodeOf('text', z.strictObject({ text: z.string(), align: z.enum(['left', 'center', 'right']) })),
  nodeOf('image', z.strictObject({ assetRef: z.string().optional(), placeholder: z.boolean() })),
  nodeOf('button', z.strictObject({ label: z.string() })),
  nodeOf('scroll', z.strictObject({ direction: z.enum(['vertical', 'horizontal', 'both']) })),
  nodeOf('tabBar', noProps),
  nodeOf(
    'inventoryGrid',
    z.strictObject({
      columns: z.number().int().positive(),
      rows: z.number().int().positive(),
      slotSize: sizeSchema,
    }),
  ),
  nodeOf('slot', noProps),
  nodeOf('itemView', noProps),
  nodeOf('equipmentSlot', z.strictObject({ slotType: z.string() })),
  nodeOf('contextMenu', noProps),
  nodeOf('tooltip', noProps),
]);

/** Named `FormaNode` to avoid colliding with the DOM `Node` global in consumers. */
export type FormaNode = z.infer<typeof nodeSchema>;
export type NodeType = FormaNode['type'];
