import type { Behavior, FormaScreen, OperationBatch } from '@forma/design-core';
import { makeBatch } from './batches';

export const BEHAVIOR_LABELS: Record<Behavior['kind'], string> = {
  tabs: 'Pestañas',
  select: 'Selección',
  dragDrop: 'Arrastrar y soltar',
  stack: 'Pila',
  split: 'Dividir pila',
  contextMenu: 'Menú contextual',
  tooltip: 'Tooltip',
};

/** One readable line per behavior: kind plus its key parameters. */
export function summarizeBehavior(behavior: Behavior): string {
  const label = BEHAVIOR_LABELS[behavior.kind];
  switch (behavior.kind) {
    case 'tabs':
      return `${label} · ${behavior.tabs.length} pestañas`;
    case 'select':
      return `${label} · ${behavior.mode === 'single' ? 'simple' : 'múltiple'}`;
    case 'dragDrop': {
      const role = { source: 'origen', target: 'destino', both: 'origen y destino' }[behavior.role];
      return `Arrastrar y soltar · ${role} · intención ${behavior.intentId}`;
    }
    case 'stack':
      return `${label} · máx. ${behavior.maxStack} · ${behavior.showCount ? 'muestra cantidad' : 'oculta cantidad'}`;
    case 'split':
      return `${label} · intención ${behavior.intentId}`;
    case 'contextMenu':
      return `${label} · ${behavior.actions.map((a) => a.label).join(', ')}`;
    case 'tooltip':
      return `${label} · ${behavior.bindingPath}`;
  }
}

type StackBehavior = Extract<Behavior, { kind: 'stack' }>;
type ContextMenuBehavior = Extract<Behavior, { kind: 'contextMenu' }>;

const behaviorOf = <K extends Behavior['kind']>(screen: FormaScreen, nodeId: string, kind: K) =>
  screen.nodes[nodeId]?.behaviors.find((b): b is Extract<Behavior, { kind: K }> => b.kind === kind);

export function stackBatch(
  screen: FormaScreen,
  nodeId: string,
  change: Partial<Pick<StackBehavior, 'maxStack' | 'showCount'>>,
): OperationBatch | undefined {
  const current = behaviorOf(screen, nodeId, 'stack');
  if (!current) return undefined;
  return makeBatch(`Editar pila de '${screen.nodes[nodeId]?.name ?? nodeId}'`, [
    { type: 'setBehavior', screenId: screen.id, nodeId, behavior: { ...current, ...change } },
  ]);
}

export function actionLabelBatch(
  screen: FormaScreen,
  nodeId: string,
  actionId: string,
  label: string,
): OperationBatch | undefined {
  const current: ContextMenuBehavior | undefined = behaviorOf(screen, nodeId, 'contextMenu');
  if (!current?.actions.some((a) => a.id === actionId)) return undefined;
  const behavior: ContextMenuBehavior = {
    ...current,
    actions: current.actions.map((a) => (a.id === actionId ? { ...a, label } : a)),
  };
  return makeBatch(`Editar menú contextual de '${screen.nodes[nodeId]?.name ?? nodeId}'`, [
    { type: 'setBehavior', screenId: screen.id, nodeId, behavior },
  ]);
}
