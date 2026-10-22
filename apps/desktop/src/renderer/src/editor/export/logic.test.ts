import { describe, expect, it } from 'vitest';
import type { BundleDiff, CompatibilityItem, CompatibilityReport, ExportRecord } from '@/api/types';
import { inventoryDoc, screenOf } from '../testing';
import {
  DEFAULT_OUTPUT_FOLDER,
  REMOVED_NODES_NOTE,
  describeDiff,
  describeSubject,
  exportStatusLabel,
  groupReport,
  isAbsolutePath,
  loadExportPrefs,
  saveExportPrefs,
  targetOptions,
  type KeyValueStorage,
} from './logic';

const item = (status: CompatibilityItem['status'], extra: Partial<CompatibilityItem> = {}): CompatibilityItem => ({
  subject: {},
  status,
  impact: `impacto ${status}`,
  action: `acción ${status}`,
  ...extra,
});

const report = (items: CompatibilityItem[]): CompatibilityReport => ({
  items,
  summary: {
    counts: { supported: 0, adapted: 0, approximate: 0, unavailable: 0 },
    youWillReceive: [],
    youMustConnect: [],
  },
});

describe('groupReport', () => {
  it('groups by status in a fixed order with Spanish labels, skipping empty groups', () => {
    const groups = groupReport(
      report([item('unavailable'), item('supported'), item('approximate'), item('supported')]),
    );
    expect(groups.map((g) => [g.status, g.label, g.items.length])).toEqual([
      ['supported', 'Funciona', 2],
      ['approximate', 'Aproximado', 1],
      ['unavailable', 'No disponible', 1],
    ]);
  });

  it('labels the adapted status and returns nothing for an empty report', () => {
    expect(groupReport(report([item('adapted')]))[0]?.label).toBe('Adaptado');
    expect(groupReport(report([]))).toEqual([]);
  });
});

describe('describeSubject', () => {
  const screen = screenOf(inventoryDoc());
  const [firstId = '', secondId = ''] = Object.keys(screen.nodes);

  it('names the node, the behavior and the property', () => {
    const name = screen.nodes[firstId]!.name;
    expect(describeSubject(item('adapted', { subject: { nodeId: firstId } }), screen)).toBe(name);
    expect(
      describeSubject(item('adapted', { subject: { nodeId: firstId, behavior: 'tabs' } }), screen),
    ).toBe(`${name} · comportamiento tabs`);
    expect(
      describeSubject(item('adapted', { subject: { nodeId: firstId, property: 'style.shadow' } }), screen),
    ).toBe(`${name} · style.shadow`);
  });

  it('adds how many other nodes share a merged finding', () => {
    const name = screen.nodes[firstId]!.name;
    expect(
      describeSubject(item('adapted', { subject: { nodeId: firstId }, nodeIds: [firstId, secondId, 'x'] }), screen),
    ).toBe(`${name} (+2 más)`);
  });

  it('falls back to ids and to data sources / intents when the node is gone', () => {
    expect(describeSubject(item('adapted', { subject: { nodeId: 'ghost' } }), screen)).toBe('ghost');
    expect(describeSubject(item('adapted', { subject: { dataSourceId: 'ds1' } }), screen)).toBe('Datos ds1');
    expect(describeSubject(item('adapted', { subject: { intentName: 'moveItem' } }), screen)).toBe(
      'Intención moveItem',
    );
    expect(describeSubject(item('adapted'), undefined)).toBe('Toda la pantalla');
  });
});

describe('describeDiff', () => {
  const empty: BundleDiff = { added: [], removed: [], changed: [], renamed: [] };

  it('is empty (and says so) when nothing changed', () => {
    expect(describeDiff(empty)).toEqual({ isEmpty: true, sections: [] });
  });

  it('lists agregados / eliminados / cambiados / renombrados with counts, skipping empty ones', () => {
    const diff: BundleDiff = {
      added: ['n1'],
      removed: ['n2', 'n3'],
      changed: [{ nodeId: 'n4', name: 'Panel', paths: ['rect', 'style.fill'] }],
      renamed: [{ nodeId: 'n5', from: 'A', to: 'B' }],
    };
    const view = describeDiff(diff, (id) => (id === 'n1' ? 'Nuevo' : undefined));
    expect(view.isEmpty).toBe(false);
    expect(view.sections.map((s) => [s.key, s.label, s.lines.length])).toEqual([
      ['added', 'Agregados', 1],
      ['removed', 'Eliminados', 2],
      ['changed', 'Cambiados', 1],
      ['renamed', 'Renombrados', 1],
    ]);
    expect(view.sections[0]?.lines).toEqual(['Nuevo']);
    expect(view.sections[1]?.lines).toEqual(['n2', 'n3']);
    expect(view.sections[2]?.lines).toEqual(['Panel: rect, style.fill']);
    expect(view.sections[3]?.lines).toEqual(['A → B']);
  });

  it('explains that removed nodes with developer additions are preserved', () => {
    expect(REMOVED_NODES_NOTE).toMatch(/componentes/);
    expect(REMOVED_NODES_NOTE).toMatch(/hijos/);
    expect(REMOVED_NODES_NOTE).toMatch(/conserva/);
  });
});

describe('exportStatusLabel', () => {
  const record = (documentRevision: number): ExportRecord => ({
    id: 'e1',
    screenId: 's',
    target: 'unity-ugui',
    unityProjectPath: 'C:\\Juego',
    outputFolder: 'Assets/FormaStudio/Generated',
    documentRevision,
    written: [],
    createdAt: '2026-10-22T10:00:00.000Z',
  });

  it('never claims the export is integrated: it is pending verification in Unity', () => {
    const label = exportStatusLabel(record(3), 3);
    expect(label).toBe('Exportado — pendiente de verificar en Unity');
    expect(label.toLowerCase()).not.toContain('integrado');
  });

  it('says so when the design changed after the last export, or when there is none', () => {
    expect(exportStatusLabel(record(3), 5)).toBe(
      'Exportado — pendiente de verificar en Unity · el diseño cambió desde entonces',
    );
    expect(exportStatusLabel(undefined, 5)).toBe('Sin exportar');
  });
});

describe('export preferences per project', () => {
  const memory = (): KeyValueStorage & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => void data.set(key, value),
    };
  };

  it('remembers the Unity folder and output folder separately for each project', () => {
    const storage = memory();
    saveExportPrefs(storage, 'p1', { unityProjectPath: 'C:\\A', outputFolder: 'Assets/UI' });
    saveExportPrefs(storage, 'p2', { unityProjectPath: 'C:\\B', outputFolder: DEFAULT_OUTPUT_FOLDER });
    expect(loadExportPrefs(storage, 'p1')).toEqual({ unityProjectPath: 'C:\\A', outputFolder: 'Assets/UI' });
    expect(loadExportPrefs(storage, 'p2').unityProjectPath).toBe('C:\\B');
  });

  it('falls back to defaults for unknown projects, corrupt values and missing storage', () => {
    const defaults = { unityProjectPath: '', outputFolder: DEFAULT_OUTPUT_FOLDER };
    const storage = memory();
    expect(loadExportPrefs(storage, 'nope')).toEqual(defaults);
    storage.setItem('forma.export.prefs.p1', '{nope');
    expect(loadExportPrefs(storage, 'p1')).toEqual(defaults);
    storage.setItem('forma.export.prefs.p1', JSON.stringify({ unityProjectPath: 3 }));
    expect(loadExportPrefs(storage, 'p1')).toEqual(defaults);
    expect(loadExportPrefs(null, 'p1')).toEqual(defaults);
    expect(() => saveExportPrefs(null, 'p1', defaults)).not.toThrow();
  });

  it('survives a storage that throws', () => {
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(loadExportPrefs(broken, 'p1').unityProjectPath).toBe('');
    expect(() => saveExportPrefs(broken, 'p1', { unityProjectPath: 'x', outputFolder: 'y' })).not.toThrow();
  });
});

describe('isAbsolutePath', () => {
  it('accepts Windows and POSIX absolute paths only', () => {
    expect(isAbsolutePath('C:\\Proyectos\\Juego')).toBe(true);
    expect(isAbsolutePath('D:/Juego')).toBe(true);
    expect(isAbsolutePath('/home/dani/Juego')).toBe(true);
    expect(isAbsolutePath('Juego')).toBe(false);
    expect(isAbsolutePath('..\\Juego')).toBe(false);
    expect(isAbsolutePath('')).toBe(false);
  });
});

describe('targetOptions', () => {
  it('enables only Unity uGUI and gives each upcoming target one honest line', () => {
    const options = targetOptions();
    expect(options.map((o) => [o.id, o.label, o.enabled])).toEqual([
      ['unity-ugui', 'Unity uGUI', true],
      ['unity-uitoolkit', 'Unity UI Toolkit', false],
      ['web-react', 'Web (React)', false],
    ]);
    for (const option of options.filter((o) => !o.enabled)) {
      expect(option.note).toMatch(/todavía no está implementado/);
    }
  });
});
