import { describe, expect, it } from 'vitest';
import { createNode, createScreen } from '../factory';
import type { DataSource, Intent } from '../schema';
import { makeDoc } from '../test-fixtures';
import { applyOperation } from './apply';
import { expectRoundTrip } from './testing';

const doc = makeDoc();

function failure(op: Parameters<typeof applyOperation>[1]) {
  const result = applyOperation(doc, op);
  if (result.ok) throw new Error('expected failure');
  return result.error;
}

describe('tokens', () => {
  it('sets, overwrites and removes tokens', () => {
    const added = expectRoundTrip(doc, {
      type: 'setToken',
      group: 'colors',
      name: 'primary',
      value: '#123456',
    });
    expect(added.tokens.colors).toEqual({ primary: '#123456' });
    const overwritten = expectRoundTrip(added, {
      type: 'setToken',
      group: 'colors',
      name: 'primary',
      value: '#ffffff',
    });
    expect(overwritten.tokens.colors['primary']).toBe('#ffffff');
    const removed = expectRoundTrip(added, {
      type: 'removeToken',
      group: 'colors',
      name: 'primary',
    });
    expect(removed.tokens.colors).toEqual({});
  });

  it('checks the value type against the group', () => {
    expect(failure({ type: 'setToken', group: 'colors', name: 'x', value: 4 }).code).toBe(
      'invalidOperation',
    );
    expect(failure({ type: 'setToken', group: 'spacing', name: 'x', value: '4' }).code).toBe(
      'invalidOperation',
    );
    expect(failure({ type: 'removeToken', group: 'radii', name: 'nope' }).code).toBe(
      'itemNotFound',
    );
  });
});

describe('screens', () => {
  const extra = createScreen({ id: 's2', rootId: 'root2', name: 'Equipment' });

  it('adds a screen (at an index) and removes it', () => {
    const added = expectRoundTrip(doc, { type: 'addScreen', screen: extra });
    expect(added.screens.map((s) => s.id)).toEqual(['s1', 's2']);
    const first = expectRoundTrip(doc, { type: 'addScreen', screen: extra, index: 0 });
    expect(first.screens.map((s) => s.id)).toEqual(['s2', 's1']);
  });

  it('removes a screen and restores it at the same position', () => {
    const two = expectRoundTrip(doc, { type: 'addScreen', screen: extra, index: 0 });
    const after = expectRoundTrip(two, { type: 'removeScreen', screenId: 's1' });
    expect(after.screens.map((s) => s.id)).toEqual(['s2']);
  });

  it('renames a screen', () => {
    const after = expectRoundTrip(doc, { type: 'renameScreen', screenId: 's1', name: 'Bag' });
    expect(after.screens[0]?.name).toBe('Bag');
  });

  it('rejects duplicate, unknown and structurally invalid screens', () => {
    expect(failure({ type: 'addScreen', screen: { ...extra, id: 's1' } }).code).toBe('duplicateId');
    expect(failure({ type: 'removeScreen', screenId: 'zzz' }).code).toBe('screenNotFound');
    expect(failure({ type: 'renameScreen', screenId: 'zzz', name: 'x' }).code).toBe(
      'screenNotFound',
    );
    const broken = { ...extra, rootId: 'missing' };
    expect(failure({ type: 'addScreen', screen: broken }).code).toBe('invalidOperation');
    const ghost = createNode('slot', { id: 'g', name: 'G', parentId: 'nowhere' });
    const orphaned = { ...extra, nodes: { ...extra.nodes, g: ghost } };
    expect(failure({ type: 'addScreen', screen: orphaned }).code).toBe('invalidOperation');
  });
});

describe('data sources and intents', () => {
  const source: DataSource = {
    id: 'ds_equip',
    name: 'Equipment',
    kind: 'object',
    fields: [{ name: 'weapon', type: 'string' }],
    mock: { weapon: 'sword' },
    connection: 'simulated',
  };
  const intent: Intent = {
    id: 'i_equip',
    name: 'inventory.equip',
    description: 'Equip an item',
    payload: [],
    connection: 'unconnected',
  };

  it('upserts a data source by id, preserving position on replace and remove', () => {
    const added = expectRoundTrip(doc, { type: 'upsertDataSource', dataSource: source });
    expect(added.dataSources.map((d) => d.id)).toEqual(['ds_inv', 'ds_equip']);
    const replaced = expectRoundTrip(added, {
      type: 'upsertDataSource',
      dataSource: { ...doc.dataSources[0]!, name: 'Renamed' },
    });
    expect(replaced.dataSources[0]?.name).toBe('Renamed');
    const removed = expectRoundTrip(added, { type: 'removeDataSource', dataSourceId: 'ds_inv' });
    expect(removed.dataSources.map((d) => d.id)).toEqual(['ds_equip']);
  });

  it('upserts an intent by id, preserving position on replace and remove', () => {
    const added = expectRoundTrip(doc, { type: 'upsertIntent', intent, index: 0 });
    expect(added.intents.map((i) => i.id)).toEqual(['i_equip', 'i_move', 'i_use']);
    const replaced = expectRoundTrip(added, {
      type: 'upsertIntent',
      intent: { ...intent, description: 'Changed' },
    });
    expect(replaced.intents[0]?.description).toBe('Changed');
    const removed = expectRoundTrip(added, { type: 'removeIntent', intentId: 'i_move' });
    expect(removed.intents.map((i) => i.id)).toEqual(['i_equip', 'i_use']);
  });

  it('rejects removing unknown entries', () => {
    expect(failure({ type: 'removeDataSource', dataSourceId: 'zzz' }).code).toBe('itemNotFound');
    expect(failure({ type: 'removeIntent', intentId: 'zzz' }).code).toBe('itemNotFound');
  });
});
