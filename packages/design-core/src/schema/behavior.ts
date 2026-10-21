import { z } from 'zod';

const id = z.string().min(1);

export const tabsBehaviorSchema = z.strictObject({
  kind: z.literal('tabs'),
  tabs: z.array(z.strictObject({ id, label: z.string(), contentNodeId: id })),
  initialTabId: id,
});

export const selectBehaviorSchema = z.strictObject({
  kind: z.literal('select'),
  mode: z.enum(['single', 'multi']),
});

export const dragDropBehaviorSchema = z.strictObject({
  kind: z.literal('dragDrop'),
  role: z.enum(['source', 'target', 'both']),
  accepts: z.array(z.string()).optional(),
  intentId: id,
});

export const stackBehaviorSchema = z.strictObject({
  kind: z.literal('stack'),
  maxStack: z.number().int().positive(),
  showCount: z.boolean(),
});

export const splitBehaviorSchema = z.strictObject({ kind: z.literal('split'), intentId: id });

export const contextMenuBehaviorSchema = z.strictObject({
  kind: z.literal('contextMenu'),
  trigger: z.enum(['secondaryClick', 'longPress', 'button']),
  actions: z.array(z.strictObject({ id, label: z.string(), intentId: id })),
});

export const tooltipBehaviorSchema = z.strictObject({
  kind: z.literal('tooltip'),
  bindingPath: z.string(),
});

export const behaviorSchema = z.discriminatedUnion('kind', [
  tabsBehaviorSchema,
  selectBehaviorSchema,
  dragDropBehaviorSchema,
  stackBehaviorSchema,
  splitBehaviorSchema,
  contextMenuBehaviorSchema,
  tooltipBehaviorSchema,
]);

export type Behavior = z.infer<typeof behaviorSchema>;

export const behaviorKindSchema = z.enum([
  'tabs',
  'select',
  'dragDrop',
  'stack',
  'split',
  'contextMenu',
  'tooltip',
] satisfies Behavior['kind'][]);
export type BehaviorKind = z.infer<typeof behaviorKindSchema>;
