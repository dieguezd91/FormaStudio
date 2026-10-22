import { describe, expect, it } from 'vitest';
import type { FormaDocument } from '@forma/design-core';
import { uguiBundleSchema } from './bundle';
import { createUguiExporter } from './exporter';
import { META, ROOT_ID, SCREEN_ID, makeBaseDoc, withEntry, withNode } from './test-helpers';

const exporter = createUguiExporter({ exporter: 'forma-test/0' });

describe('createUguiExporter', () => {
  it('targets unity-ugui and stamps the exporter name', () => {
    expect(exporter.target).toBe('unity-ugui');
    const result = exporter.export(makeBaseDoc(), SCREEN_ID, META);
    if (!result.ok) throw new Error('export failed');
    expect(result.value.bundle.meta.exporter).toBe('forma-test/0');
  });

  it('produces the bundle JSON and a Spanish README', () => {
    const doc = withEntry(makeBaseDoc(), 'inventory.grid');
    const result = exporter.export(doc, SCREEN_ID, META);
    if (!result.ok) throw new Error('export failed');
    const [json, readme] = result.value.files;
    expect(json?.path).toBe('Inventario.forma.json');
    expect(uguiBundleSchema.parse(JSON.parse(json!.contents))).toEqual(result.value.bundle);
    expect(json?.contents.endsWith('\n')).toBe(true);
    expect(readme?.path).toBe('README-forma.txt');
    expect(readme?.contents).toContain('Inventario.forma.json');
    expect(readme?.contents).toContain('IFormaDataSource');
  });

  it('builds a file-system-safe name from the screen name', () => {
    const doc = makeBaseDoc();
    const renamed: FormaDocument = {
      ...doc,
      screens: doc.screens.map((s) => ({ ...s, name: 'Menú / Principal: ¡Hola! ' })),
    };
    const result = exporter.export(renamed, SCREEN_ID, META);
    if (!result.ok) throw new Error('export failed');
    expect(result.value.files[0]?.path).toBe('Menu_Principal_Hola.forma.json');
    const blank = exporter.export(
      { ...doc, screens: doc.screens.map((s) => ({ ...s, name: '***' })) },
      SCREEN_ID,
      META,
    );
    if (!blank.ok) throw new Error('export failed');
    expect(blank.value.files[0]?.path).toBe('Screen.forma.json');
  });

  it('fails with Spanish reasons when the screen does not exist', () => {
    const result = exporter.export(makeBaseDoc(), 'missing', META);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('screenNotFound');
    expect(result.error.reasons[0]).toContain('missing');
  });

  it('fails with Spanish reasons when the document is structurally invalid', () => {
    const doc = withNode(makeBaseDoc(), { id: 'a' });
    const broken: FormaDocument = {
      ...doc,
      screens: doc.screens.map((screen) => ({
        ...screen,
        nodes: { ...screen.nodes, a: { ...screen.nodes['a']!, parentId: 'ghost' } },
      })),
    };
    const result = exporter.export(broken, SCREEN_ID, META);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalidDocument');
    expect(result.error.reasons.length).toBeGreaterThan(0);
    expect(result.error.reasons.join(' ')).toMatch(/no existe|inválid|Nodo|nodo/);
    expect(ROOT_ID).toBe('root');
  });

  it('fails when two intents share a name, since components reference intents by name', () => {
    const doc = withEntry(makeBaseDoc(), 'inventory.grid');
    const duplicated: FormaDocument = {
      ...doc,
      intents: [...doc.intents, { ...doc.intents[0]!, id: 'other-id' }],
    };
    const result = exporter.export(duplicated, SCREEN_ID, META);
    expect(result.ok).toBe(false);
  });
});
