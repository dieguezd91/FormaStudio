import { describe, expect, it } from 'vitest';
import type { CompositionPlan } from '@forma/ai';
import { validateDocument } from '@forma/design-core';
import { sampleDocument } from '../testing';
import { compilePlan } from './compile';

type Layout = CompositionPlan['layout'];

const region = (x: number, y = 100, width = 400, height = 300) => ({ x, y, width, height });

const plan = (layout: Layout, tokens?: CompositionPlan['tokens']): CompositionPlan => ({
  title: 'Plan',
  summary: '',
  rationale: { need: '', patterns: [], tradeoffs: [], fromReferences: [], requirementIds: [] },
  layout,
  ...(tokens === undefined ? {} : { tokens }),
});

const compile = (p: CompositionPlan, screenId?: string) =>
  compilePlan(p, sampleDocument(), screenId, 'proposals.0');

const compiled = (p: CompositionPlan) => {
  const outcome = compile(p);
  if (!outcome.ok) throw new Error(outcome.issues.join('\n'));
  return outcome.value;
};

describe('structural signature', () => {
  const gridLeftEquipmentRight = plan([
    { entryId: 'inventory.grid', params: {}, region: region(100) },
    { entryId: 'inventory.equipment', params: {}, region: region(1300) },
  ]);

  it('ignores params, labels and exact sizes', () => {
    const tweaked = plan([
      { entryId: 'inventory.grid', params: { columns: 8 }, region: region(60, 120, 500, 340) },
      { entryId: 'inventory.equipment', params: {}, region: region(1320) },
    ]);
    expect(compiled(tweaked).signature).toBe(compiled(gridLeftEquipmentRight).signature);
  });

  it('tells apart the same entries arranged differently', () => {
    const swapped = plan([
      { entryId: 'inventory.grid', params: {}, region: region(1300) },
      { entryId: 'inventory.equipment', params: {}, region: region(100) },
    ]);
    expect(compiled(swapped).signature).not.toBe(compiled(gridLeftEquipmentRight).signature);
  });

  it('tells apart different entries and different nesting', () => {
    const list = plan([{ entryId: 'inventory.list', params: {}, region: region(100) }]);
    expect(compiled(list).signature).not.toBe(compiled(gridLeftEquipmentRight).signature);

    const flat = plan([
      { entryId: 'panel', params: {}, region: region(100) },
      { entryId: 'button', params: {}, region: region(1300) },
    ]);
    const nested = plan([
      { entryId: 'panel', params: {}, region: region(100) },
      { entryId: 'button', params: {}, region: region(10, 10, 100, 40), parentRef: 0 },
    ]);
    expect(compiled(nested).signature).not.toBe(compiled(flat).signature);
  });
});

describe('compilePlan', () => {
  it('produces a valid document with the entries placed at their regions', () => {
    const { document, entryIds } = compiled(
      plan([{ entryId: 'inventory.grid', params: {}, region: region(40, 60, 420, 360) }]),
    );
    expect(validateDocument(document)).toEqual([]);
    expect(entryIds).toEqual(['inventory.grid']);
    const screen = document.screens[0]!;
    const root = screen.nodes[screen.rootId]!.children[0]!;
    expect(screen.nodes[root]!.layout).toMatchObject({ x: 40, y: 60, width: 420, height: 360 });
  });

  it('reports a parentRef that does not point to an earlier placement', () => {
    const outcome = compile(
      plan([{ entryId: 'button', params: {}, region: region(0), parentRef: 0 }]),
    );
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.issues.join()).toContain('layout.0.parentRef');
  });

  it('reports unknown entries and invalid params with their position', () => {
    const outcome = compile(
      plan([
        { entryId: 'button', params: {}, region: region(0) },
        { entryId: 'nope', params: {}, region: region(0) },
        { entryId: 'inventory.grid', params: { columns: 99 }, region: region(0) },
      ]),
    );
    expect(outcome.ok).toBe(false);
    const issues = !outcome.ok ? outcome.issues : [];
    expect(issues.some((i) => i.startsWith('proposals.0.layout.1') && i.includes('nope'))).toBe(true);
    expect(issues.some((i) => i.startsWith('proposals.0.layout.2'))).toBe(true);
  });

  it('rejects token overrides that are not hex colors or non-negative numbers', () => {
    const outcome = compile(
      plan([{ entryId: 'button', params: {}, region: region(0) }], {
        colors: { accent: 'gold' },
        spacing: { md: -4 },
      }),
    );
    expect(outcome.ok).toBe(false);
    const text = !outcome.ok ? outcome.issues.join('\n') : '';
    expect(text).toContain('tokens.colors.accent');
    expect(text).toContain('tokens.spacing.md');
  });

  it('warns, without failing, when a region leaves its container', () => {
    const { warnings } = compiled(
      plan([{ entryId: 'button', params: {}, region: region(1800, 100, 400, 50) }]),
    );
    expect(warnings.map((w) => w.code)).toEqual(['regionOutOfBounds']);
  });
});
