import type { Behavior, FormaDocument, FormaNode } from '@forma/design-core';
import type { CompatibilityItem } from '../report';
import { normalizeBinding, withField, withoutField } from './bindings';
import type { BehaviorComponent, BindingRef, NodeBinding } from './bundle';

export interface ComponentContext {
  doc: FormaDocument;
  nodes: Record<string, FormaNode>;
  /** Findings the conversion cannot express as a component. */
  notes: CompatibilityItem[];
}

const unavailable = (
  node: FormaNode,
  subject: CompatibilityItem['subject'],
  impact: string,
  action: string,
): CompatibilityItem => ({
  subject: { nodeId: node.id, ...subject },
  status: 'unavailable',
  impact,
  action,
  nodeIds: [node.id],
});

function descendants(ctx: ComponentContext, node: FormaNode): FormaNode[] {
  const out: FormaNode[] = [];
  const queue = [...node.children];
  const seen = new Set<string>([node.id]);
  while (queue.length > 0) {
    const child = ctx.nodes[queue.shift()!];
    if (!child || seen.has(child.id)) continue;
    seen.add(child.id);
    out.push(child);
    queue.push(...child.children);
  }
  return out;
}

function ancestors(ctx: ComponentContext, node: FormaNode): FormaNode[] {
  const out: FormaNode[] = [];
  const seen = new Set<string>([node.id]);
  let current = node.parentId === null ? undefined : ctx.nodes[node.parentId];
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    out.push(current);
    current = current.parentId === null ? undefined : ctx.nodes[current.parentId];
  }
  return out;
}

/**
 * The data source a node without its own binding reads from. Mirrors the runtime
 * (`screen.ts` `sourceOf`): the first binding found on the node, its subtree or its ancestors,
 * else the document's first data source.
 */
function dataSourceOf(ctx: ComponentContext, node: FormaNode): string | undefined {
  const candidates = [node, ...descendants(ctx, node), ...ancestors(ctx, node)];
  return (
    candidates.find((n) => n.bindings.length > 0)?.bindings[0]?.dataSourceId ??
    ctx.doc.dataSources[0]?.id
  );
}

const behaviorOf = <K extends Behavior['kind']>(
  node: FormaNode,
  kind: K,
): Extract<Behavior, { kind: K }> | undefined =>
  node.behaviors.find((b): b is Extract<Behavior, { kind: K }> => b.kind === kind);

/** Components reference intents by name, which is what the game knows. */
const intentName = (ctx: ComponentContext, intentId: string): string =>
  ctx.doc.intents.find((i) => i.id === intentId)?.name ?? intentId;

/** Normalizes the node's own bindings; unparseable ones become `unavailable` findings. */
export function normalizeNodeBindings(ctx: ComponentContext, node: FormaNode): NodeBinding[] {
  const out: NodeBinding[] = [];
  for (const binding of node.bindings) {
    const normalized = normalizeBinding(binding.dataSourceId, binding.path);
    if (normalized) {
      out.push({ prop: binding.prop, ...normalized });
    } else {
      ctx.notes.push(
        unavailable(
          node,
          { property: `bindings.${binding.prop}`, dataSourceId: binding.dataSourceId },
          `La ruta de datos «${binding.path}» no es válida y no se exporta.`,
          'Corregí la ruta del dato vinculado en el diseño.',
        ),
      );
    }
  }
  return out;
}

function tooltipComponent(
  ctx: ComponentContext,
  node: FormaNode,
  behavior: Extract<Behavior, { kind: 'tooltip' }>,
): BehaviorComponent | undefined {
  const dataSourceId = dataSourceOf(ctx, node);
  const binding = dataSourceId ? normalizeBinding(dataSourceId, behavior.bindingPath) : undefined;
  if (!binding) {
    ctx.notes.push(
      unavailable(
        node,
        { behavior: 'tooltip' },
        'El tooltip no tiene una fuente de datos o una ruta válida y no se exporta.',
        'Vinculá el ítem a una fuente de datos y revisá la ruta del tooltip.',
      ),
    );
    return undefined;
  }
  return { type: 'FormaTooltip', binding };
}

function behaviorComponent(
  ctx: ComponentContext,
  node: FormaNode,
  behavior: Behavior,
): BehaviorComponent | undefined {
  switch (behavior.kind) {
    case 'tabs':
      return {
        type: 'FormaTabs',
        initialTabId: behavior.initialTabId,
        tabs: behavior.tabs.map((tab) => {
          // Same rule as the runtime: the button child whose label is the tab's label.
          const button = node.children
            .map((id) => ctx.nodes[id])
            .find((n) => n?.type === 'button' && n.props.label === tab.label);
          return {
            id: tab.id,
            label: tab.label,
            ...(button ? { buttonNodeId: button.id } : {}),
            contentNodeId: tab.contentNodeId,
          };
        }),
      };
    case 'select':
      return { type: 'FormaSelectable', mode: behavior.mode };
    case 'dragDrop':
      return {
        type: 'FormaDragDrop',
        role: behavior.role,
        accepts: behavior.accepts ?? [],
        intent: intentName(ctx, behavior.intentId),
      };
    case 'stack':
      return { type: 'FormaStack', maxStack: behavior.maxStack, showCount: behavior.showCount };
    case 'split':
      return { type: 'FormaSplit', intent: intentName(ctx, behavior.intentId) };
    case 'contextMenu':
      return {
        type: 'FormaContextMenu',
        trigger: behavior.trigger,
        actions: behavior.actions.map((a) => ({
          id: a.id,
          label: a.label,
          intent: intentName(ctx, a.intentId),
        })),
      };
    case 'tooltip':
      return tooltipComponent(ctx, node, behavior);
  }
}

/** The row a slot shows: first view+index path on the node (own, tooltip) or its subtree. */
function slotBinding(ctx: ComponentContext, node: FormaNode): BindingRef | undefined {
  for (const candidate of [node, ...descendants(ctx, node)]) {
    const paths = candidate.bindings.map((b) => ({ dataSourceId: b.dataSourceId, path: b.path }));
    const tooltip = behaviorOf(candidate, 'tooltip');
    const source = dataSourceOf(ctx, candidate);
    if (tooltip && source) paths.push({ dataSourceId: source, path: tooltip.bindingPath });
    for (const { dataSourceId, path } of paths) {
      const binding = normalizeBinding(dataSourceId, path);
      if (binding?.index !== undefined) return withoutField(binding);
    }
  }
  return undefined;
}

function itemViewComponent(node: FormaNode): BehaviorComponent {
  const bound = (prop: string): BindingRef | undefined => {
    const binding = node.bindings.find((b) => b.prop === prop);
    return binding ? normalizeBinding(binding.dataSourceId, binding.path) : undefined;
  };
  const icon = bound('icon');
  const quantity = bound('quantity');
  // Like the runtime preview, the name is the `name` field of the row the icon comes from.
  const name =
    bound('name') ?? (icon && !icon.field?.includes('.') ? withField(icon, 'name') : undefined);
  return {
    type: 'FormaItemView',
    ...(icon ? { icon } : {}),
    ...(quantity ? { quantity } : {}),
    ...(name ? { name } : {}),
  };
}

/** Behavior components first (in behavior order), then structural ones for slots and item views. */
export function buildComponents(ctx: ComponentContext, node: FormaNode): BehaviorComponent[] {
  const components = node.behaviors.flatMap((behavior) => {
    const built = behaviorComponent(ctx, node, behavior);
    return built ? [built] : [];
  });

  if (node.type === 'slot' || node.type === 'equipmentSlot') {
    const binding = slotBinding(ctx, node);
    if (binding) components.push({ type: 'FormaSlot', binding });
  }
  if (node.type === 'itemView') components.push(itemViewComponent(node));
  if (node.type === 'equipmentSlot') {
    components.push({ type: 'FormaEquipmentSlot', slotType: node.props.slotType });
  }
  return components;
}
