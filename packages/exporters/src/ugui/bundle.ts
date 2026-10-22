import { z } from 'zod';

/**
 * `forma.ugui-bundle/v1`: the versioned contract between the pure TypeScript exporter and the
 * Unity Editor importer (docs/export/ugui-bundle.md). The importer never parses binding paths or
 * resolves tokens: everything arrives resolved and normalized.
 */
export const BUNDLE_FORMAT = 'forma.ugui-bundle/v1';
export const BUNDLE_VERSION = 1;

const id = z.string().min(1);
const vec2 = z.strictObject({ x: z.number(), y: z.number() });
export type Vec2 = z.infer<typeof vec2>;

/** `#rrggbb` or `#rrggbbaa`, lowercase. */
export const hexColorSchema = z.string().regex(/^#[0-9a-f]{6}([0-9a-f]{2})?$/);

/** A resolved color; `token` (e.g. `colors.surface`) is kept so the importer can build a theme. */
export const colorRefSchema = z.strictObject({
  value: hexColorSchema,
  token: z.string().min(1).optional(),
});
export type ColorRef = z.infer<typeof colorRefSchema>;

export const uguiRectSchema = z.strictObject({
  anchorMin: vec2,
  anchorMax: vec2,
  pivot: vec2,
  anchoredPosition: vec2,
  sizeDelta: vec2,
});
export type UguiRect = z.infer<typeof uguiRectSchema>;

export const NODE_KINDS = [
  'container',
  'panel',
  'text',
  'image',
  'button',
  'scroll',
  'grid',
  'slot',
  'itemView',
  'equipmentSlot',
  'tabBar',
  'contextMenu',
  'tooltip',
] as const;
export const nodeKindSchema = z.enum(NODE_KINDS);
export type NodeKind = z.infer<typeof nodeKindSchema>;

/** A binding path split into parts: `items[category=Armas][3].icon`. */
export const bindingRefSchema = z.strictObject({
  dataSourceId: id,
  /** Path root, `items` for the library's collection. */
  root: z.string().min(1),
  filters: z.array(z.strictObject({ field: z.string().min(1), value: z.string() })),
  /** Zero-based position inside the filtered rows. */
  index: z.number().int().nonnegative().optional(),
  /** Field of the row (dot-joined when nested). */
  field: z.string().min(1).optional(),
});
export type BindingRef = z.infer<typeof bindingRefSchema>;

export const nodeBindingSchema = bindingRefSchema.extend({ prop: z.string().min(1) });
export type NodeBinding = z.infer<typeof nodeBindingSchema>;

const component = <const T extends string, S extends z.core.$ZodShape>(type: T, shape: S) =>
  z.strictObject({ type: z.literal(type), ...shape });

export const behaviorComponentSchema = z.discriminatedUnion('type', [
  component('FormaTabs', {
    tabs: z.array(
      z.strictObject({
        id,
        label: z.string(),
        buttonNodeId: id.optional(),
        contentNodeId: id,
      }),
    ),
    initialTabId: id,
  }),
  component('FormaSelectable', { mode: z.enum(['single', 'multi']) }),
  component('FormaDragDrop', {
    role: z.enum(['source', 'target', 'both']),
    accepts: z.array(z.string()),
    /** Intent NAME, e.g. `inventory.moveItem`. */
    intent: z.string().min(1),
  }),
  component('FormaStack', { maxStack: z.number().int().positive(), showCount: z.boolean() }),
  component('FormaSplit', { intent: z.string().min(1) }),
  component('FormaContextMenu', {
    trigger: z.enum(['secondaryClick', 'longPress', 'button']),
    actions: z.array(z.strictObject({ id, label: z.string(), intent: z.string().min(1) })),
  }),
  component('FormaTooltip', { binding: bindingRefSchema }),
  component('FormaSlot', { binding: bindingRefSchema }),
  component('FormaItemView', {
    icon: bindingRefSchema.optional(),
    quantity: bindingRefSchema.optional(),
    name: bindingRefSchema.optional(),
  }),
  component('FormaEquipmentSlot', { slotType: z.string() }),
]);
export type BehaviorComponent = z.infer<typeof behaviorComponentSchema>;
export type ComponentType = BehaviorComponent['type'];

export const bundleNodeSchema = z.strictObject({
  /** Design node id: the sync key between Forma and the prefab. */
  id,
  name: z.string(),
  parentId: id.nullable(),
  siblingIndex: z.number().int().nonnegative(),
  kind: nodeKindSchema,
  rect: uguiRectSchema,
  image: z
    .strictObject({
      color: colorRefSchema,
      raycastTarget: z.boolean(),
      assetRef: z.string().optional(),
      placeholder: z.boolean().optional(),
    })
    .optional(),
  outline: z.strictObject({ color: colorRefSchema, width: z.number().nonnegative() }).optional(),
  cornerRadius: z.number().positive().optional(),
  canvasGroupAlpha: z.number().min(0).max(1).optional(),
  text: z
    .strictObject({
      value: z.string(),
      fontSize: z.number().positive(),
      color: colorRefSchema,
      /** `TMPro.TextAlignmentOptions` member name. */
      alignment: z.enum(['Left', 'Center', 'Right']),
      fontWeight: z.number().int().min(100).max(900),
    })
    .optional(),
  button: z.strictObject({ transition: z.literal('ColorTint') }).optional(),
  layoutGroup: z
    .strictObject({
      type: z.enum(['Grid', 'Horizontal', 'Vertical']),
      cellSize: vec2.optional(),
      spacing: z.number(),
      padding: z.strictObject({
        left: z.number(),
        right: z.number(),
        top: z.number(),
        bottom: z.number(),
      }),
      constraint: z.literal('FixedColumnCount').optional(),
      constraintCount: z.number().int().positive().optional(),
    })
    .optional(),
  scroll: z.strictObject({ horizontal: z.boolean(), vertical: z.boolean() }).optional(),
  bindings: z.array(nodeBindingSchema),
  components: z.array(behaviorComponentSchema),
});
export type BundleNode = z.infer<typeof bundleNodeSchema>;

export const connectionSchema = z.enum(['simulated', 'unconnected', 'connected']);
const fieldType = z.enum(['string', 'number', 'boolean', 'image', 'id']);

export const bundleDataSourceSchema = z.strictObject({
  id,
  name: z.string(),
  kind: z.enum(['collection', 'object']),
  fields: z.array(z.strictObject({ name: z.string(), type: fieldType })),
  connection: connectionSchema,
  /** Design-time sample records. Preview only: never ship them as game data. */
  mock: z.json(),
});
export type BundleDataSource = z.infer<typeof bundleDataSourceSchema>;

export const bundleIntentSchema = z.strictObject({
  name: z.string().min(1),
  description: z.string(),
  payload: z.array(z.strictObject({ name: z.string(), type: fieldType })),
  connection: connectionSchema,
});
export type BundleIntent = z.infer<typeof bundleIntentSchema>;

export const bundleThemeSchema = z.strictObject({
  colors: z.record(z.string(), hexColorSchema),
  fontSizes: z.record(z.string(), z.number()),
  spacing: z.record(z.string(), z.number()),
  radii: z.record(z.string(), z.number()),
});
export type BundleTheme = z.infer<typeof bundleThemeSchema>;

export const uguiBundleSchema = z.strictObject({
  format: z.literal(BUNDLE_FORMAT),
  meta: z.strictObject({
    bundleVersion: z.literal(BUNDLE_VERSION),
    projectId: z.string(),
    projectName: z.string(),
    documentRevision: z.number().int().nonnegative(),
    screenId: id,
    screenName: z.string(),
    exportedAt: z.string(),
    exporter: z.string(),
  }),
  canvas: z.strictObject({
    referenceResolution: vec2,
    scaleMode: z.literal('ScaleWithScreenSize'),
    matchWidthOrHeight: z.literal(0.5),
  }),
  theme: bundleThemeSchema,
  /** Parents always precede their children. */
  nodes: z.array(bundleNodeSchema),
  dataSources: z.array(bundleDataSourceSchema),
  intents: z.array(bundleIntentSchema),
  /** Per node id, the property paths Forma owns; everything else is developer-owned. */
  managed: z.record(id, z.array(z.string())),
});
export type UguiBundle = z.infer<typeof uguiBundleSchema>;
