import { describe, expect, it } from 'vitest';
import type { FormaDocument } from '@forma/design-core';
import { createUguiExporter } from './exporter';
import { compatibilityReportSchema, type CompatibilityItem } from '../report';
import { META, ROOT_ID, SCREEN_ID, makeBaseDoc, withEntry, withNode } from './test-helpers';

const exporter = createUguiExporter();
const analyze = (doc: FormaDocument) => exporter.analyze(doc, SCREEN_ID);

const find = (items: CompatibilityItem[], match: Partial<CompatibilityItem['subject']>) =>
  items.filter((item) =>
    Object.entries(match).every(
      ([key, value]) => (item.subject as Record<string, unknown>)[key] === value,
    ),
  );

function withMenuTrigger(trigger: 'secondaryClick' | 'longPress' | 'button'): FormaDocument {
  let doc = withNode(makeBaseDoc(), { id: 'menu', type: 'contextMenu' });
  doc = {
    ...doc,
    intents: [
      {
        id: 'ui.menuAction',
        name: 'ui.menuAction',
        description: 'Acción de menú',
        payload: [{ name: 'actionId', type: 'id' }],
        connection: 'unconnected',
      },
    ],
    screens: doc.screens.map((screen) => ({
      ...screen,
      nodes: {
        ...screen.nodes,
        menu: {
          ...screen.nodes['menu']!,
          behaviors: [
            {
              kind: 'contextMenu',
              trigger,
              actions: [{ id: 'a', label: 'A', intentId: 'ui.menuAction' }],
            },
          ],
        },
      },
    })),
  };
  return doc;
}

describe('compatibility report', () => {
  const doc = withEntry(makeBaseDoc(), 'inventory.grid');
  const report = analyze(doc);

  it('validates against its schema and matches the export report', () => {
    expect(compatibilityReportSchema.safeParse(report).success).toBe(true);
    const result = exporter.export(doc, SCREEN_ID, META);
    if (!result.ok) throw new Error('export failed');
    expect(result.value.report).toEqual(report);
  });

  it('reports corner radius as approximate with a Spanish explanation', () => {
    const [item] = find(report.items, { property: 'cornerRadius' });
    expect(item?.status).toBe('approximate');
    expect(item?.impact).toContain('bordes redondeados');
    expect(item?.impact).toContain('9-slice');
    expect(item?.action.length).toBeGreaterThan(0);
  });

  it('reports strokes as approximate (Outline) and opacity as supported (CanvasGroup)', () => {
    expect(find(report.items, { property: 'stroke' })[0]?.status).toBe('approximate');
    expect(find(report.items, { property: 'stroke' })[0]?.impact).toContain('Outline');
    const withOpacity = analyze(withNode(makeBaseDoc(), { id: 'o', style: { opacity: 0.4 } }));
    const [opacity] = find(withOpacity.items, { property: 'opacity', nodeId: 'o' });
    expect(opacity?.status).toBe('supported');
    expect(opacity?.impact).toContain('CanvasGroup');
  });

  it('uses the library compatibility hint for nodes that came from a catalog entry', () => {
    const rootNodeId = doc.screens[0]!.nodes[ROOT_ID]!.children[0]!;
    const [item] = find(report.items, { nodeId: rootNodeId }).filter(
      (i) => !i.subject.property && !i.subject.behavior,
    );
    expect(item?.status).toBe('supported');
    expect(item?.impact.length).toBeGreaterThan(0);
  });

  it('flags simulated data sources as needing a connection', () => {
    const [item] = find(report.items, { dataSourceId: 'inventory.items' });
    expect(item?.status).toBe('adapted');
    expect(item?.impact).toContain('datos de ejemplo');
    expect(item?.action).toContain('IFormaDataSource');
    expect(report.summary.youMustConnect.join(' ')).toContain('IFormaDataSource');
  });

  it('lists unconnected intents as connection points', () => {
    const [item] = find(report.items, { intentName: 'inventory.moveItem' });
    expect(item?.status).toBe('adapted');
    expect(item?.action).toContain('inventory.moveItem');
    expect(report.summary.youMustConnect.join(' ')).toContain('inventory.moveItem');
    expect(report.summary.youMustConnect.join(' ')).toContain('inventory.useItem');
  });

  it('counts items per status and lists what the developer receives', () => {
    const total = Object.values(report.summary.counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(report.items.length);
    expect(report.summary.counts.approximate).toBeGreaterThan(0);
    expect(report.summary.youWillReceive.length).toBeGreaterThan(0);
    expect(report.summary.youWillReceive.join(' ')).toContain('Prefab');
  });

  it('adapts longPress context menus but supports the mouse triggers', () => {
    const adapted = find(analyze(withMenuTrigger('longPress')).items, { behavior: 'contextMenu' });
    expect(adapted[0]?.status).toBe('adapted');
    expect(adapted[0]?.impact).toContain('clic derecho');
    expect(
      find(analyze(withMenuTrigger('secondaryClick')).items, { behavior: 'contextMenu' })[0]
        ?.status,
    ).toBe('supported');
  });

  it('adapts tooltips (hover only)', () => {
    const [item] = find(report.items, { behavior: 'tooltip' });
    expect(item?.status).toBe('adapted');
  });

  it('reports a missing screen instead of throwing', () => {
    const missing = exporter.analyze(doc, 'nope');
    expect(missing.items[0]?.status).toBe('unavailable');
  });
});
