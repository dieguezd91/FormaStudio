import { describe, expect, it } from 'vitest';
import type { Requirement, SourceImpact } from '@/api/types';
import { emptyDoc, inventoryDoc } from '../testing';
import {
  compareProposals,
  countByStatus,
  groupRequirements,
  guideSteps,
  isPreviewStale,
  summarizeImpact,
} from './logic';

const requirement = (id: string, kind: Requirement['kind'], status: Requirement['status']): Requirement => ({
  id,
  text: `Texto ${id}`,
  kind,
  status,
  sourceRefs: [],
});

describe('groupRequirements', () => {
  it('groups by kind in a fixed order and skips empty kinds', () => {
    const groups = groupRequirements([
      requirement('a', 'interaction', 'confirmed'),
      requirement('b', 'goal', 'confirmed'),
      requirement('c', 'interaction', 'assumed'),
    ]);
    expect(groups.map((g) => g.kind)).toEqual(['goal', 'interaction']);
    expect(groups[1]?.requirements.map((r) => r.id)).toEqual(['c', 'a']);
  });

  it('surfaces contradictions and gaps before assumptions and confirmed items, keeping ties stable', () => {
    const [group] = groupRequirements([
      requirement('a', 'data', 'confirmed'),
      requirement('b', 'data', 'gap'),
      requirement('c', 'data', 'assumed'),
      requirement('d', 'data', 'contradiction'),
      requirement('e', 'data', 'confirmed'),
    ]);
    expect(group?.requirements.map((r) => r.id)).toEqual(['d', 'b', 'c', 'a', 'e']);
  });

  it('returns nothing for no requirements', () => {
    expect(groupRequirements([])).toEqual([]);
  });
});

describe('countByStatus', () => {
  it('counts every status, including the absent ones', () => {
    expect(countByStatus([requirement('a', 'goal', 'gap'), requirement('b', 'goal', 'gap')])).toEqual({
      confirmed: 0,
      assumed: 0,
      contradiction: 0,
      gap: 2,
    });
  });
});

describe('compareProposals', () => {
  const tabs = { id: 'p1', title: 'Con pestañas', document: inventoryDoc('inventory.tabs') };
  const grid = { id: 'p2', title: 'Cuadrícula', document: inventoryDoc('inventory.grid') };
  const empty = { id: 'p3', title: 'Vacía', document: emptyDoc() };

  it('lists the library entries each proposal uses, aligned with its columns', () => {
    const result = compareProposals([tabs, grid]);
    expect(result.columns.map((c) => c.id)).toEqual(['p1', 'p2']);
    const entryRow = (key: string) => result.rows.find((r) => r.kind === 'entry' && r.key === key);
    expect(entryRow('inventory.tabs')?.present).toEqual([true, false]);
    expect(entryRow('inventory.grid')?.present).toEqual([false, true]);
    expect(entryRow('inventory.tabs')?.shared).toBe(false);
  });

  it('lists behaviors and marks the ones every proposal has as shared', () => {
    const result = compareProposals([tabs, grid]);
    const behavior = (key: string) => result.rows.find((r) => r.kind === 'behavior' && r.key === key);
    expect(behavior('tabs')?.present).toEqual([true, false]);
    expect(behavior('dragDrop')?.present).toEqual([true, true]);
    expect(behavior('dragDrop')?.shared).toBe(true);
  });

  it('counts nodes per type and node totals per column', () => {
    const result = compareProposals([tabs, empty]);
    expect(result.columns[1]?.nodeCount).toBe(1);
    expect(result.columns[0]?.nodeCount).toBeGreaterThan(1);
    const slots = result.rows.find((r) => r.kind === 'nodeType' && r.key === 'slot');
    expect(slots?.counts[0]).toBeGreaterThan(0);
    expect(slots?.counts[1]).toBe(0);
  });

  it('puts differing rows before shared ones inside each kind', () => {
    const result = compareProposals([tabs, grid]);
    const behaviors = result.rows.filter((r) => r.kind === 'behavior');
    const firstShared = behaviors.findIndex((r) => r.shared);
    expect(firstShared).toBeGreaterThan(0);
    expect(behaviors.slice(0, firstShared).every((r) => !r.shared)).toBe(true);
    expect(behaviors.slice(firstShared).every((r) => r.shared)).toBe(true);
  });
});

describe('isPreviewStale', () => {
  it('is fresh only when the document is still at the preview revision and fully saved', () => {
    expect(isPreviewStale({ baseRevision: 4 }, { revision: 4, pending: 0 })).toBe(false);
    expect(isPreviewStale({ baseRevision: 4 }, { revision: 5, pending: 0 })).toBe(true);
    expect(isPreviewStale({ baseRevision: 4 }, { revision: 4, pending: 1 })).toBe(true);
  });
});

describe('guideSteps', () => {
  const ids = (steps: ReturnType<typeof guideSteps>) => steps.map((s) => [s.id, s.enabled, s.done]);

  it('only enables the first step on an empty project', () => {
    expect(ids(guideSteps({ sources: 0, requirements: 0, proposals: 0 }))).toEqual([
      ['sources', true, false],
      ['requirements', false, false],
      ['proposals', false, false],
    ]);
  });

  it('enables each step once the previous one has content', () => {
    expect(ids(guideSteps({ sources: 2, requirements: 0, proposals: 0 }))).toEqual([
      ['sources', true, true],
      ['requirements', true, false],
      ['proposals', false, false],
    ]);
    expect(ids(guideSteps({ sources: 2, requirements: 5, proposals: 3 }))).toEqual([
      ['sources', true, true],
      ['requirements', true, true],
      ['proposals', true, true],
    ]);
  });
});

describe('summarizeImpact', () => {
  const impact = (sourceId: string, requirements: string[], proposals: string[]): SourceImpact => ({
    change: { sourceId, sourceVersion: 2, change: 'updated', changedAt: '2026-01-01T00:00:00.000Z' },
    requirements: requirements.map((id) => ({
      id,
      text: `Texto ${id}`,
      status: 'confirmed',
      referencedVersion: 1,
    })),
    proposals: proposals.map((id) => ({
      id,
      title: `Propuesta ${id}`,
      status: 'candidate',
      requirementIds: requirements,
    })),
    screens: [],
  });

  it('is null when nothing is affected', () => {
    expect(summarizeImpact([])).toBeNull();
    expect(summarizeImpact([impact('s1', [], [])])).toBeNull();
  });

  it('merges affected requirements and proposals across changes without duplicates', () => {
    const summary = summarizeImpact([impact('s1', ['r1', 'r2'], ['p1']), impact('s2', ['r2'], ['p1', 'p2'])]);
    expect(summary?.requirements.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(summary?.proposals.map((p) => p.id)).toEqual(['p1', 'p2']);
  });
});
