import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { listEntries } from '@forma/library';
import { buildLibraryCatalog } from './catalog';
import { editOutputSchema, proposalsOutputSchema } from './schemas';

const edit = (operations: unknown[]) => ({ explanation: 'ok', warnings: [], operations });

describe('model output schemas', () => {
  it('keeps the edit schema small enough for structured output', () => {
    const json = JSON.stringify(z.toJSONSchema(editOutputSchema, { io: 'input' }));
    expect(json.length).toBeLessThan(40_000);
  });

  it('accepts design-core operations and library insertions', () => {
    const parsed = editOutputSchema.safeParse(
      edit([
        { type: 'updateNode', screenId: 's', nodeId: 'n', patch: { style: { fill: '#fff' } } },
        { insertEntry: { entryId: 'button', params: { label: 'Cerrar' }, parentId: 'n' } },
      ]),
    );
    expect(parsed.success).toBe(true);
  });

  it('does not let the model emit raw nodes or screens', () => {
    const addNode = { type: 'addNode', screenId: 's', parentId: 'n', node: {} };
    expect(editOutputSchema.safeParse(edit([addNode])).success).toBe(false);
    expect(editOutputSchema.safeParse(edit([{ type: 'addScreen', screen: {} }])).success).toBe(false);
  });

  it('rejects operations with unknown fields', () => {
    const op = { type: 'removeNode', screenId: 's', nodeId: 'n', extra: 1 };
    expect(editOutputSchema.safeParse(edit([op])).success).toBe(false);
  });

  it('requires at least one placement per proposal', () => {
    const plan = {
      title: 'A',
      summary: '',
      rationale: { need: '', patterns: [], tradeoffs: [], fromReferences: [], requirementIds: [] },
      layout: [],
    };
    expect(proposalsOutputSchema.safeParse({ proposals: [plan] }).success).toBe(false);
  });
});

describe('buildLibraryCatalog', () => {
  it('describes every library entry with its params JSON Schema', () => {
    const catalog = buildLibraryCatalog();
    expect(catalog.map((c) => c.id)).toEqual(listEntries().map((e) => e.id));
    const grid = catalog.find((c) => c.id === 'inventory.grid')!;
    expect(JSON.stringify(grid.params)).toContain('columns');
    expect(JSON.stringify(grid.params)).not.toContain('$schema');
  });
});
