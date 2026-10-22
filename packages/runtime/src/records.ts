import { cloneJson } from './clone';
import {
  isBookkeepingKey,
  isRecord,
  matchesFilters,
  resolveBindingPath,
  splitViewPath,
  walkSteps,
} from './bindings';
import type { Cell, ScreenIndex } from './screen';
import { viewKeyOf } from './screen';
import type { DataRecord, ItemRef, RuntimeState } from './types';

/**
 * Slot model. A record belongs to every item view whose filters it matches, unless it is
 * equipped. Each view keeps an ordered `placement` array (record uid or null = empty slot);
 * the slot bound to `<view>[n]` shows `placement[n]`. Equipped records carry `__equippedAt`
 * (the equipment slot node id) and leave every bag view; an equipment slot shows the record
 * equipped at it. Views are reconciled after every data change: records that no longer belong
 * disappear (their slot empties), new members take the first empty slot.
 */
export const UID = '__uid';
export const EQUIPPED_AT = '__equippedAt';

export const uidOf = (record: DataRecord): string => String(record[UID]);

export const publicRecord = (record: DataRecord): DataRecord =>
  Object.fromEntries(Object.entries(record).filter(([key]) => !isBookkeepingKey(key)));

/** Strips bookkeeping from a resolved value (a record, or a list of them). */
export function publicValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(publicValue);
  return isRecord(value) ? publicRecord(value) : value;
}

export const recordsOf = (
  state: Pick<RuntimeState, 'data'>,
  dataSourceId: string,
): DataRecord[] => {
  const data = state.data[dataSourceId];
  return Array.isArray(data) ? data.filter(isRecord) : [];
};

const isEquipped = (record: DataRecord) => record[EQUIPPED_AT] !== undefined;

const members = (records: DataRecord[], filters: Cell['filters']) =>
  records.filter((r) => !isEquipped(r) && matchesFilters(r, filters));

export function itemRefOf(dataSourceId: string, record: DataRecord): ItemRef {
  return {
    dataSourceId,
    uid: uidOf(record),
    ...(typeof record['id'] === 'string' ? { itemId: record['id'] } : {}),
  };
}

/** Gives every record a uid; keeps existing ones. */
export function tagRecords(data: unknown, nextUid: number): { data: unknown; nextUid: number } {
  if (!Array.isArray(data)) return { data, nextUid };
  const tagged = data.map((row) => {
    if (!isRecord(row)) return row;
    const record = { ...row };
    if (record[UID] === undefined) record[UID] = `r${nextUid++}`;
    return record;
  });
  return { data: tagged, nextUid };
}

/** Brings every view's placement in line with the data (see the slot model above). */
export function reconcile(state: RuntimeState, index: ScreenIndex): void {
  for (const view of index.views.values()) {
    if (!Array.isArray(state.data[view.dataSourceId])) continue;
    const belonging = members(recordsOf(state, view.dataSourceId), view.filters).map(uidOf);
    const belongs = new Set(belonging);
    const slots = (state.placement[view.key] ?? []).map((uid) =>
      uid !== null && belongs.has(uid) ? uid : null,
    );
    const placed = new Set(slots);
    for (const uid of belonging) {
      if (placed.has(uid)) continue;
      const free = slots.indexOf(null);
      if (free >= 0) slots[free] = uid;
      else slots.push(uid);
    }
    state.placement[view.key] = slots;
  }
}

/** Initial state of the data: working copies, uids, claimed equipment, filled views. */
export function seedRecords(
  state: RuntimeState,
  index: ScreenIndex,
  mocks: ReadonlyMap<string, unknown>,
): void {
  for (const [id, mock] of mocks) {
    const tagged = tagRecords(cloneJson(mock), state.nextUid);
    state.data[id] = tagged.data;
    state.nextUid = tagged.nextUid;
  }
  // The mock paper doll shows items in the equipment slots: those items start equipped.
  for (const slot of index.equipmentSlots) {
    const cell = index.cellOf(slot.id);
    if (!cell) continue;
    const candidate = members(recordsOf(state, cell.dataSourceId), cell.filters)[cell.index];
    if (candidate) candidate[EQUIPPED_AT] = slot.id;
  }
  reconcile(state, index);
}

/** The record sitting in a view slot, or the one equipped at an equipment slot. */
export function recordAt(state: RuntimeState, cell: Cell): DataRecord | undefined {
  const records = recordsOf(state, cell.dataSourceId);
  if (cell.equipmentId !== null) return records.find((r) => r[EQUIPPED_AT] === cell.equipmentId);
  const uid = cell.viewKey === null ? null : state.placement[cell.viewKey]?.[cell.index];
  return uid ? records.find((r) => uidOf(r) === uid) : undefined;
}

export function removeRecord(state: RuntimeState, dataSourceId: string, record: DataRecord): void {
  const data = state.data[dataSourceId];
  if (Array.isArray(data)) state.data[dataSourceId] = data.filter((row) => row !== record);
}

/**
 * Resolves a binding path over the runtime data, honoring slot placement (so moves are visible)
 * and equipment scoping. Same result shape as `resolveBindingPath`.
 */
export function resolveRuntimePath(
  state: Pick<RuntimeState, 'data' | 'placement'>,
  dataSourceId: string,
  path: string,
  equipmentId: string | null,
): unknown {
  const data = state.data[dataSourceId];
  if (!Array.isArray(data)) return publicValue(resolveBindingPath(data, path));
  const split = splitViewPath(path);
  if (!split) return undefined;

  const scoped = recordsOf(state, dataSourceId).filter((r) =>
    equipmentId === null ? !isEquipped(r) : r[EQUIPPED_AT] === equipmentId,
  );
  const matching = scoped.filter((r) => matchesFilters(r, split.filters));
  const layout =
    equipmentId === null ? state.placement[viewKeyOf(dataSourceId, split.viewPath)] : undefined;
  const byUid = new Map(matching.map((r) => [uidOf(r), r]));
  const slots = layout
    ? layout.map((uid) => (uid === null ? undefined : byUid.get(uid)))
    : matching;

  const [first, ...rest] = split.rest;
  if (first === undefined)
    return publicValue(layout ? slots.filter((r) => r !== undefined) : matching);
  if (first.kind === 'index') return publicValue(walkSteps(slots[first.index], rest));
  return undefined;
}
