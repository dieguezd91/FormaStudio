import { describe, expect, it } from 'vitest';
import { parseBindingPath } from '@forma/runtime';
import { validateDocument, type FormaDocument } from '@forma/design-core';
import { BUNDLE_FORMAT, uguiBundleSchema, type UguiBundle } from './bundle';
import { createUguiExporter } from './exporter';
import {
  META,
  SCREEN_ID,
  inventoryEntryIds,
  makeBaseDoc,
  withEntry,
  withNode,
} from './test-helpers';

const exporter = createUguiExporter();

function exportBundle(doc: FormaDocument): UguiBundle {
  const result = exporter.export(doc, SCREEN_ID, META);
  if (!result.ok) throw new Error(result.error.reasons.join('; '));
  return result.value.bundle;
}

const nodeOf = (bundle: UguiBundle, id: string) => {
  const node = bundle.nodes.find((n) => n.id === id);
  if (!node) throw new Error(`no node ${id}`);
  return node;
};

describe('bundle schema', () => {
  it('validates an exported bundle and rejects tampered ones', () => {
    const bundle = exportBundle(withEntry(makeBaseDoc(), 'inventory.grid'));
    expect(uguiBundleSchema.safeParse(bundle).success).toBe(true);
    expect(uguiBundleSchema.safeParse({ ...bundle, format: 'forma.ugui-bundle/v2' }).success).toBe(
      false,
    );
    expect(
      uguiBundleSchema.safeParse({ ...bundle, canvas: { ...bundle.canvas, scaleMode: 'Constant' } })
        .success,
    ).toBe(false);
    expect(uguiBundleSchema.safeParse({ ...bundle, nodes: [{ id: 'x' }] }).success).toBe(false);
  });

  it('carries meta from the caller and the canvas from the screen size', () => {
    const bundle = exportBundle(makeBaseDoc());
    expect(bundle.format).toBe(BUNDLE_FORMAT);
    expect(bundle.meta).toMatchObject({
      bundleVersion: 1,
      projectId: META.projectId,
      projectName: META.projectName,
      documentRevision: META.documentRevision,
      screenId: SCREEN_ID,
      screenName: 'Inventario',
      exportedAt: META.exportedAt,
    });
    expect(bundle.canvas).toEqual({
      referenceResolution: { x: 1920, y: 1080 },
      scaleMode: 'ScaleWithScreenSize',
      matchWidthOrHeight: 0.5,
    });
  });

  it('is deterministic for the same input', () => {
    const doc = withEntry(makeBaseDoc(), 'inventory.grid');
    expect(JSON.stringify(exportBundle(doc))).toBe(JSON.stringify(exportBundle(doc)));
  });
});

describe('node conversion', () => {
  it('converts nested nodes relative to their parent and orders parents first', () => {
    let doc = makeBaseDoc();
    doc = withNode(doc, { id: 'a', layout: { x: 100, y: 50, width: 400, height: 300 } });
    doc = withNode(doc, {
      id: 'b',
      parentId: 'a',
      layout: { x: 10, y: 20, width: 50, height: 60 },
    });
    const bundle = exportBundle(doc);
    expect(bundle.nodes.map((n) => n.id)).toEqual(['root', 'a', 'b']);
    expect(nodeOf(bundle, 'root')).toMatchObject({ parentId: null, siblingIndex: 0 });
    expect(nodeOf(bundle, 'a')).toMatchObject({ parentId: 'root', siblingIndex: 0 });
    expect(nodeOf(bundle, 'b').rect).toMatchObject({
      anchoredPosition: { x: 10, y: -20 },
      sizeDelta: { x: 50, y: 60 },
    });
    expect(nodeOf(bundle, 'root').rect.anchorMin).toEqual({ x: 0, y: 0 });
  });

  it('keeps token names next to resolved values', () => {
    let doc = makeBaseDoc();
    doc = { ...doc, tokens: { ...doc.tokens, colors: { surface: '#1F2430' }, radii: { md: 8 } } };
    doc = withNode(doc, {
      id: 'p',
      style: { fill: { token: 'colors.surface' }, radius: { token: 'radii.md' }, stroke: '#fff' },
    });
    const bundle = exportBundle(doc);
    const panel = nodeOf(bundle, 'p');
    expect(panel.image?.color).toEqual({ value: '#1f2430', token: 'colors.surface' });
    expect(panel.cornerRadius).toBe(8);
    expect(bundle.theme.colors).toEqual({ surface: '#1f2430' });
    expect(bundle.theme.radii).toEqual({ md: 8 });
  });

  it('expands short hex colors and keeps literals tokenless', () => {
    let doc = makeBaseDoc();
    doc = withNode(doc, {
      id: 'p',
      style: { fill: '#abc', stroke: '#112233', strokeWidth: 2, opacity: 0.5 },
    });
    const panel = nodeOf(exportBundle(doc), 'p');
    expect(panel.image?.color).toEqual({ value: '#aabbcc' });
    expect(panel.outline).toEqual({ color: { value: '#112233' }, width: 2 });
    expect(panel.canvasGroupAlpha).toBe(0.5);
  });

  it('maps text, buttons and the managed property list', () => {
    let doc = makeBaseDoc();
    doc = withNode(doc, {
      id: 't',
      type: 'text',
      style: { textColor: '#fff', fontSize: 20, fontWeight: 700 },
    });
    doc = withNode(doc, { id: 'btn', type: 'button' });
    const bundle = exportBundle(doc);
    const text = nodeOf(bundle, 't');
    expect(text.kind).toBe('text');
    expect(text.text).toMatchObject({
      fontSize: 20,
      fontWeight: 700,
      alignment: 'Left',
      color: { value: '#ffffff' },
    });
    expect(nodeOf(bundle, 'btn')).toMatchObject({
      kind: 'button',
      button: { transition: 'ColorTint' },
    });
    expect(bundle.managed['t']).toEqual(expect.arrayContaining(['rect', 'text.value']));
    expect(bundle.managed['btn']).toEqual(expect.arrayContaining(['rect', 'button']));
  });
});

describe.each(inventoryEntryIds())('library entry %s', (entryId) => {
  const doc = withEntry(makeBaseDoc(), entryId);
  const result = exporter.export(doc, SCREEN_ID, META);

  it('exports a valid bundle', () => {
    expect(validateDocument(doc)).toEqual([]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(uguiBundleSchema.safeParse(result.value.bundle).success).toBe(true);
    expect(result.value.files.map((f) => f.path)).toEqual([
      'Inventario.forma.json',
      'README-forma.txt',
    ]);
  });

  it('lists every parent before its children, once each', () => {
    if (!result.ok) throw new Error('export failed');
    const seen = new Set<string>();
    for (const node of result.value.bundle.nodes) {
      if (node.parentId !== null) expect(seen.has(node.parentId)).toBe(true);
      expect(seen.has(node.id)).toBe(false);
      seen.add(node.id);
    }
    const screen = doc.screens[0]!;
    expect(seen.size).toBe(Object.keys(screen.nodes).length);
  });

  it('has a component spec for every behavior of every node', () => {
    if (!result.ok) throw new Error('export failed');
    const screen = doc.screens[0]!;
    const byKind = {
      tabs: 'FormaTabs',
      select: 'FormaSelectable',
      dragDrop: 'FormaDragDrop',
      stack: 'FormaStack',
      split: 'FormaSplit',
      contextMenu: 'FormaContextMenu',
      tooltip: 'FormaTooltip',
    } as const;
    for (const exported of result.value.bundle.nodes) {
      const source = screen.nodes[exported.id]!;
      const types = exported.components.map((c) => c.type);
      for (const behavior of source.behaviors) expect(types).toContain(byKind[behavior.kind]);
      if (source.type === 'slot' || source.type === 'equipmentSlot') {
        expect(types).toContain('FormaSlot');
      }
      if (source.type === 'itemView') expect(types).toContain('FormaItemView');
      if (source.type === 'equipmentSlot') expect(types).toContain('FormaEquipmentSlot');
      for (const type of types) {
        expect(result.value.bundle.managed[exported.id]).toContain(`components.${type}`);
      }
    }
  });

  it('normalizes every binding without leaving path strings for C#', () => {
    if (!result.ok) throw new Error('export failed');
    const screen = doc.screens[0]!;
    for (const exported of result.value.bundle.nodes) {
      const source = screen.nodes[exported.id]!;
      expect(exported.bindings).toHaveLength(source.bindings.length);
      source.bindings.forEach((binding, i) => {
        const parsed = parseBindingPath(binding.path)!;
        const normalized = exported.bindings[i]!;
        expect(normalized).toMatchObject({
          prop: binding.prop,
          dataSourceId: binding.dataSourceId,
        });
        expect(normalized.filters).toEqual(
          parsed.steps.flatMap((s) =>
            s.kind === 'filter' ? [{ field: s.field, value: s.value }] : [],
          ),
        );
        expect(normalized.root).not.toContain('[');
        expect(normalized.field ?? '').not.toContain('[');
      });
    }
    for (const exported of result.value.bundle.nodes) {
      for (const component of exported.components) {
        if (component.type === 'FormaSlot') {
          expect(component.binding.dataSourceId).toBeTruthy();
          expect(typeof component.binding.index).toBe('number');
        }
        if (component.type === 'FormaTooltip') {
          expect(component.binding.dataSourceId).toBeTruthy();
        }
      }
    }
  });

  it('references intents by name and ships the intents and data sources it uses', () => {
    if (!result.ok) throw new Error('export failed');
    const { bundle } = result.value;
    const intentNames = new Set(bundle.intents.map((i) => i.name));
    for (const node of bundle.nodes) {
      for (const component of node.components) {
        if (component.type === 'FormaDragDrop' || component.type === 'FormaSplit') {
          expect(intentNames.has(component.intent)).toBe(true);
          expect(component.intent).toMatch(/^inventory\./);
        }
        if (component.type === 'FormaContextMenu') {
          for (const action of component.actions) expect(intentNames.has(action.intent)).toBe(true);
        }
      }
    }
    expect(bundle.dataSources.map((d) => d.id)).toContain('inventory.items');
  });
});

describe('component details', () => {
  const bundle = exportBundle(
    withEntry(makeBaseDoc(), 'inventory.tabs', { categories: ['Armas', 'Armaduras'] }),
  );

  it('wires tabs to their buttons by label and to content nodes', () => {
    const bar = bundle.nodes.find((n) => n.kind === 'tabBar')!;
    const tabs = bar.components.find((c) => c.type === 'FormaTabs');
    if (tabs?.type !== 'FormaTabs') throw new Error('no tabs');
    expect(tabs.initialTabId).toBe('tab-1');
    expect(tabs.tabs).toHaveLength(2);
    for (const tab of tabs.tabs) {
      expect(nodeOf(bundle, tab.buttonNodeId!)).toMatchObject({ kind: 'button', parentId: bar.id });
      expect(nodeOf(bundle, tab.contentNodeId)).toBeDefined();
    }
  });

  it('derives slot and item view bindings from the filtered view and index', () => {
    const slot = bundle.nodes.find((n) => n.kind === 'slot')!;
    const component = slot.components.find((c) => c.type === 'FormaSlot');
    expect(component).toMatchObject({
      type: 'FormaSlot',
      binding: {
        dataSourceId: 'inventory.items',
        filters: [{ field: 'category', value: 'Armas' }],
        index: 0,
      },
    });
    const view = bundle.nodes.find((n) => n.kind === 'itemView')!;
    const itemView = view.components.find((c) => c.type === 'FormaItemView');
    expect(itemView).toMatchObject({
      type: 'FormaItemView',
      icon: { field: 'icon', index: 0 },
      quantity: { field: 'quantity', index: 0 },
      name: { field: 'name', index: 0 },
    });
  });

  it('exports equipment slot types', () => {
    const equipment = exportBundle(withEntry(makeBaseDoc(), 'inventory.equipment'));
    const slot = equipment.nodes.find((n) => n.kind === 'equipmentSlot')!;
    expect(slot.components.find((c) => c.type === 'FormaEquipmentSlot')).toMatchObject({
      slotType: expect.any(String),
    });
    expect(slot.components.some((c) => c.type === 'FormaDragDrop')).toBe(true);
  });

  it('maps a grid to a fixed-column grid layout group', () => {
    const grid = exportBundle(
      withEntry(makeBaseDoc(), 'inventory.grid', { columns: 4, rows: 2 }),
    ).nodes.find((n) => n.kind === 'grid')!;
    expect(grid.layoutGroup).toMatchObject({
      type: 'Grid',
      constraint: 'FixedColumnCount',
      constraintCount: 4,
      cellSize: { x: 64, y: 64 },
    });
  });
});
