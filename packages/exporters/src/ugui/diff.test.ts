import { describe, expect, it } from 'vitest';
import type { FormaDocument } from '@forma/design-core';
import type { UguiBundle } from './bundle';
import { diffBundles } from './diff';
import { createUguiExporter } from './exporter';
import { META, SCREEN_ID, makeBaseDoc, withNode } from './test-helpers';

const exporter = createUguiExporter();

function bundleOf(doc: FormaDocument): UguiBundle {
  const result = exporter.export(doc, SCREEN_ID, META);
  if (!result.ok) throw new Error(result.error.reasons.join('; '));
  return result.value.bundle;
}

const base = withNode(makeBaseDoc(), {
  id: 'a',
  name: 'Panel A',
  style: { fill: '#00ff00' },
  layout: { x: 10, y: 10, width: 100, height: 100 },
});

function patchNode(
  doc: FormaDocument,
  id: string,
  patch: (node: FormaDocument['screens'][number]['nodes'][string]) => unknown,
): FormaDocument {
  return {
    ...doc,
    screens: doc.screens.map((screen) => ({
      ...screen,
      nodes: { ...screen.nodes, [id]: patch(screen.nodes[id]!) as never },
    })),
  };
}

describe('diffBundles', () => {
  const previous = bundleOf(base);

  it('reports nothing for identical bundles', () => {
    expect(diffBundles(previous, bundleOf(base))).toEqual({
      added: [],
      removed: [],
      changed: [],
      renamed: [],
    });
  });

  it('detects added and removed nodes by id', () => {
    const next = bundleOf(withNode(base, { id: 'b' }));
    expect(diffBundles(previous, next).added).toEqual(['b']);
    expect(diffBundles(next, previous).removed).toEqual(['b']);
  });

  it('lists the managed paths that changed', () => {
    const moved = patchNode(base, 'a', (n) => ({
      ...n,
      layout: { ...n.layout, x: 40, width: 120 },
    }));
    const next = bundleOf(patchNode(moved, 'a', (n) => ({ ...n, style: { fill: '#ff0000' } })));
    const diff = diffBundles(previous, next);
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0]).toMatchObject({ nodeId: 'a', name: 'Panel A' });
    expect(diff.changed[0]?.paths).toEqual(expect.arrayContaining(['rect', 'image.color']));
  });

  it('reports renames separately from property changes', () => {
    const next = bundleOf(patchNode(base, 'a', (n) => ({ ...n, name: 'Panel B' })));
    const diff = diffBundles(previous, next);
    expect(diff.renamed).toEqual([{ nodeId: 'a', from: 'Panel A', to: 'Panel B' }]);
    expect(diff.changed).toEqual([]);
  });

  it('ignores changes to properties Forma does not manage', () => {
    const unmanaged = (bundle: UguiBundle): UguiBundle => {
      const copy = structuredClone(bundle);
      copy.managed['a'] = (copy.managed['a'] ?? []).filter((p) => p !== 'image.raycastTarget');
      return copy;
    };
    const before = unmanaged(previous);
    const after = unmanaged(previous);
    after.nodes.find((n) => n.id === 'a')!.image!.raycastTarget = true;
    after.meta.exportedAt = '2030-01-01T00:00:00.000Z';
    after.meta.documentRevision += 1;
    expect(diffBundles(before, after)).toEqual({
      added: [],
      removed: [],
      changed: [],
      renamed: [],
    });
  });

  it('compares component specs by type', () => {
    const withBehavior = patchNode(base, 'a', (n) => ({
      ...n,
      behaviors: [{ kind: 'select', mode: 'single' }],
    }));
    const next = bundleOf(withBehavior);
    expect(diffBundles(previous, next).changed[0]?.paths).toContain('components.FormaSelectable');
  });
});
