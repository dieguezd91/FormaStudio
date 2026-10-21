import { describe, expect, it } from 'vitest';
import { searchLibrary } from './search';

const topId = (query: string) => searchLibrary(query, { limit: 3 })[0]?.entry.id;

describe('searchLibrary', () => {
  it('finds the tabbed inventory for a natural Spanish query', () => {
    expect(topId('inventario con pestañas')).toBe('inventory.tabs');
  });

  it('ignores accents and plurals', () => {
    expect(topId('inventario con pestanas')).toBe('inventory.tabs');
    expect(topId('inventarios con pestaña')).toBe('inventory.tabs');
    expect(topId('solapas')).toMatch(/tab/i);
  });

  it('finds a drag & drop inventory for "objetos arrastrables"', () => {
    const hit = searchLibrary('inventario con objetos arrastrables', { limit: 3 })[0];
    expect(hit?.entry.family).toBe('inventory');
    expect(hit?.entry.behaviors).toContain('dragDrop');
  });

  it('finds the equipment panel for "equipamiento"', () => {
    expect(topId('equipamiento')).toBe('inventory.equipment');
  });

  it('finds the context menu without the accent', () => {
    expect(topId('menu contextual')).toBe('contextMenu');
    expect(topId('menús contextuales')).toBe('contextMenu');
  });

  it('understands English synonyms', () => {
    expect(topId('tooltip')).toBe('tooltip');
    expect(topId('drag and drop inventory')).toMatch(/^inventory\./);
    expect(topId('equipment')).toBe('inventory.equipment');
  });

  it('returns ranked hits with scores and matched terms, honoring limit', () => {
    const hits = searchLibrary('inventario', { limit: 2 });
    expect(hits).toHaveLength(2);
    const [first, second] = hits;
    expect(first && second && first.score >= second.score).toBe(true);
    expect(first?.score).toBeGreaterThan(0);
    expect(first?.matchedTerms).toEqual(['inventario']);
  });

  it('returns nothing for empty or unrelated queries', () => {
    expect(searchLibrary('   ')).toEqual([]);
    expect(searchLibrary('zzzzqq')).toEqual([]);
  });

  it('is deterministic', () => {
    const ids = (q: string) => searchLibrary(q).map((h) => h.entry.id);
    expect(ids('inventario con pestañas')).toEqual(ids('inventario con pestañas'));
  });
});
