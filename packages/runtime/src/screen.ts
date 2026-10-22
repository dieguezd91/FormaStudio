import type { Behavior, FormaDocument, FormaNode, FormaScreen } from '@forma/design-core';
import { splitViewPath, type ItemFilter } from './bindings';
import type { Point } from './types';

export interface Rect extends Point {
  width: number;
  height: number;
}

type BehaviorOf<K extends Behavior['kind']> = Extract<Behavior, { kind: K }>;

/** An item view: the filtered rows a group of slots shows, in slot order. */
export interface ViewSpec {
  key: string;
  dataSourceId: string;
  filters: ItemFilter[];
  /** Number of slots addressing the view (highest bound position + 1). */
  capacity: number;
}

/** Where a node's item lives: a position in a view, or the content of an equipment slot. */
export interface Cell {
  dataSourceId: string;
  filters: ItemFilter[];
  /** Null for equipment cells. */
  viewKey: string | null;
  index: number;
  equipmentId: string | null;
}

const FOCUSABLE_TYPES: ReadonlySet<FormaNode['type']> = new Set([
  'slot',
  'equipmentSlot',
  'button',
]);

export const viewKeyOf = (dataSourceId: string, viewPath: string): string =>
  `${dataSourceId}|${viewPath}`;

/** Static facts about one screen, derived once from the document. */
export interface ScreenIndex {
  screen: FormaScreen;
  node(id: string): FormaNode | undefined;
  /** The node and its ancestors, nearest first. */
  lineage(id: string): FormaNode[];
  nearest(id: string, test: (node: FormaNode) => boolean): FormaNode | undefined;
  behaviorOf<K extends Behavior['kind']>(node: FormaNode, kind: K): BehaviorOf<K> | undefined;
  /** Nearest node (self first) carrying a behavior of `kind`, with that behavior. */
  findBehavior<K extends Behavior['kind']>(
    id: string,
    kind: K,
    test?: (behavior: BehaviorOf<K>) => boolean,
  ): { node: FormaNode; behavior: BehaviorOf<K> } | undefined;
  rect(id: string): Rect | undefined;
  /** Tree order. */
  order: readonly string[];
  focusable: readonly string[];
  tabNodes: readonly FormaNode[];
  views: ReadonlyMap<string, ViewSpec>;
  /** Data source a node reads: its own binding, a descendant's, an ancestor's, else the first. */
  sourceOf(id: string): string | undefined;
  cellOf(id: string): Cell | undefined;
  equipmentOf(id: string): FormaNode | undefined;
  /** Equipment slots in tree order. */
  equipmentSlots: readonly FormaNode[];
  /** The tab a tab-bar button stands for. */
  tabForNode(id: string): { tabNodeId: string; tabId: string } | undefined;
  /** Node ids hidden because they sit in an inactive tab's content. */
  hiddenNodes(activeTab: Readonly<Record<string, string>>): Set<string>;
}

export function createScreenIndex(doc: FormaDocument, screenId: string): ScreenIndex {
  const screen = doc.screens.find((s) => s.id === screenId);
  if (!screen) throw new Error(`Unknown screen "${screenId}".`);
  const node = (id: string): FormaNode | undefined =>
    Object.hasOwn(screen.nodes, id) ? screen.nodes[id] : undefined;

  const order: string[] = [];
  const rects = new Map<string, Rect>();
  const visit = (id: string, origin: Point) => {
    const n = node(id);
    if (!n || rects.has(id)) return;
    const rect = {
      x: origin.x + n.layout.x,
      y: origin.y + n.layout.y,
      width: n.layout.width,
      height: n.layout.height,
    };
    order.push(id);
    rects.set(id, rect);
    n.children.forEach((child) => visit(child, rect));
  };
  visit(screen.rootId, { x: 0, y: 0 });

  const lineage = (id: string): FormaNode[] => {
    const out: FormaNode[] = [];
    for (
      let n = node(id);
      n && !out.includes(n);
      n = n.parentId === null ? undefined : node(n.parentId)
    ) {
      out.push(n);
    }
    return out;
  };
  const nearest = (id: string, test: (n: FormaNode) => boolean) => lineage(id).find(test);
  const behaviorOf = <K extends Behavior['kind']>(n: FormaNode, kind: K) =>
    n.behaviors.find((b): b is BehaviorOf<K> => b.kind === kind);
  const findBehavior = <K extends Behavior['kind']>(
    id: string,
    kind: K,
    test: (b: BehaviorOf<K>) => boolean = () => true,
  ) => {
    for (const n of lineage(id)) {
      const behavior = n.behaviors.find(
        (b): b is BehaviorOf<K> => b.kind === kind && test(b as BehaviorOf<K>),
      );
      if (behavior) return { node: n, behavior };
    }
    return undefined;
  };
  const equipmentOf = (id: string) => nearest(id, (n) => n.type === 'equipmentSlot');

  const descendants = (id: string): FormaNode[] => {
    const out: FormaNode[] = [];
    const queue = [...(node(id)?.children ?? [])];
    while (queue.length > 0) {
      const n = node(queue.shift()!);
      if (!n) continue;
      out.push(n);
      queue.push(...n.children);
    }
    return out;
  };

  const sourceOf = (id: string): string | undefined => {
    const self = node(id);
    const candidates = [...(self ? [self] : []), ...descendants(id), ...lineage(id).slice(1)];
    return (
      candidates.find((n) => n.bindings.length > 0)?.bindings[0]?.dataSourceId ??
      doc.dataSources[0]?.id
    );
  };

  const ownPaths = (n: FormaNode, dataSourceId: string | undefined) => {
    const out = n.bindings.map((b) => ({ dataSourceId: b.dataSourceId, path: b.path }));
    const tooltip = behaviorOf(n, 'tooltip');
    if (tooltip && dataSourceId) out.push({ dataSourceId, path: tooltip.bindingPath });
    return out;
  };

  /** Own bindings and tooltip first, then the subtree's: the paths that tell which item a node shows. */
  const itemPaths = (id: string) => {
    const self = node(id);
    if (!self) return [];
    const dataSourceId = sourceOf(id);
    return [self, ...descendants(id)].flatMap((n) =>
      ownPaths(n, n === self ? dataSourceId : sourceOf(n.id)),
    );
  };

  const cellOf = (id: string): Cell | undefined => {
    const equipment = equipmentOf(id);
    for (const { dataSourceId, path } of itemPaths(id)) {
      const split = splitViewPath(path);
      const first = split?.rest[0];
      if (split && first?.kind === 'index') {
        return {
          dataSourceId,
          filters: split.filters,
          viewKey: equipment ? null : viewKeyOf(dataSourceId, split.viewPath),
          index: first.index,
          equipmentId: equipment?.id ?? null,
        };
      }
    }
    const dataSourceId = sourceOf(id);
    return equipment && dataSourceId
      ? { dataSourceId, filters: [], viewKey: null, index: 0, equipmentId: equipment.id }
      : undefined;
  };

  const views = new Map<string, ViewSpec>();
  for (const id of order) {
    const n = node(id)!;
    if (equipmentOf(id)) continue;
    for (const { dataSourceId, path } of ownPaths(n, sourceOf(id))) {
      const split = splitViewPath(path);
      if (!split) continue;
      const key = viewKeyOf(dataSourceId, split.viewPath);
      const view = views.get(key) ?? { key, dataSourceId, filters: split.filters, capacity: 0 };
      const first = split.rest[0];
      if (first?.kind === 'index') view.capacity = Math.max(view.capacity, first.index + 1);
      views.set(key, view);
    }
  }

  const tabNodes = order.map((id) => node(id)!).filter((n) => behaviorOf(n, 'tabs'));
  const tabForNode = (id: string) => {
    for (const button of lineage(id)) {
      if (button.type !== 'button' || button.parentId === null) continue;
      const bar = node(button.parentId);
      const tabs = bar && behaviorOf(bar, 'tabs');
      const tab = tabs?.tabs.find((t) => t.label === button.props.label);
      if (bar && tab) return { tabNodeId: bar.id, tabId: tab.id };
    }
    return undefined;
  };

  const hiddenNodes = (activeTab: Readonly<Record<string, string>>) => {
    const hidden = new Set<string>();
    for (const bar of tabNodes) {
      const tabs = behaviorOf(bar, 'tabs')!;
      const active = activeTab[bar.id] ?? tabs.initialTabId;
      for (const tab of tabs.tabs) {
        if (tab.id === active) continue;
        const stack = [tab.contentNodeId];
        while (stack.length > 0) {
          const n = node(stack.pop()!);
          if (!n || hidden.has(n.id)) continue;
          hidden.add(n.id);
          stack.push(...n.children);
        }
      }
    }
    return hidden;
  };

  return {
    screen,
    node,
    lineage,
    nearest,
    behaviorOf,
    findBehavior,
    rect: (id) => rects.get(id),
    order,
    focusable: order.filter((id) => FOCUSABLE_TYPES.has(node(id)!.type)),
    tabNodes,
    views,
    sourceOf,
    cellOf,
    equipmentOf,
    equipmentSlots: order.map((id) => node(id)!).filter((n) => n.type === 'equipmentSlot'),
    tabForNode,
    hiddenNodes,
  };
}
