import { describe, expect, it } from 'vitest';
import {
  behaviorSchema,
  bindingSchema,
  dataSourceSchema,
  formaDocumentSchema,
  intentSchema,
  nodeSchema,
  styleValue,
} from './index';
import { z } from 'zod';
import { createEmptyDocument, createNode, createScreen } from '../factory';

const baseNode = createNode('panel', { id: 'n1', name: 'Panel' });

describe('node schema', () => {
  it('accepts every documented node type with its default props', () => {
    const types = [
      'frame',
      'panel',
      'text',
      'image',
      'button',
      'scroll',
      'tabBar',
      'inventoryGrid',
      'slot',
      'itemView',
      'equipmentSlot',
      'contextMenu',
      'tooltip',
    ] as const;
    for (const type of types) {
      const node = createNode(type, { id: `n_${type}`, name: type });
      expect(nodeSchema.safeParse(node).success, type).toBe(true);
    }
  });

  it('rejects an unknown node type', () => {
    expect(nodeSchema.safeParse({ ...baseNode, type: 'carousel' }).success).toBe(false);
  });

  it('rejects props that belong to another type', () => {
    const bad = { ...baseNode, type: 'text', props: { label: 'x' } };
    expect(nodeSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects non-positive grid dimensions', () => {
    const grid = createNode('inventoryGrid', { id: 'g', name: 'G' });
    const bad = { ...grid, props: { ...grid.props, rows: 0 } };
    expect(nodeSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts literal and token-ref style values', () => {
    const node = {
      ...baseNode,
      style: { fill: { token: 'colors.primary' }, stroke: '#fff', radius: { token: 'radii.md' } },
    };
    expect(nodeSchema.safeParse(node).success).toBe(true);
  });

  it('rejects malformed token refs and wrong literal types', () => {
    expect(nodeSchema.safeParse({ ...baseNode, style: { fill: { tok: 'x' } } }).success).toBe(
      false,
    );
    expect(nodeSchema.safeParse({ ...baseNode, style: { opacity: 'half' } }).success).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    expect(nodeSchema.safeParse({ ...baseNode, extra: 1 }).success).toBe(false);
  });
});

describe('styleValue', () => {
  it('wraps a literal schema with a token ref alternative', () => {
    const s = styleValue(z.number());
    expect(s.safeParse(3).success).toBe(true);
    expect(s.safeParse({ token: 'spacing.sm' }).success).toBe(true);
    expect(s.safeParse('3').success).toBe(false);
  });
});

describe('behavior schema', () => {
  it('parses each behavior kind', () => {
    const behaviors = [
      {
        kind: 'tabs',
        tabs: [{ id: 't1', label: 'Items', contentNodeId: 'c1' }],
        initialTabId: 't1',
      },
      { kind: 'select', mode: 'single' },
      { kind: 'dragDrop', role: 'both', accepts: ['item'], intentId: 'i1' },
      { kind: 'stack', maxStack: 99, showCount: true },
      { kind: 'split', intentId: 'i2' },
      {
        kind: 'contextMenu',
        trigger: 'secondaryClick',
        actions: [{ id: 'a1', label: 'Use', intentId: 'i3' }],
      },
      { kind: 'tooltip', bindingPath: 'name' },
    ];
    for (const b of behaviors) expect(behaviorSchema.safeParse(b).success, b.kind).toBe(true);
  });

  it('rejects unknown kinds and invalid enums', () => {
    expect(behaviorSchema.safeParse({ kind: 'hover' }).success).toBe(false);
    expect(behaviorSchema.safeParse({ kind: 'select', mode: 'all' }).success).toBe(false);
    expect(behaviorSchema.safeParse({ kind: 'stack', maxStack: 0, showCount: true }).success).toBe(
      false,
    );
  });
});

describe('data schemas', () => {
  it('parses a data source with JSON mock data', () => {
    const ds = {
      id: 'ds1',
      name: 'Inventory',
      kind: 'collection',
      fields: [{ name: 'icon', type: 'image' }],
      mock: [{ icon: 'sword.png', nested: { a: [1, null, true] } }],
      connection: 'simulated',
    };
    expect(dataSourceSchema.safeParse(ds).success).toBe(true);
  });

  it('rejects an unknown field type or connection', () => {
    const ds = { id: 'ds1', name: 'x', kind: 'object', fields: [], mock: {}, connection: 'live' };
    expect(dataSourceSchema.safeParse(ds).success).toBe(false);
    expect(
      dataSourceSchema.safeParse({
        ...ds,
        connection: 'simulated',
        fields: [{ name: 'a', type: 'date' }],
      }).success,
    ).toBe(false);
  });

  it('parses bindings and intents', () => {
    expect(
      bindingSchema.safeParse({ id: 'b1', prop: 'props.text', dataSourceId: 'ds1', path: 'name' })
        .success,
    ).toBe(true);
    expect(
      intentSchema.safeParse({
        id: 'i1',
        name: 'inventory.moveItem',
        description: 'Move an item between slots',
        payload: [{ name: 'from', type: 'number' }],
        connection: 'unconnected',
      }).success,
    ).toBe(true);
  });
});

describe('document schema', () => {
  it('survives a JSON round trip', () => {
    const doc = createEmptyDocument({ name: 'D', target: { platform: 'unity', ui: 'ugui' } });
    const withScreen = { ...doc, screens: [createScreen({ name: 'S' })] };
    const roundTripped = formaDocumentSchema.parse(JSON.parse(JSON.stringify(withScreen)));
    expect(roundTripped).toEqual(withScreen);
  });

  it('only accepts schemaVersion 1 and known platforms', () => {
    const doc = createEmptyDocument({ name: 'D', target: { platform: 'web' } });
    expect(formaDocumentSchema.safeParse({ ...doc, schemaVersion: 2 }).success).toBe(false);
    expect(formaDocumentSchema.safeParse({ ...doc, target: { platform: 'godot' } }).success).toBe(
      false,
    );
  });
});
