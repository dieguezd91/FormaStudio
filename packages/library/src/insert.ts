import {
  createId,
  tokenRefSchema,
  zodIssues,
  type Behavior,
  type Binding,
  type DataSource,
  type FormaDocument,
  type IdGenerator,
  type Intent,
  type Operation,
  type OperationBatch,
  type Result,
} from '@forma/design-core';
import type { BuildContext } from './catalog';
import { getEntry } from './registry';
import { createTokenKit, missingTokenOps } from './tokens';

export type InsertErrorCode =
  'entryNotFound' | 'invalidParams' | 'screenNotFound' | 'parentNotFound';

export interface InsertError {
  code: InsertErrorCode;
  message: string;
}

export interface InsertRequest {
  entryId: string;
  screenId: string;
  parentId: string;
  /** Overrides for the entry's defaults; validated against `entry.params`. */
  params?: Record<string, unknown>;
  idGen: IdGenerator;
}

const MAX_ID_ATTEMPTS = 10_000;

/** Ids of the form `<prefix>_<suffix>` that never collide with nodes already in the screen. */
function createNodeIdFactory(taken: Iterable<string>, idGen: IdGenerator) {
  const used = new Set(taken);
  return (prefix: string): string => {
    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
      const id = createId(prefix, idGen);
      if (!used.has(id)) {
        used.add(id);
        return id;
      }
    }
    throw new Error('idGen keeps producing ids that already exist in the screen.');
  };
}

type IdMap = ReadonlyMap<string, string>;

const remap = (map: IdMap, id: string): string => map.get(id) ?? id;

function remapBehavior(behavior: Behavior, intents: IdMap): Behavior {
  switch (behavior.kind) {
    case 'dragDrop':
    case 'split':
      return { ...behavior, intentId: remap(intents, behavior.intentId) };
    case 'contextMenu':
      return {
        ...behavior,
        actions: behavior.actions.map((a) => ({ ...a, intentId: remap(intents, a.intentId) })),
      };
    default:
      return behavior;
  }
}

const remapBinding = (binding: Binding, sources: IdMap): Binding => ({
  ...binding,
  dataSourceId: remap(sources, binding.dataSourceId),
});

/** Points references at the document's own ids when it already defines the same intent/source. */
function remapOperation(op: Operation, intents: IdMap, sources: IdMap): Operation {
  switch (op.type) {
    case 'addNode':
      return {
        ...op,
        node: {
          ...op.node,
          behaviors: op.node.behaviors.map((b) => remapBehavior(b, intents)),
          bindings: op.node.bindings.map((b) => remapBinding(b, sources)),
        },
      };
    case 'setBehavior':
      return { ...op, behavior: remapBehavior(op.behavior, intents) };
    case 'setBinding':
      return { ...op, binding: remapBinding(op.binding, sources) };
    default:
      return op;
  }
}

/**
 * Decides which shared definitions still have to be created. An item the document already has
 * (same id, or same name under another id) is kept untouched and references are redirected to it.
 */
function reconcile<T extends { id: string; name: string }>(
  built: readonly T[],
  existing: readonly T[],
): { missing: T[]; redirects: Map<string, string> } {
  const missing: T[] = [];
  const redirects = new Map<string, string>();
  const seen = new Set(existing.map((e) => e.id));
  for (const item of built) {
    const sameName = existing.find((e) => e.name === item.name);
    if (sameName && !seen.has(item.id)) redirects.set(item.id, sameName.id);
    else if (!seen.has(item.id)) {
      seen.add(item.id);
      missing.push(item);
    }
  }
  return { missing, redirects };
}

function usedTokenRefs(ops: readonly Operation[]): Set<string> {
  const refs = new Set<string>();
  for (const op of ops) {
    if (op.type !== 'addNode') continue;
    const values = [...Object.values(op.node.style), op.node.layout.gap, op.node.layout.padding];
    for (const value of values) {
      const ref = tokenRefSchema.safeParse(value);
      if (ref.success) refs.add(ref.data.token);
    }
  }
  return refs;
}

/**
 * Builds the batch that inserts a library entry as an editable subtree. Never touches `doc`:
 * the caller applies the batch with `applyBatch`. Shared tokens, data sources and intents are
 * only created when the document lacks them.
 */
export function insertEntry(
  doc: FormaDocument,
  request: InsertRequest,
): Result<OperationBatch, InsertError> {
  const fail = (code: InsertErrorCode, message: string): Result<never, InsertError> => ({
    ok: false,
    error: { code, message },
  });

  const entry = getEntry(request.entryId);
  if (!entry) return fail('entryNotFound', `Library entry '${request.entryId}' does not exist.`);
  const screen = doc.screens.find((s) => s.id === request.screenId);
  if (!screen) return fail('screenNotFound', `Screen '${request.screenId}' does not exist.`);
  if (!screen.nodes[request.parentId]) {
    return fail('parentNotFound', `Node '${request.parentId}' does not exist in the screen.`);
  }
  const params = entry.params.safeParse(request.params ?? {});
  if (!params.success) {
    const issue = zodIssues(params.error)[0];
    return fail(
      'invalidParams',
      `Invalid params for '${entry.id}': ${issue?.path || '<root>'}: ${issue?.message ?? ''}`,
    );
  }

  const ctx: BuildContext = {
    entryId: entry.id,
    idGen: request.idGen,
    newId: createNodeIdFactory(Object.keys(screen.nodes), request.idGen),
    screenId: screen.id,
    parentId: request.parentId,
    tokens: createTokenKit(),
  };
  const built = entry.build(params.data, ctx);

  const intents = reconcile<Intent>(built.intents, doc.intents);
  const sources = reconcile<DataSource>(built.dataSources, doc.dataSources);
  const buildOps =
    intents.redirects.size + sources.redirects.size === 0
      ? built.ops
      : built.ops.map((op) => remapOperation(op, intents.redirects, sources.redirects));

  const ops: Operation[] = [
    ...missingTokenOps(doc.tokens, usedTokenRefs(buildOps)),
    ...sources.missing.map((dataSource): Operation => ({ type: 'upsertDataSource', dataSource })),
    ...intents.missing.map((intent): Operation => ({ type: 'upsertIntent', intent })),
    ...buildOps,
  ];
  return {
    ok: true,
    value: {
      id: createId('batch', request.idGen),
      label: `Insertar ${entry.name}`,
      source: 'library',
      ops,
    },
  };
}
