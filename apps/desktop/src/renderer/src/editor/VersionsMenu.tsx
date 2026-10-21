import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, History as HistoryIcon } from 'lucide-react';
import { api } from '@/api';
import type { VersionMeta } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { Input } from '@/components/ui/input';
import { editorStore, useEditor } from './store';
import { messageOf } from './session';

const STATUS_LABEL = { draft: 'Borrador', approved: 'Aprobada', superseded: 'Reemplazada' } as const;

function useVersions(projectId: string | null) {
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  // The banner already tells the user when the service is down, so failures are ignored here.
  const reload = useCallback(async () => {
    if (!projectId) return;
    await api.listVersions(projectId).then(setVersions, () => undefined);
  }, [projectId]);
  useEffect(() => {
    if (!projectId) return;
    let current = true;
    void api.listVersions(projectId).then(
      (list) => current && setVersions(list),
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [projectId]);
  return { versions, reload };
}

export function VersionsMenu() {
  const projectId = useEditor((state) => state.projectId);
  const { versions, reload } = useVersions(projectId);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const approved = versions.find((v) => v.status === 'approved');

  /** Runs a service action after pending edits are saved, reporting failures as notices. */
  const run = async (action: () => Promise<void>) => {
    const state = editorStore.getState();
    setBusy(true);
    try {
      await state.whenSynced();
      if (editorStore.getState().pending > 0) {
        state.notify('error', 'Hay cambios sin guardar; esperá a que se sincronicen e intentá de nuevo.');
        return;
      }
      await action();
      await reload();
    } catch (e) {
      state.notify('error', messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  if (!projectId) return null;

  const save = () =>
    run(async () => {
      const name = label.trim();
      if (name === '') return;
      await api.createVersion(projectId, name);
      setLabel('');
      editorStore.getState().notify('info', `Versión “${name}” guardada.`);
    });

  const restore = (version: VersionMeta) =>
    run(async () => {
      setConfirming(null);
      // Restoring replaces the document, so keep the current state as a version first.
      await api.createVersion(projectId, `Antes de restaurar “${version.label}”`);
      const { revision } = editorStore.getState();
      const restored = await api.restoreVersion(projectId, version.id, revision);
      editorStore.getState().replaceDocument(restored.document, restored.revision);
      editorStore
        .getState()
        .notify('info', `Restauraste “${version.label}”. El estado anterior quedó guardado como versión.`);
    });

  const approve = (version: VersionMeta) =>
    run(async () => {
      await api.approveVersion(projectId, version.id);
      editorStore.getState().notify('info', `Versión “${version.label}” aprobada.`);
    });

  return (
    <Dropdown
      trigger={({ open, toggle }) => (
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={open}
          aria-haspopup="menu"
          data-testid="versions-trigger"
          onClick={toggle}
        >
          <HistoryIcon size={15} /> Versiones
          {approved ? (
            <Badge tone="success" data-testid="approved-indicator">
              <BadgeCheck size={12} className="mr-0.5" /> v{approved.number}
            </Badge>
          ) : null}
        </Button>
      )}
    >
      {() => (
        <div className="w-80 space-y-3" data-testid="versions-menu">
          <form
            className="flex gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <Input
              aria-label="Nombre de la versión"
              placeholder="Nombre de la versión"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
            <Button type="submit" size="sm" disabled={busy || label.trim() === ''}>
              Guardar
            </Button>
          </form>

          {versions.length === 0 ? (
            <p className="text-xs text-muted-foreground">Todavía no hay versiones guardadas.</p>
          ) : (
            <ul className="max-h-72 space-y-1.5 overflow-y-auto">
              {versions.map((version) => (
                <li key={version.id} className="rounded-md border border-border p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-medium" title={version.label}>
                      v{version.number} · {version.label}
                    </span>
                    <Badge tone={version.status === 'approved' ? 'success' : 'neutral'}>
                      {STATUS_LABEL[version.status]}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground">{new Date(version.createdAt).toLocaleString('es')}</p>
                  {confirming === version.id ? (
                    <div className="mt-1.5 space-y-1.5">
                      <p>Se reemplaza el documento actual (antes se guarda una copia). ¿Restaurar?</p>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="destructive" disabled={busy} onClick={() => void restore(version)}>
                          Sí, restaurar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1.5 flex gap-1.5">
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirming(version.id)}>
                        Restaurar
                      </Button>
                      {version.status !== 'approved' ? (
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void approve(version)}>
                          Aprobar
                        </Button>
                      ) : null}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Dropdown>
  );
}
