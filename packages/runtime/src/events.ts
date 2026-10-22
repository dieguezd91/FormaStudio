import { isRecord } from './bindings';
import { emitIntent, type Env } from './intents';
import { nextFocus } from './navigation';
import { itemRefOf, publicRecord, recordAt, resolveRuntimePath } from './records';
import type { Cell } from './screen';
import { checkDrop } from './simulation';
import type {
  DataRecord,
  Direction,
  DropState,
  MenuAction,
  Point,
  RuntimeState,
  UiEvent,
} from './types';

const MODAL_EVENTS: ReadonlySet<UiEvent['type']> = new Set([
  'splitConfirm',
  'splitCancel',
  'cancel',
]);

const quantityOf = (record: DataRecord): number =>
  typeof record['quantity'] === 'number' ? record['quantity'] : 1;

const isVisible = (env: Env, state: RuntimeState, id: string) =>
  env.index.node(id) !== undefined && !env.index.hiddenNodes(state.ui.activeTab).has(id);

const itemOf = (
  env: Env,
  state: RuntimeState,
  nodeId: string,
): { cell: Cell; record: DataRecord } | undefined => {
  const cell = env.index.cellOf(nodeId);
  const record = cell && recordAt(state, cell);
  return cell && record ? { cell, record } : undefined;
};

function openMenu(
  env: Env,
  state: RuntimeState,
  nodeId: string,
  actions: readonly { id: string; label: string; intentId: string }[],
  anchor: Point,
): void {
  const item = itemOf(env, state, nodeId);
  if (env.index.cellOf(nodeId) && !item) return; // nothing to act on in an empty slot
  const splitIntent = env.index.findBehavior(nodeId, 'split')?.behavior.intentId;
  const entries: MenuAction[] = actions.map((a) => ({
    ...a,
    disabled: a.intentId === splitIntent && item !== undefined && quantityOf(item.record) <= 1,
  }));
  state.ui.menu = { nodeId, actions: entries, anchor };
  state.ui.tooltip = null;
}

function select(env: Env, state: RuntimeState, nodeId: string, additive: boolean): void {
  const found = env.index.findBehavior(nodeId, 'select');
  if (!found) return;
  const scope = found.node.parentId ?? found.node.id;
  const current = state.ui.selection[scope] ?? [];
  const id = found.node.id;
  state.ui.selection[scope] =
    found.behavior.mode === 'multi' && additive
      ? current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id]
      : [id];
}

function click(env: Env, state: RuntimeState, nodeId: string, additive: boolean): void {
  if (!isVisible(env, state, nodeId)) return;
  const { index } = env;
  state.ui.menu = null;

  const tab = index.tabForNode(nodeId);
  if (tab) {
    state.ui.activeTab[tab.tabNodeId] = tab.tabId;
    state.ui.tooltip = null;
  }
  select(env, state, nodeId, additive);

  const trigger = index.findBehavior(nodeId, 'contextMenu', (b) => b.trigger === 'button');
  const rect = trigger && index.rect(trigger.node.id);
  if (trigger && rect) {
    openMenu(env, state, trigger.node.id, trigger.behavior.actions, {
      x: rect.x,
      y: rect.y + rect.height,
    });
  }
  const focusable = index.lineage(nodeId).find((n) => index.focusable.includes(n.id));
  if (focusable) state.ui.focus = focusable.id;
}

function contextTrigger(
  env: Env,
  state: RuntimeState,
  event: Extract<UiEvent, { type: 'secondaryClick' | 'longPress' }>,
): void {
  if (!isVisible(env, state, event.nodeId)) return;
  state.ui.menu = null;
  const found = env.index.findBehavior(
    event.nodeId,
    'contextMenu',
    (b) => b.trigger === event.type,
  );
  if (found) openMenu(env, state, found.node.id, found.behavior.actions, event.anchor);
}

function hover(env: Env, state: RuntimeState, nodeId: string | null): void {
  state.ui.tooltip = null;
  if (nodeId === null || state.ui.drag || state.ui.menu || !isVisible(env, state, nodeId)) return;
  const found = env.index.findBehavior(nodeId, 'tooltip');
  const dataSourceId = found && env.index.sourceOf(found.node.id);
  if (!found || !dataSourceId) return;
  const equipment = env.index.equipmentOf(found.node.id);
  const record = resolveRuntimePath(
    state,
    dataSourceId,
    found.behavior.bindingPath,
    equipment?.id ?? null,
  );
  if (isRecord(record)) state.ui.tooltip = { nodeId: found.node.id, record: publicRecord(record) };
}

function dragStart(env: Env, state: RuntimeState, nodeId: string): void {
  if (!isVisible(env, state, nodeId)) return;
  const found = env.index.findBehavior(nodeId, 'dragDrop', (b) => b.role !== 'target');
  const item = found && itemOf(env, state, found.node.id);
  if (!found || !item) return;
  state.ui.menu = null;
  state.ui.tooltip = null;
  state.ui.drag = {
    sourceNodeId: found.node.id,
    itemRef: itemRefOf(item.cell.dataSourceId, item.record),
    overNodeId: null,
  };
}

function drop(env: Env, state: RuntimeState, nodeId: string): void {
  const drag = state.ui.drag;
  if (!drag) return;
  state.ui.drag = null;
  const target = isVisible(env, state, nodeId)
    ? env.index.findBehavior(nodeId, 'dragDrop', (b) => b.role !== 'source')
    : undefined;
  if (!target || target.node.id === drag.sourceNodeId) return;
  const slotType =
    target.node.type === 'equipmentSlot' ? { slotType: target.node.props.slotType } : {};
  emitIntent(env, state, target.behavior.intentId, {
    itemId: drag.itemRef.itemId,
    fromSlot: drag.sourceNodeId,
    toSlot: target.node.id,
    ...slotType,
  });
}

function menuAction(env: Env, state: RuntimeState, actionId: string): void {
  const menu = state.ui.menu;
  const action = menu?.actions.find((a) => a.id === actionId);
  if (!menu || !action || action.disabled) return;
  state.ui.menu = null;
  const item = itemOf(env, state, menu.nodeId);
  const split = env.index.findBehavior(menu.nodeId, 'split');
  if (split?.behavior.intentId === action.intentId && item) {
    state.ui.split = {
      nodeId: menu.nodeId,
      itemRef: itemRefOf(item.cell.dataSourceId, item.record),
      max: quantityOf(item.record) - 1,
    };
    return;
  }
  emitIntent(env, state, action.intentId, {
    actionId: action.id,
    slotId: menu.nodeId,
    ...(item ? { itemId: item.record['id'] } : {}),
  });
}

function splitConfirm(env: Env, state: RuntimeState, amount: number): void {
  const split = state.ui.split;
  if (!split || !Number.isInteger(amount) || amount < 1 || amount > split.max) return;
  const intentId = env.index.findBehavior(split.nodeId, 'split')?.behavior.intentId;
  state.ui.split = null;
  if (!intentId) return;
  emitIntent(env, state, intentId, {
    itemId: split.itemRef.itemId,
    amount,
    slotId: split.nodeId,
  });
}

function navigate(env: Env, state: RuntimeState, direction: Direction): void {
  if (state.ui.menu) return;
  const hidden = env.index.hiddenNodes(state.ui.activeTab);
  const candidates = env.index.focusable.filter((id) => !hidden.has(id));
  state.ui.focus = nextFocus(env.index, candidates, state.ui.focus, direction);
}

/** Applies one UI event to a mutable draft of the state. `reset` is handled by the runtime. */
export function handleEvent(env: Env, state: RuntimeState, event: UiEvent): void {
  if (state.ui.split && !MODAL_EVENTS.has(event.type)) return; // the split dialog is modal
  switch (event.type) {
    case 'click':
      return click(env, state, event.nodeId, event.additive ?? false);
    case 'secondaryClick':
    case 'longPress':
      return contextTrigger(env, state, event);
    case 'hover':
      return hover(env, state, event.nodeId);
    case 'dragStart':
      return dragStart(env, state, event.nodeId);
    case 'dragOver':
      if (state.ui.drag && isVisible(env, state, event.nodeId)) {
        state.ui.drag.overNodeId = event.nodeId;
      }
      return;
    case 'drop':
      return drop(env, state, event.nodeId);
    case 'dragCancel':
      state.ui.drag = null;
      return;
    case 'menuAction':
      return menuAction(env, state, event.actionId);
    case 'menuClose':
      state.ui.menu = null;
      return;
    case 'splitConfirm':
      return splitConfirm(env, state, event.amount);
    case 'splitCancel':
      state.ui.split = null;
      return;
    case 'navigate':
      return navigate(env, state, event.direction);
    case 'submit':
      if (state.ui.menu || state.ui.focus === null) return;
      return click(env, state, state.ui.focus, false);
    case 'cancel':
      if (state.ui.split) state.ui.split = null;
      else if (state.ui.menu) state.ui.menu = null;
      else state.ui.drag = null;
      return;
    case 'reset':
      return;
  }
}

/** Whether dropping what is dragged onto `nodeId` would be accepted (null: not a drop target). */
export function dropStateOf(env: Env, state: RuntimeState, nodeId: string): DropState | null {
  const drag = state.ui.drag;
  const node = env.index.node(nodeId);
  const behavior = node && env.index.behaviorOf(node, 'dragDrop');
  if (!drag || !behavior || behavior.role === 'source' || nodeId === drag.sourceNodeId) return null;
  return checkDrop(state, env.index, drag.sourceNodeId, nodeId).ok ? 'accept' : 'reject';
}
