import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, FolderOpen, Loader2, PackageOpen, TriangleAlert } from 'lucide-react';
import { api } from '@/api';
import type { ExportAnalysis, ExportRecord, ExportResult, UnityFacts } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { messageOf } from '../session';
import { editorStore, useActiveScreen, useEditor } from '../store';
import {
  DEFAULT_OUTPUT_FOLDER,
  exportStatusLabel,
  isAbsolutePath,
  loadExportPrefs,
  saveExportPrefs,
  targetOptions,
} from './logic';
import { DiffView, ReportView } from './ReportView';

type Busy = 'analyzing' | 'installing' | 'exporting' | null;

const storage = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function PackageCheck({
  unity,
  installNote,
  busy,
  onInstall,
}: {
  unity: UnityFacts;
  installNote: string | null;
  busy: boolean;
  onInstall: () => void;
}) {
  return (
    <div data-testid="package-check" data-installed={unity.packageInstalled} className="space-y-2 rounded-lg border border-border bg-card p-3 text-sm">
      <p>
        <span className="font-medium">Versión de Unity: </span>
        <span data-testid="unity-version">{unity.unityVersion ?? 'no se pudo leer'}</span>
      </p>
      {unity.unityVersionWarning ? (
        <p data-testid="unity-version-warning" className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <TriangleAlert size={14} className="mt-0.5 shrink-0 text-primary" />
          {unity.unityVersionWarning}
        </p>
      ) : null}
      {unity.packageInstalled ? (
        <p className="flex items-center gap-1.5 text-xs">
          <CheckCircle2 size={14} className="text-success" />
          El paquete <code>com.forma.studio</code> ya está en el proyecto Unity.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Falta el paquete <code>com.forma.studio</code> en <code>Packages/manifest.json</code>. Sin él, Unity no puede
            importar el bundle.
          </p>
          {unity.manifestLine ? (
            <pre className="overflow-x-auto rounded-md bg-muted p-2 text-[11px]">{unity.manifestLine}</pre>
          ) : null}
          <Button size="sm" variant="secondary" disabled={busy} onClick={onInstall}>
            Instalar paquete
          </Button>
        </div>
      )}
      {installNote ? (
        <p data-testid="install-note" className="text-xs text-muted-foreground">
          {installNote}
        </p>
      ) : null}
    </div>
  );
}

function ResultView({
  result,
  last,
  revision,
  screenName,
}: {
  result: ExportResult;
  last: ExportRecord | undefined;
  revision: number;
  screenName: string;
}) {
  // The importer puts the prefab next to the bundle: `<Screen>.forma.json` -> `<Screen>.prefab`.
  const prefabPath = (result.written.find((path) => path.endsWith('.forma.json')) ?? '').replace(
    /\.forma\.json$/,
    '.prefab',
  );
  return (
    <div data-testid="export-result" className="space-y-3 rounded-lg border border-border bg-card p-3 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <Badge tone="primary" data-testid="export-status">
          {exportStatusLabel(last, revision)}
        </Badge>
      </p>
      <div>
        <p className="mb-1 text-xs font-medium">Archivos escritos</p>
        <ul data-testid="written-files" className="list-disc pl-4 text-xs text-muted-foreground">
          {result.written.map((path) => (
            <li key={path}>
              <code>{path}</code>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs">
        <span className="font-medium">Unity: </span>
        {result.unityVersion ?? 'versión desconocida'}
      </p>
      {result.unityVersionWarning ? (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <TriangleAlert size={14} className="mt-0.5 shrink-0 text-primary" />
          {result.unityVersionWarning}
        </p>
      ) : null}
      <div data-testid="next-steps" className="space-y-1 text-xs">
        <p className="font-medium">Próximos pasos</p>
        <ol className="list-decimal space-y-1 pl-4 text-muted-foreground">
          {!result.packageInstalled ? (
            <li>
              Instalá el paquete <code>com.forma.studio</code> en el proyecto Unity (botón «Instalar paquete» más arriba).
            </li>
          ) : null}
          <li>
            Abrí Unity: el importador de Forma crea o actualiza el prefab en{' '}
            <code data-testid="prefab-path">{prefabPath}</code>.
          </li>
          <li>Conectá tu juego con lo que figura en «Qué tenés que conectar» y arrastrá el prefab a un Canvas.</li>
          <li>
            Hasta que lo veas en Unity, «{screenName}» queda como pendiente de verificar: Forma no puede comprobar la
            integración desde acá.
          </li>
        </ol>
      </div>
    </div>
  );
}

/** Exportar: pick the target and Unity folder, check compatibility, then write the bundle for the importer. */
export function ExportMode() {
  const projectId = useEditor((state) => state.projectId);
  const doc = useEditor((state) => state.doc);
  const revision = useEditor((state) => state.revision);
  const screen = useActiveScreen();

  const [prefs, setPrefs] = useState(() => loadExportPrefs(storage(), projectId ?? ''));
  const [analysis, setAnalysis] = useState<ExportAnalysis | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [history, setHistory] = useState<ExportRecord[]>([]);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [installNote, setInstallNote] = useState<string | null>(null);
  const [confirmInstall, setConfirmInstall] = useState(false);

  const canPick = typeof window !== 'undefined' && typeof window.forma?.pickFolder === 'function';
  const folderOk = isAbsolutePath(prefs.unityProjectPath);

  const refreshHistory = useCallback(async () => {
    if (!projectId) return;
    try {
      setHistory(await api.listExports(projectId));
    } catch {
      // The history is a convenience; the export itself reports real problems.
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    let current = true;
    void api.listExports(projectId).then(
      (list) => current && setHistory(list),
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [projectId]);

  if (!projectId || !doc || !screen) {
    return (
      <main className="flex min-w-0 flex-1 items-center justify-center text-sm text-muted-foreground">
        No hay una pantalla para exportar.
      </main>
    );
  }

  const updatePrefs = (next: Partial<typeof prefs>) => {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    saveExportPrefs(storage(), projectId, merged);
    setAnalysis(null);
    setResult(null);
    setInstallNote(null);
    setError(null);
  };

  /** Runs a service call after the design is saved there, reporting failures in Spanish. */
  const run = async (kind: Exclude<Busy, null>, action: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await editorStore.getState().whenSynced();
      if (editorStore.getState().pending > 0) {
        throw new Error('Hay cambios del diseño sin guardar. Esperá a que se sincronicen e intentá de nuevo.');
      }
      await action();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  };

  const analyze = () =>
    run('analyzing', async () => {
      setResult(null);
      setAnalysis(await api.analyzeExport(projectId, screen.id, prefs.unityProjectPath.trim()));
    });

  const install = async () => {
    setConfirmInstall(false);
    await run('installing', async () => {
      const installed = await api.installFormaPackage(projectId, prefs.unityProjectPath.trim());
      setInstallNote(
        installed.backupPath
          ? `Paquete instalado. Copia de seguridad del manifest: ${installed.backupPath}.`
          : 'El paquete ya estaba instalado; no se modificó nada.',
      );
      setAnalysis(await api.analyzeExport(projectId, screen.id, prefs.unityProjectPath.trim()));
    });
  };

  const exportNow = () =>
    run('exporting', async () => {
      const exported = await api.exportUgui(projectId, {
        screenId: screen.id,
        unityProjectPath: prefs.unityProjectPath.trim(),
        outputFolder: prefs.outputFolder.trim() || DEFAULT_OUTPUT_FOLDER,
      });
      setResult(exported);
      setAnalysis({
        report: exported.report,
        diff: exported.diff,
        unity: {
          unityVersion: exported.unityVersion,
          packageInstalled: exported.packageInstalled,
          ...(exported.unityVersionWarning ? { unityVersionWarning: exported.unityVersionWarning } : {}),
          ...(exported.manifestLine ? { manifestLine: exported.manifestLine } : {}),
        },
      });
      await refreshHistory();
    });

  const pickFolder = async () => {
    try {
      const picked = await window.forma?.pickFolder?.();
      if (picked) updatePrefs({ unityProjectPath: picked });
    } catch {
      setError('No se pudo abrir el selector de carpetas. Escribí la ruta a mano.');
    }
  };

  const lastForScreen = history.find((record) => record.screenId === screen.id);

  return (
    <main className="min-w-0 flex-1 overflow-y-auto" aria-label="Exportar" data-testid="export-mode">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <header className="flex items-start gap-3">
          <PackageOpen size={28} className="mt-0.5 text-muted-foreground" />
          <div>
            <h2 className="text-lg font-semibold">Exportar</h2>
            <p className="text-sm text-muted-foreground">
              Llevá «{screen.name}» a tu proyecto Unity como un bundle que el importador de Forma convierte en un Prefab.
            </p>
          </div>
        </header>

        <Section title="Destino">
          <ul className="space-y-1.5" data-testid="export-targets">
            {targetOptions().map((option) => (
              <li
                key={option.id}
                data-testid="export-target"
                data-target={option.id}
                data-enabled={option.enabled}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
              >
                <input
                  type="radio"
                  name="export-target"
                  aria-label={option.label}
                  checked={option.enabled}
                  disabled={!option.enabled}
                  readOnly
                />
                <span className={option.enabled ? 'font-medium' : 'text-muted-foreground'}>{option.label}</span>
                {option.enabled ? null : <Badge>Próximamente</Badge>}
                {option.note ? <p className="w-full pl-6 text-xs text-muted-foreground">{option.note}</p> : null}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Proyecto Unity">
          {doc.screens.length > 1 ? (
            <label className="block space-y-1 text-xs">
              <span className="font-medium">Pantalla a exportar</span>
              <Select
                aria-label="Pantalla a exportar"
                value={screen.id}
                onChange={(event) => {
                  editorStore.getState().setActiveScreen(event.target.value);
                  setAnalysis(null);
                  setResult(null);
                }}
              >
                {doc.screens.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
          <label className="block space-y-1 text-xs">
            <span className="font-medium">Carpeta del proyecto Unity</span>
            <div className="flex gap-2">
              <Input
                aria-label="Carpeta del proyecto Unity"
                placeholder={'C:\\Proyectos\\MiJuego'}
                value={prefs.unityProjectPath}
                onChange={(event) => updatePrefs({ unityProjectPath: event.target.value })}
              />
              {canPick ? (
                <Button variant="secondary" size="sm" className="h-8 shrink-0" onClick={() => void pickFolder()}>
                  <FolderOpen size={14} />
                  Elegir carpeta…
                </Button>
              ) : null}
            </div>
            <span className="text-muted-foreground">
              La carpeta raíz del proyecto: la que contiene <code>Assets</code> y <code>ProjectSettings</code>. Se
              recuerda para este proyecto.
              {prefs.unityProjectPath.trim() !== '' && !folderOk ? ' La ruta tiene que ser absoluta.' : ''}
            </span>
          </label>
          <label className="block space-y-1 text-xs">
            <span className="font-medium">Carpeta de salida (dentro de Assets)</span>
            <Input
              aria-label="Carpeta de salida"
              value={prefs.outputFolder}
              onChange={(event) => updatePrefs({ outputFolder: event.target.value })}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button variant="secondary" disabled={!folderOk || busy !== null} onClick={() => void analyze()}>
              {busy === 'analyzing' ? <Loader2 size={14} className="animate-spin" /> : null}
              Analizar compatibilidad
            </Button>
            <Button disabled={!folderOk || busy !== null} onClick={() => void exportNow()}>
              {busy === 'exporting' ? <Loader2 size={14} className="animate-spin" /> : null}
              Exportar a Unity
            </Button>
            <span data-testid="export-status-line" className="text-xs text-muted-foreground">
              {exportStatusLabel(lastForScreen, revision)}
            </span>
          </div>
        </Section>

        {error ? (
          <div role="alert" data-testid="export-error" className="rounded-lg border border-destructive/60 bg-destructive/10 p-3 text-sm">
            {error}
          </div>
        ) : null}

        {analysis?.unity ? (
          <Section title="Paquete de Forma en Unity">
            <PackageCheck
              unity={analysis.unity}
              installNote={installNote}
              busy={busy !== null}
              onInstall={() => setConfirmInstall(true)}
            />
          </Section>
        ) : null}

        {analysis ? (
          <Section title="Compatibilidad con Unity uGUI">
            <ReportView report={analysis.report} screen={screen} />
            {analysis.diff ? <DiffView diff={analysis.diff} screen={screen} /> : null}
          </Section>
        ) : null}

        {result ? (
          <Section title="Resultado">
            <ResultView
              result={result}
              last={lastForScreen}
              revision={revision}
              screenName={screen.name}
            />
          </Section>
        ) : null}

        <Section title="Historial de exportaciones">
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground">Todavía no exportaste este proyecto.</p>
          ) : (
            <ul data-testid="export-history" className="space-y-1.5">
              {history.map((record) => (
                <li
                  key={record.id}
                  data-testid="export-history-item"
                  className="rounded-lg border border-border bg-card px-3 py-2 text-xs"
                >
                  <p className="font-medium">
                    {doc.screens.find((s) => s.id === record.screenId)?.name ?? record.screenId} ·{' '}
                    {new Date(record.createdAt).toLocaleString('es')}
                  </p>
                  <p className="text-muted-foreground">
                    <code>{record.written[0] ?? record.outputFolder}</code> · revisión {record.documentRevision} ·{' '}
                    {exportStatusLabel(record, record.documentRevision)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Dialog
        open={confirmInstall}
        onClose={() => setConfirmInstall(false)}
        title="Instalar el paquete de Forma"
        description="Se va a agregar com.forma.studio a Packages/manifest.json del proyecto Unity. Antes se guarda una copia de seguridad como manifest.json.forma-backup en la misma carpeta."
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmInstall(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void install()}>Instalar</Button>
        </div>
      </Dialog>
    </main>
  );
}
