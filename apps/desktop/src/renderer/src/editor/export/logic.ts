import type { FormaScreen } from '@forma/design-core';
import type {
  BundleDiff,
  CompatibilityItem,
  CompatibilityReport,
  CompatibilityStatus,
  ExportRecord,
} from '@/api/types';

export const DEFAULT_OUTPUT_FOLDER = 'Assets/FormaStudio/Generated';

export const STATUS_LABEL: Record<CompatibilityStatus, string> = {
  supported: 'Funciona',
  adapted: 'Adaptado',
  approximate: 'Aproximado',
  unavailable: 'No disponible',
};

/** Best to worst: what works comes first, what is missing last. */
const STATUS_ORDER: CompatibilityStatus[] = ['supported', 'adapted', 'approximate', 'unavailable'];

export interface ReportGroup {
  status: CompatibilityStatus;
  label: string;
  items: CompatibilityItem[];
}

/** Report items grouped by status (fixed order, empty groups skipped). */
export function groupReport(report: CompatibilityReport): ReportGroup[] {
  return STATUS_ORDER.flatMap((status) => {
    const items = report.items.filter((item) => item.status === status);
    return items.length === 0 ? [] : [{ status, label: STATUS_LABEL[status], items }];
  });
}

/** Short Spanish description of what a report item is about. */
export function describeSubject(item: CompatibilityItem, screen: FormaScreen | undefined): string {
  const { nodeId, behavior, property, dataSourceId, intentName } = item.subject;
  const parts: string[] = [];
  if (nodeId !== undefined) {
    const name = screen?.nodes[nodeId]?.name ?? nodeId;
    const others = (item.nodeIds?.length ?? 0) - 1;
    parts.push(others > 0 ? `${name} (+${others} más)` : name);
  }
  if (behavior !== undefined) parts.push(`comportamiento ${behavior}`);
  if (property !== undefined) parts.push(property);
  if (dataSourceId !== undefined) parts.push(`Datos ${dataSourceId}`);
  if (intentName !== undefined) parts.push(`Intención ${intentName}`);
  return parts.length === 0 ? 'Toda la pantalla' : parts.join(' · ');
}

export const REMOVED_NODES_NOTE =
  'Los nodos eliminados que tengan componentes o hijos agregados por el equipo de desarrollo se conservan en Unity: el importador no los borra.';

export interface DiffSection {
  key: 'added' | 'removed' | 'changed' | 'renamed';
  label: string;
  lines: string[];
}

export interface DiffView {
  isEmpty: boolean;
  sections: DiffSection[];
}

/** The re-export preview as labelled sections; `nameOf` resolves ids that still exist in the design. */
export function describeDiff(
  diff: BundleDiff,
  nameOf: (nodeId: string) => string | undefined = () => undefined,
): DiffView {
  const sections: DiffSection[] = [
    { key: 'added', label: 'Agregados', lines: diff.added.map((id) => nameOf(id) ?? id) },
    { key: 'removed', label: 'Eliminados', lines: diff.removed.map((id) => nameOf(id) ?? id) },
    {
      key: 'changed',
      label: 'Cambiados',
      lines: diff.changed.map((change) => `${change.name}: ${change.paths.join(', ')}`),
    },
    {
      key: 'renamed',
      label: 'Renombrados',
      lines: diff.renamed.map((rename) => `${rename.from} → ${rename.to}`),
    },
  ];
  const shown = sections.filter((section) => section.lines.length > 0);
  return { isEmpty: shown.length === 0, sections: shown };
}

/**
 * Honest status of a screen's export (design doc §12.3): the file was written, but nobody has
 * confirmed it in Unity, so it is never called "integrado".
 */
export function exportStatusLabel(last: ExportRecord | undefined, currentRevision: number): string {
  if (!last) return 'Sin exportar';
  const base = 'Exportado — pendiente de verificar en Unity';
  return last.documentRevision < currentRevision
    ? `${base} · el diseño cambió desde entonces`
    : base;
}

export const isAbsolutePath = (path: string): boolean => /^([A-Za-z]:[\\/]|\/)/.test(path.trim());

export interface TargetOption {
  id: 'unity-ugui' | 'unity-uitoolkit' | 'web-react';
  label: string;
  enabled: boolean;
  /** One honest line shown for targets that do not work yet. */
  note?: string;
}

export function targetOptions(): TargetOption[] {
  return [
    { id: 'unity-ugui', label: 'Unity uGUI', enabled: true },
    {
      id: 'unity-uitoolkit',
      label: 'Unity UI Toolkit',
      enabled: false,
      note: 'Próximamente: el exportador para Unity UI Toolkit todavía no está implementado.',
    },
    {
      id: 'web-react',
      label: 'Web (React)',
      enabled: false,
      note: 'Próximamente: el exportador para Web (React) todavía no está implementado.',
    },
  ];
}

/** The subset of `Storage` used here, so tests (and a missing `localStorage`) stay simple. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ExportPrefs {
  unityProjectPath: string;
  outputFolder: string;
}

const prefsKey = (projectId: string) => `forma.export.prefs.${projectId}`;

const defaultPrefs = (): ExportPrefs => ({
  unityProjectPath: '',
  outputFolder: DEFAULT_OUTPUT_FOLDER,
});

/** Remembered Unity folder and output folder of a project; defaults when absent or unreadable. */
export function loadExportPrefs(storage: KeyValueStorage | null, projectId: string): ExportPrefs {
  try {
    const raw = storage?.getItem(prefsKey(projectId));
    if (!raw) return defaultPrefs();
    const parsed = JSON.parse(raw) as Partial<ExportPrefs> | null;
    if (typeof parsed?.unityProjectPath !== 'string') return defaultPrefs();
    return {
      unityProjectPath: parsed.unityProjectPath,
      outputFolder:
        typeof parsed.outputFolder === 'string' && parsed.outputFolder.trim() !== ''
          ? parsed.outputFolder
          : DEFAULT_OUTPUT_FOLDER,
    };
  } catch {
    return defaultPrefs();
  }
}

/** Best effort: a full or blocked storage must never break exporting. */
export function saveExportPrefs(
  storage: KeyValueStorage | null,
  projectId: string,
  prefs: ExportPrefs,
): void {
  try {
    storage?.setItem(prefsKey(projectId), JSON.stringify(prefs));
  } catch {
    // Not remembering the folder is harmless.
  }
}
