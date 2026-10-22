import { EQUIPPED_AT, UID, reconcile, recordAt, removeRecord, uidOf } from './records';
import type { Cell, ScreenIndex } from './screen';
import type { DataRecord, RuntimeState } from './types';

/**
 * The built-in stand-in for the game (design doc §10.5). It decides what a real game would
 * decide, with simple rules, and only when no custom handler took the intent. Task 8's exporter
 * must keep the same payload keys and the same rules in the C# stub.
 */
export const SIMULATED_INTENTS = {
  moveItem: 'inventory.moveItem',
  equipItem: 'inventory.equipItem',
  useItem: 'inventory.useItem',
  dropItem: 'inventory.dropItem',
  splitStack: 'inventory.splitStack',
} as const;

export type SimResult = { ok: true } | { ok: false; reason: string };

const ok: SimResult = { ok: true };
const no = (reason: string): SimResult => ({ ok: false, reason });
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

const accepts = (list: readonly string[] | undefined, record: DataRecord): boolean =>
  !list ||
  list.length === 0 ||
  list.some((tag) => tag === 'item' || tag === record['slotType'] || tag === record['category']);

/** Whether dragging the item in `fromId` onto `toId` is allowed (drives `dropState` and the rule). */
export function checkDrop(
  state: RuntimeState,
  index: ScreenIndex,
  fromId: string,
  toId: string,
): SimResult {
  const from = index.cellOf(fromId);
  const record = from && recordAt(state, from);
  if (!from || !record) return no('La casilla de origen está vacía.');
  if (from.equipmentId !== null) return no('Desequipar no está soportado en la simulación.');
  const target = index.node(toId);
  const behavior = target && index.behaviorOf(target, 'dragDrop');
  if (!target || !behavior || behavior.role === 'source')
    return no('Esa casilla no admite objetos.');
  if (!accepts(behavior.accepts, record))
    return no(`Esa casilla no acepta «${text(record['name']) || text(record['id'])}».`);

  if (target.type === 'equipmentSlot') {
    if (record['slotType'] !== target.props.slotType) {
      return no(`Esa casilla solo acepta objetos de tipo «${target.props.slotType}».`);
    }
    return ok;
  }
  const to = index.cellOf(toId);
  if (!to || to.viewKey === null) return no('Esa casilla no muestra objetos.');
  if (to.viewKey !== from.viewKey) return no('Las casillas pertenecen a listas distintas.');
  return ok;
}

/** Largest stack the target slot may hold: the tighter of the slot's `stack` and the item's own limit. */
function stackLimit(index: ScreenIndex, toId: string, record: DataRecord): number {
  const fromSlot = index.findBehavior(toId, 'stack')?.behavior.maxStack;
  const fromItem = typeof record['maxStack'] === 'number' ? record['maxStack'] : undefined;
  const limits = [fromSlot, fromItem].filter((n): n is number => typeof n === 'number');
  return limits.length > 0 ? Math.min(...limits) : 1;
}

const quantityOf = (record: DataRecord): number =>
  typeof record['quantity'] === 'number' ? record['quantity'] : 1;

function moveOrEquip(
  state: RuntimeState,
  index: ScreenIndex,
  payload: Record<string, unknown>,
): SimResult {
  const fromId = text(payload['fromSlot']);
  const toId = text(payload['toSlot']);
  const check = checkDrop(state, index, fromId, toId);
  if (!check.ok) return check;
  const from = index.cellOf(fromId) as Cell;
  const to = index.cellOf(toId) as Cell;
  const moving = recordAt(state, from) as DataRecord;
  const slots = state.placement[from.viewKey as string] as (string | null)[];

  if (to.equipmentId !== null) {
    const previous = recordAt(state, to);
    slots[from.index] = previous ? uidOf(previous) : null;
    if (previous) delete previous[EQUIPPED_AT];
    moving[EQUIPPED_AT] = to.equipmentId;
    reconcile(state, index);
    return ok;
  }

  const target = recordAt(state, to);
  if (from.index === to.index) return ok;
  if (!target) {
    slots[to.index] = uidOf(moving);
    slots[from.index] = null;
    return ok;
  }
  const limit = stackLimit(index, toId, moving);
  if (target['id'] === moving['id'] && limit > 1 && quantityOf(target) < limit) {
    const total = quantityOf(target) + quantityOf(moving);
    target['quantity'] = Math.min(limit, total);
    moving['quantity'] = total - quantityOf(target);
    if (quantityOf(moving) <= 0) {
      removeRecord(state, from.dataSourceId, moving);
      reconcile(state, index);
    }
    return ok;
  }
  slots[to.index] = uidOf(moving);
  slots[from.index] = uidOf(target);
  return ok;
}

function itemAt(state: RuntimeState, index: ScreenIndex, payload: Record<string, unknown>) {
  const cell = index.cellOf(text(payload['slotId']));
  const record = cell && recordAt(state, cell);
  return cell && record ? { cell, record } : undefined;
}

function useItem(
  state: RuntimeState,
  index: ScreenIndex,
  payload: Record<string, unknown>,
): SimResult {
  const item = itemAt(state, index, payload);
  if (!item) return no('No hay ningún objeto que usar.');
  if (quantityOf(item.record) <= 1) {
    removeRecord(state, item.cell.dataSourceId, item.record);
    reconcile(state, index);
  } else {
    item.record['quantity'] = quantityOf(item.record) - 1;
  }
  return ok;
}

function dropItem(
  state: RuntimeState,
  index: ScreenIndex,
  payload: Record<string, unknown>,
): SimResult {
  const item = itemAt(state, index, payload);
  if (!item) return no('No hay ningún objeto que soltar.');
  removeRecord(state, item.cell.dataSourceId, item.record);
  reconcile(state, index);
  return ok;
}

function splitStack(
  state: RuntimeState,
  index: ScreenIndex,
  payload: Record<string, unknown>,
): SimResult {
  const item = itemAt(state, index, payload);
  if (!item) return no('No hay ninguna pila que dividir.');
  const amount = payload['amount'];
  if (
    typeof amount !== 'number' ||
    !Number.isInteger(amount) ||
    amount < 1 ||
    amount >= quantityOf(item.record)
  ) {
    return no('La cantidad a dividir no es válida.');
  }
  const view = item.cell.viewKey === null ? undefined : index.views.get(item.cell.viewKey);
  if (!view) return no('Las pilas equipadas no se pueden dividir.');
  const slots = state.placement[view.key] ?? [];
  let free = -1;
  for (let i = 0; i < view.capacity; i++) {
    if (!slots[i]) {
      free = i;
      break;
    }
  }
  if (free < 0) return no('No hay casillas libres para la nueva pila.');

  const created: DataRecord = { ...item.record, quantity: amount, [UID]: `r${state.nextUid++}` };
  item.record['quantity'] = quantityOf(item.record) - amount;
  const data = state.data[view.dataSourceId] as unknown[];
  data.push(created);
  slots[free] = uidOf(created);
  state.placement[view.key] = slots;
  return ok;
}

/** Applies the simulated effect of an intent, or undefined when the simulation does not know it. */
export function simulate(
  name: string,
  state: RuntimeState,
  index: ScreenIndex,
  payload: Record<string, unknown>,
): SimResult | undefined {
  switch (name) {
    case SIMULATED_INTENTS.moveItem:
    case SIMULATED_INTENTS.equipItem:
      return moveOrEquip(state, index, payload);
    case SIMULATED_INTENTS.useItem:
      return useItem(state, index, payload);
    case SIMULATED_INTENTS.dropItem:
      return dropItem(state, index, payload);
    case SIMULATED_INTENTS.splitStack:
      return splitStack(state, index, payload);
    default:
      return undefined;
  }
}
