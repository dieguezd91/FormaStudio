import type { FormaDocument } from '../schema';
import { screenSchema } from '../schema';
import { validateScreenTree } from '../validate';
import type { Operation } from './schema';
import {
  clampIndex,
  fail,
  failure,
  findScreen,
  insertAt,
  lockViolation,
  removeBy,
  success,
  upsertBy,
  type ApplyContext,
  type ApplyResult,
} from './support';

type Ctx = Required<ApplyContext>;
type Op<T extends Operation['type']> = Extract<Operation, { type: T }>;

export function setToken(doc: FormaDocument, op: Op<'setToken'>): ApplyResult {
  const expected = op.group === 'colors' ? 'string' : 'number';
  if (typeof op.value !== expected) {
    return fail('invalidOperation', `Token group '${op.group}' only accepts ${expected} values.`);
  }
  const table: Record<string, string | number> = doc.tokens[op.group];
  const previous = Object.hasOwn(table, op.name) ? table[op.name] : undefined;
  const next = { ...doc, tokens: { ...doc.tokens, [op.group]: { ...table, [op.name]: op.value } } };
  return success(next, [
    previous === undefined
      ? { type: 'removeToken', group: op.group, name: op.name }
      : { type: 'setToken', group: op.group, name: op.name, value: previous },
  ]);
}

export function removeToken(doc: FormaDocument, op: Op<'removeToken'>): ApplyResult {
  const table: Record<string, string | number> = doc.tokens[op.group];
  const previous = Object.hasOwn(table, op.name) ? table[op.name] : undefined;
  if (previous === undefined) {
    return fail('itemNotFound', `Token '${op.group}.${op.name}' does not exist.`);
  }
  const { [op.name]: _removed, ...rest } = table;
  void _removed;
  const next = { ...doc, tokens: { ...doc.tokens, [op.group]: rest } };
  return success(next, [{ type: 'setToken', group: op.group, name: op.name, value: previous }]);
}

export function addScreen(doc: FormaDocument, op: Op<'addScreen'>): ApplyResult {
  const where = { screenId: op.screen.id };
  if (doc.screens.some((s) => s.id === op.screen.id)) {
    return fail('duplicateId', `Screen id '${op.screen.id}' already exists.`, where);
  }
  const parsed = screenSchema.safeParse(op.screen);
  const issue = parsed.success ? validateScreenTree(op.screen)[0] : undefined;
  if (!parsed.success || issue) {
    const message = parsed.success ? issue?.message : parsed.error.issues[0]?.message;
    return fail('invalidOperation', `Invalid screen '${op.screen.name}': ${message}`, where);
  }
  const index = clampIndex(op.index, doc.screens.length);
  return success({ ...doc, screens: insertAt(doc.screens, index, op.screen) }, [
    { type: 'removeScreen', screenId: op.screen.id },
  ]);
}

export function removeScreen(doc: FormaDocument, op: Op<'removeScreen'>, ctx: Ctx): ApplyResult {
  const screen = findScreen(doc, op.screenId);
  if (!screen.ok) return failure(screen.error);
  const locked = lockViolation(ctx, op.force, screen.value, Object.keys(screen.value.nodes));
  if (locked) return failure(locked);
  const removal = removeBy(doc.screens, (s) => s.id === op.screenId);
  if (!removal) return fail('screenNotFound', `Screen '${op.screenId}' does not exist.`);
  return success({ ...doc, screens: removal.list }, [
    { type: 'addScreen', screen: removal.removed, index: removal.index },
  ]);
}

export function renameScreen(doc: FormaDocument, op: Op<'renameScreen'>): ApplyResult {
  const screen = findScreen(doc, op.screenId);
  if (!screen.ok) return failure(screen.error);
  const next = {
    ...doc,
    screens: doc.screens.map((s) => (s.id === op.screenId ? { ...s, name: op.name } : s)),
  };
  return success(next, [{ type: 'renameScreen', screenId: op.screenId, name: screen.value.name }]);
}

export function upsertDataSource(doc: FormaDocument, op: Op<'upsertDataSource'>): ApplyResult {
  const { list, previous } = upsertBy(
    doc.dataSources,
    op.dataSource,
    (d) => d.id === op.dataSource.id,
    op.index,
  );
  return success({ ...doc, dataSources: list }, [
    previous
      ? { type: 'upsertDataSource', dataSource: previous }
      : { type: 'removeDataSource', dataSourceId: op.dataSource.id },
  ]);
}

export function removeDataSource(doc: FormaDocument, op: Op<'removeDataSource'>): ApplyResult {
  const removal = removeBy(doc.dataSources, (d) => d.id === op.dataSourceId);
  if (!removal) return fail('itemNotFound', `Data source '${op.dataSourceId}' does not exist.`);
  return success({ ...doc, dataSources: removal.list }, [
    { type: 'upsertDataSource', dataSource: removal.removed, index: removal.index },
  ]);
}

export function upsertIntent(doc: FormaDocument, op: Op<'upsertIntent'>): ApplyResult {
  const { list, previous } = upsertBy(
    doc.intents,
    op.intent,
    (i) => i.id === op.intent.id,
    op.index,
  );
  return success({ ...doc, intents: list }, [
    previous
      ? { type: 'upsertIntent', intent: previous }
      : { type: 'removeIntent', intentId: op.intent.id },
  ]);
}

export function removeIntent(doc: FormaDocument, op: Op<'removeIntent'>): ApplyResult {
  const removal = removeBy(doc.intents, (i) => i.id === op.intentId);
  if (!removal) return fail('itemNotFound', `Intent '${op.intentId}' does not exist.`);
  return success({ ...doc, intents: removal.list }, [
    { type: 'upsertIntent', intent: removal.removed, index: removal.index },
  ]);
}
