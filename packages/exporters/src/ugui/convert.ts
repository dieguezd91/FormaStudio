import type { FormaDocument, FormaNode, FormaScreen, Size } from '@forma/design-core';
import type { CompatibilityItem } from '../report';
import { buildComponents, normalizeNodeBindings, type ComponentContext } from './components';
import type {
  BehaviorComponent,
  BindingRef,
  BundleDataSource,
  BundleIntent,
  BundleNode,
  BundleTheme,
  NodeKind,
  UguiBundle,
} from './bundle';
import { toRect } from './rect';
import { resolveColor, resolveNumber, resolveTheme } from './style';

/** Everything of the bundle that does not depend on the caller's project metadata. */
export interface ConvertedScreen {
  canvas: UguiBundle['canvas'];
  theme: BundleTheme;
  nodes: BundleNode[];
  dataSources: BundleDataSource[];
  intents: BundleIntent[];
  managed: Record<string, string[]>;
  /** Conversion findings that feed the compatibility report. */
  notes: CompatibilityItem[];
}

const KIND_OF: Record<FormaNode['type'], NodeKind> = {
  frame: 'container',
  panel: 'panel',
  text: 'text',
  image: 'image',
  button: 'button',
  scroll: 'scroll',
  tabBar: 'tabBar',
  inventoryGrid: 'grid',
  slot: 'slot',
  itemView: 'itemView',
  equipmentSlot: 'equipmentSlot',
  contextMenu: 'contextMenu',
  tooltip: 'tooltip',
};

const TRANSPARENT = '#00000000';
const WHITE = '#ffffff';
const DEFAULT_FONT_SIZE = 16;
const DEFAULT_FONT_WEIGHT = 400;
const DEFAULT_STROKE_WIDTH = 1;

const TEXT_ALIGNMENT = { left: 'Left', center: 'Center', right: 'Right' } as const;

/** Behaviors that need a Graphic under the pointer to receive events. */
const POINTER_BEHAVIORS = new Set(['select', 'dragDrop', 'contextMenu', 'tooltip']);

/** Parent before child, in sibling order; ignores missing children and repeated visits. */
function orderedNodes(screen: FormaScreen): { node: FormaNode; siblingIndex: number }[] {
  const out: { node: FormaNode; siblingIndex: number }[] = [];
  const seen = new Set<string>();
  const visit = (id: string, siblingIndex: number) => {
    const node = screen.nodes[id];
    if (!node || seen.has(id)) return;
    seen.add(id);
    out.push({ node, siblingIndex });
    node.children.forEach((childId, index) => visit(childId, index));
  };
  visit(screen.rootId, 0);
  return out;
}

function convertNode(
  doc: FormaDocument,
  ctx: ComponentContext,
  node: FormaNode,
  siblingIndex: number,
  parentSize: Size,
): { bundleNode: BundleNode; managed: string[] } {
  const { style } = node;
  const kind = KIND_OF[node.type];
  const bundleNode: BundleNode = {
    id: node.id,
    name: node.name,
    parentId: node.parentId,
    siblingIndex,
    kind,
    rect: toRect(node.layout, parentSize),
    bindings: normalizeNodeBindings(ctx, node),
    components: buildComponents(ctx, node),
  };
  const managed = ['name', 'parentId', 'siblingIndex', 'kind', 'rect'];

  const colorOf = (
    input: Parameters<typeof resolveColor>[1],
    fallback: string,
    property: string,
  ) => {
    const resolved = resolveColor(doc, input, fallback);
    if (resolved?.invalid !== undefined) {
      ctx.notes.push({
        subject: { nodeId: node.id, property },
        status: 'approximate',
        impact: `El color «${resolved.invalid}» no es un hex válido; se usa ${fallback}.`,
        action: 'Usá un color hexadecimal (#rrggbb) o un token de color.',
        nodeIds: [node.id],
      });
    }
    return resolved?.color;
  };

  const fill = colorOf(style.fill, WHITE, 'fill');
  const raycastTarget =
    kind === 'button' ||
    kind === 'slot' ||
    kind === 'equipmentSlot' ||
    kind === 'scroll' ||
    node.behaviors.some((b) => POINTER_BEHAVIORS.has(b.kind));
  if (fill || raycastTarget || kind === 'image' || kind === 'itemView') {
    bundleNode.image = {
      color: fill ?? { value: kind === 'image' ? WHITE : TRANSPARENT },
      raycastTarget,
      ...(node.type === 'image'
        ? {
            placeholder: node.props.placeholder,
            ...(node.props.assetRef === undefined ? {} : { assetRef: node.props.assetRef }),
          }
        : {}),
    };
    managed.push('image.color', 'image.raycastTarget');
    if (bundleNode.image.assetRef !== undefined) managed.push('image.assetRef');
    if (bundleNode.image.placeholder !== undefined) managed.push('image.placeholder');
  }

  const stroke = colorOf(style.stroke, WHITE, 'stroke');
  const strokeWidth = resolveNumber(doc, style.strokeWidth) ?? DEFAULT_STROKE_WIDTH;
  if (stroke && strokeWidth > 0) {
    bundleNode.outline = { color: stroke, width: strokeWidth };
    managed.push('outline');
  }

  const radius = resolveNumber(doc, style.radius);
  if (radius !== undefined && radius > 0) {
    bundleNode.cornerRadius = radius;
    managed.push('cornerRadius');
  }

  const opacity = resolveNumber(doc, style.opacity);
  if (opacity !== undefined && opacity < 1) {
    bundleNode.canvasGroupAlpha = opacity;
    managed.push('canvasGroupAlpha');
  }

  if (node.type === 'text' || node.type === 'button') {
    const color = colorOf(style.textColor, WHITE, 'textColor');
    bundleNode.text = {
      value: node.type === 'text' ? node.props.text : node.props.label,
      fontSize: resolveNumber(doc, style.fontSize) ?? DEFAULT_FONT_SIZE,
      color: color ?? { value: WHITE },
      alignment: node.type === 'text' ? TEXT_ALIGNMENT[node.props.align] : 'Center',
      fontWeight: resolveNumber(doc, style.fontWeight) ?? DEFAULT_FONT_WEIGHT,
    };
    managed.push('text.value', 'text.fontSize', 'text.color', 'text.alignment', 'text.fontWeight');
  }

  if (node.type === 'button') {
    bundleNode.button = { transition: 'ColorTint' };
    managed.push('button');
  }

  if (node.type === 'scroll') {
    const { direction } = node.props;
    bundleNode.scroll = {
      horizontal: direction !== 'vertical',
      vertical: direction !== 'horizontal',
    };
    managed.push('scroll');
  }

  const { layout } = node;
  if (layout.mode !== 'absolute') {
    const padding = resolveNumber(doc, layout.padding) ?? 0;
    const cell =
      layout.cellSize ?? (node.type === 'inventoryGrid' ? node.props.slotSize : undefined);
    const columns =
      layout.columns ?? (node.type === 'inventoryGrid' ? node.props.columns : undefined);
    bundleNode.layoutGroup = {
      type: { grid: 'Grid', row: 'Horizontal', column: 'Vertical' }[layout.mode] as
        'Grid' | 'Horizontal' | 'Vertical',
      ...(layout.mode === 'grid' && cell ? { cellSize: { x: cell.width, y: cell.height } } : {}),
      spacing: resolveNumber(doc, layout.gap) ?? 0,
      padding: { left: padding, right: padding, top: padding, bottom: padding },
      ...(layout.mode === 'grid' && columns
        ? { constraint: 'FixedColumnCount' as const, constraintCount: columns }
        : {}),
    };
    managed.push('layoutGroup');
  }

  if (bundleNode.bindings.length > 0) managed.push('bindings');
  for (const component of bundleNode.components) managed.push(`components.${component.type}`);
  return { bundleNode, managed };
}

const bindingRefs = (component: BehaviorComponent): BindingRef[] => {
  switch (component.type) {
    case 'FormaTooltip':
    case 'FormaSlot':
      return [component.binding];
    case 'FormaItemView':
      return [component.icon, component.quantity, component.name].filter(
        (b): b is BindingRef => b !== undefined,
      );
    default:
      return [];
  }
};

const intentNames = (component: BehaviorComponent): string[] => {
  switch (component.type) {
    case 'FormaDragDrop':
    case 'FormaSplit':
      return [component.intent];
    case 'FormaContextMenu':
      return component.actions.map((a) => a.intent);
    default:
      return [];
  }
};

/**
 * Converts one screen. Tolerates documents that fail validation (the exporter validates first;
 * `analyze` does not) by skipping anything it cannot reach.
 */
export function convertScreen(doc: FormaDocument, screen: FormaScreen): ConvertedScreen {
  const notes: CompatibilityItem[] = [];
  const ctx: ComponentContext = { doc, nodes: screen.nodes, notes };

  const nodes: BundleNode[] = [];
  const managed: Record<string, string[]> = {};
  for (const { node, siblingIndex } of orderedNodes(screen)) {
    const parent = node.parentId === null ? undefined : screen.nodes[node.parentId];
    const parentSize = parent
      ? { width: parent.layout.width, height: parent.layout.height }
      : screen.size;
    const converted = convertNode(doc, ctx, node, siblingIndex, parentSize);
    nodes.push(converted.bundleNode);
    managed[node.id] = converted.managed;
  }

  const usedSources = new Set<string>();
  const usedIntents = new Set<string>();
  for (const node of nodes) {
    for (const binding of node.bindings) usedSources.add(binding.dataSourceId);
    for (const component of node.components) {
      for (const binding of bindingRefs(component)) usedSources.add(binding.dataSourceId);
      for (const name of intentNames(component)) usedIntents.add(name);
    }
  }

  return {
    canvas: {
      referenceResolution: { x: screen.size.width, y: screen.size.height },
      scaleMode: 'ScaleWithScreenSize',
      matchWidthOrHeight: 0.5,
    },
    theme: resolveTheme(doc),
    nodes,
    dataSources: doc.dataSources
      .filter((d) => usedSources.has(d.id))
      .map(({ id, name, kind, fields, connection, mock }) => ({
        id,
        name,
        kind,
        fields,
        connection,
        mock,
      })),
    intents: doc.intents
      .filter((i) => usedIntents.has(i.name))
      .map(({ name, description, payload, connection }) => ({
        name,
        description,
        payload,
        connection,
      })),
    managed,
    notes,
  };
}
