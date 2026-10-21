import { describe, expect, it } from 'vitest';
import { createSequentialIdGenerator } from './ids';
import { createEmptyDocument, createNode, createScreen } from './factory';
import { formaDocumentSchema, nodeSchema, screenSchema } from './schema';
import { SCHEMA_VERSION } from './index';

describe('createEmptyDocument', () => {
  it('creates a schema-valid document at the current version', () => {
    const doc = createEmptyDocument({
      name: 'Game UI',
      target: { platform: 'unity', ui: 'ugui' },
      id: 'doc_1',
      now: '2026-10-21T00:00:00.000Z',
    });
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION);
    expect(doc.screens).toEqual([]);
    expect(doc.tokens).toEqual({ colors: {}, fontSizes: {}, spacing: {}, radii: {} });
    expect(doc.meta).toEqual({
      createdAt: '2026-10-21T00:00:00.000Z',
      updatedAt: '2026-10-21T00:00:00.000Z',
    });
    expect(formaDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it('generates ids from the injected generator', () => {
    const doc = createEmptyDocument({
      name: 'X',
      target: { platform: 'web' },
      idGenerator: createSequentialIdGenerator(),
    });
    expect(doc.id).toBe('doc_1');
  });
});

describe('createScreen', () => {
  it('creates a screen with a root frame node', () => {
    const screen = createScreen({
      name: 'Inventory',
      size: { width: 1280, height: 720 },
      idGenerator: createSequentialIdGenerator(),
    });
    expect(screen.id).toBe('screen_1');
    expect(screen.rootId).toBe('node_2');
    const root = screen.nodes[screen.rootId];
    expect(root?.type).toBe('frame');
    expect(root?.parentId).toBeNull();
    expect(root?.layout).toMatchObject({ width: 1280, height: 720, anchor: 'stretch' });
    expect(screenSchema.safeParse(screen).success).toBe(true);
  });

  it('accepts explicit screen and root ids', () => {
    const screen = createScreen({ name: 'A', id: 's1', rootId: 'root' });
    expect(screen.id).toBe('s1');
    expect(screen.rootId).toBe('root');
    expect(screen.nodes['root']?.id).toBe('root');
  });

  it('defaults the size', () => {
    const screen = createScreen({ name: 'A' });
    expect(screen.size).toEqual({ width: 1920, height: 1080 });
  });
});

describe('createNode', () => {
  it('applies type-specific default props', () => {
    const text = createNode('text', { id: 'n1', name: 'Title' });
    expect(text.props).toEqual({ text: '', align: 'left' });
    const grid = createNode('inventoryGrid', { id: 'n2', name: 'Grid' });
    expect(grid.props).toEqual({ columns: 5, rows: 4, slotSize: { width: 64, height: 64 } });
    expect(nodeSchema.safeParse(grid).success).toBe(true);
  });

  it('accepts overrides', () => {
    const btn = createNode('button', {
      id: 'n3',
      name: 'Search',
      props: { label: 'Search' },
      parentId: 'root',
      origin: { source: 'ai' },
    });
    expect(btn.props.label).toBe('Search');
    expect(btn.parentId).toBe('root');
    expect(btn.origin).toEqual({ source: 'ai' });
  });
});
