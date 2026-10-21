import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  createSequentialIdGenerator,
  parseOperationBatch,
  validateDocument,
  type FormaDocument,
  type FormaNode,
} from '@forma/design-core';
import { insertEntry } from './insert';
import { getEntry } from './registry';
import {
  EXPECTED_IDS,
  ROOT_ID,
  SCREEN_ID,
  deepFreeze,
  insertAndApply,
  makeBaseDoc,
  nodesOf,
  subtree,
} from './test-helpers';

const NON_DEFAULT_PARAMS: Record<(typeof EXPECTED_IDS)[number], Record<string, unknown>> = {
  button: { label: 'Aceptar', width: 200, height: 60 },
  text: { text: 'Hola', align: 'center', size: 'title' },
  panel: { width: 400, height: 300 },
  tabBar: { tabs: ['A', 'B'] },
  contextMenu: { actions: ['Uno', 'Dos'] },
  tooltip: { width: 320, showRarity: false },
  'inventory.grid': { columns: 3, rows: 2, slotSize: 48, maxStack: 20, showCount: false },
  'inventory.tabs': { categories: ['Armas', 'Consumibles'], columns: 4, rows: 3 },
  'inventory.equipment': { slots: ['head', 'weapon'] },
  'inventory.list': { rows: 5, category: 'Armas' },
  'inventory.grid+equipment': { columns: 4, rows: 3, slots: ['head', 'chest', 'weapon'] },
};

describe.each(EXPECTED_IDS)('insertEntry(%s)', (entryId) => {
  const insert = (params?: Record<string, unknown>) =>
    insertAndApply(makeBaseDoc(), entryId, params);

  it('yields a valid document with default params', () => {
    const { doc, batch, rootNodeId } = insert();
    expect(batch.source).toBe('library');
    expect(batch.label).toBe(`Insertar ${getEntry(entryId)?.name}`);
    const root = doc.screens[0]?.nodes[rootNodeId];
    expect(root?.parentId).toBe(ROOT_ID);
    expect(doc.screens[0]?.nodes[ROOT_ID]?.children).toContain(rootNodeId);
  });

  it('yields a valid document with non-default params', () => {
    const { doc } = insert(NON_DEFAULT_PARAMS[entryId]);
    expect(validateDocument(doc)).toEqual([]);
  });

  it('marks every inserted node as library-origin with the entry id', () => {
    const { doc, rootNodeId } = insert();
    const nodes = subtree(doc, rootNodeId);
    expect(nodes.length).toBeGreaterThan(0);
    for (const node of nodes) expect(node.origin).toEqual({ source: 'library', ref: entryId });
  });

  it('emits a serializable batch accepted by the operation parser', () => {
    const { batch } = insert();
    expect(parseOperationBatch(JSON.parse(JSON.stringify(batch))).ok).toBe(true);
  });

  it('declares exactly the behavior kinds its nodes carry', () => {
    const { doc, rootNodeId } = insert();
    const kinds = new Set(subtree(doc, rootNodeId).flatMap((n) => n.behaviors.map((b) => b.kind)));
    expect([...kinds].sort()).toEqual([...(getEntry(entryId)?.behaviors ?? [])].sort());
  });

  it('is fully undone by the inverse batch', () => {
    const base = makeBaseDoc();
    const { inverseBatch, doc } = insertAndApply(base, entryId);
    const undone = applyBatch(doc, inverseBatch);
    expect(undone.ok && undone.doc).toEqual(base);
  });

  it('never mutates the input document', () => {
    const base = deepFreeze(makeBaseDoc());
    const result = insertEntry(base, {
      entryId,
      screenId: SCREEN_ID,
      parentId: ROOT_ID,
      idGen: createSequentialIdGenerator(),
    });
    expect(result.ok).toBe(true);
  });

  it('inserts twice into one screen without id collisions, even with a restarted idGen', () => {
    const first = insert();
    const second = insertAndApply(first.doc, entryId, undefined, createSequentialIdGenerator());
    expect(second.rootNodeId).not.toBe(first.rootNodeId);
    expect(validateDocument(second.doc)).toEqual([]);
  });
});

describe('insertEntry shared definitions', () => {
  const countOps = (ops: { type: string }[], type: string) =>
    ops.filter((o) => o.type === type).length;

  it('includes the mock data source and all shared intents on first insert', () => {
    const { batch, doc } = insertAndApply(makeBaseDoc(), 'inventory.grid');
    expect(countOps(batch.ops, 'upsertDataSource')).toBe(1);
    expect(countOps(batch.ops, 'upsertIntent')).toBeGreaterThanOrEqual(5);
    expect(doc.dataSources.map((d) => d.id)).toEqual(['inventory.items']);
    expect(doc.intents.map((i) => i.id)).toEqual(
      expect.arrayContaining([
        'inventory.moveItem',
        'inventory.useItem',
        'inventory.splitStack',
        'inventory.dropItem',
      ]),
    );
  });

  it('dedupes data sources and intents already present in the document', () => {
    const first = insertAndApply(makeBaseDoc(), 'inventory.grid');
    const second = insertAndApply(first.doc, 'inventory.equipment');
    expect(countOps(second.batch.ops, 'upsertDataSource')).toBe(0);
    expect(countOps(second.batch.ops, 'upsertIntent')).toBe(0);
    expect(second.doc.dataSources).toHaveLength(1);
    expect(second.doc.intents).toHaveLength(first.doc.intents.length);
  });

  it('keeps a user-edited data source instead of overwriting it', () => {
    const first = insertAndApply(makeBaseDoc(), 'inventory.grid');
    const edited: FormaDocument = {
      ...first.doc,
      dataSources: first.doc.dataSources.map((d) => ({ ...d, mock: [{ id: 'x' }] })),
    };
    const second = insertAndApply(edited, 'inventory.list');
    expect(second.doc.dataSources[0]?.mock).toEqual([{ id: 'x' }]);
  });

  it('reuses an existing intent with the same name but a different id', () => {
    const base = makeBaseDoc();
    const custom: FormaDocument = {
      ...base,
      intents: [
        {
          id: 'game_move',
          name: 'inventory.moveItem',
          description: 'del juego',
          payload: [],
          connection: 'connected',
        },
      ],
    };
    const { doc, batch } = insertAndApply(custom, 'inventory.grid');
    expect(
      batch.ops.some((o) => o.type === 'upsertIntent' && o.intent.name === 'inventory.moveItem'),
    ).toBe(false);
    expect(doc.intents.filter((i) => i.name === 'inventory.moveItem')).toHaveLength(1);
    const used = nodesOf(doc)
      .flatMap((n) => n.behaviors)
      .flatMap((b) => (b.kind === 'dragDrop' ? [b.intentId] : []));
    expect(used.length).toBeGreaterThan(0);
    expect(new Set(used)).toEqual(new Set(['game_move']));
  });

  it('adds only the missing design tokens and never overwrites project tokens', () => {
    const base = makeBaseDoc();
    const themed: FormaDocument = {
      ...base,
      tokens: { ...base.tokens, colors: { surface: '#ffffff' } },
    };
    const { doc, batch } = insertAndApply(themed, 'panel');
    expect(doc.tokens.colors.surface).toBe('#ffffff');
    expect(batch.ops.some((o) => o.type === 'setToken' && o.name === 'surface')).toBe(false);
    expect(batch.ops.some((o) => o.type === 'setToken')).toBe(true);
  });

  it('styles nodes with token refs rather than literal colors', () => {
    const { doc, rootNodeId } = insertAndApply(makeBaseDoc(), 'inventory.tabs');
    const fills = subtree(doc, rootNodeId).map((n: FormaNode) => n.style.fill);
    expect(fills.some((f) => typeof f === 'object')).toBe(true);
    expect(fills.some((f) => typeof f === 'string')).toBe(false);
  });
});

describe('insertEntry errors', () => {
  const request = { entryId: 'panel', screenId: SCREEN_ID, parentId: ROOT_ID };
  const idGen = createSequentialIdGenerator();

  it.each([
    ['unknown entry', { ...request, entryId: 'nope' }, 'entryNotFound'],
    ['unknown screen', { ...request, screenId: 'nope' }, 'screenNotFound'],
    ['unknown parent', { ...request, parentId: 'nope' }, 'parentNotFound'],
    [
      'invalid params',
      { ...request, entryId: 'inventory.grid', params: { columns: 0 } },
      'invalidParams',
    ],
  ])('rejects %s', (_label, req, code) => {
    const result = insertEntry(makeBaseDoc(), { ...req, idGen });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe(code);
  });
});
