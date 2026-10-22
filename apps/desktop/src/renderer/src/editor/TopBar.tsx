import { ArrowLeft, CircleCheck, CloudOff, Loader2, Plus, Redo2, Sparkles, Undo2 } from 'lucide-react';
import { useAiGate } from '@/app/useAiGate';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { addScreenBatch } from './batches';
import { editorStore, useEditor, useUi, type EditorMode } from './store';
import { VersionsMenu } from './VersionsMenu';

const MODES: { id: EditorMode; label: string }[] = [
  { id: 'design', label: 'Diseñar' },
  { id: 'test', label: 'Probar' },
  { id: 'export', label: 'Exportar' },
];

function SyncIndicator() {
  const syncStatus = useEditor((state) => state.syncStatus);
  const pending = useEditor((state) => state.pending);
  const view =
    syncStatus === 'offline'
      ? {
          icon: <CloudOff size={14} />,
          text: `Sin conexión · ${pending} ${pending === 1 ? 'cambio' : 'cambios'} sin guardar`,
          tone: 'text-destructive',
        }
      : syncStatus === 'saving'
        ? { icon: <Loader2 size={14} className="animate-spin" />, text: 'Guardando…', tone: 'text-muted-foreground' }
        : { icon: <CircleCheck size={14} />, text: 'Guardado', tone: 'text-success' };
  return (
    <span
      data-testid="sync-status"
      data-status={syncStatus}
      data-pending={pending}
      aria-live="polite"
      className={cn('flex items-center gap-1.5 text-xs', view.tone)}
    >
      {view.icon}
      {view.text}
    </span>
  );
}

function UndoRedo() {
  const history = useEditor((state) => state.history);
  const undoEntry = history.undoStack.at(-1);
  const redoEntry = history.redoStack.at(-1);
  const state = editorStore.getState();
  // Probar never touches the document, so history is frozen there.
  const inDesign = useUi((ui) => ui.mode) === 'design';
  return (
    <div className="flex items-center">
      <Tooltip label={undoEntry ? `Deshacer: ${undoEntry.batch.label} (Ctrl+Z)` : 'Nada para deshacer'}>
        <Button variant="ghost" size="icon" aria-label="Deshacer" disabled={!inDesign || !undoEntry} onClick={() => state.undo()}>
          <Undo2 size={16} />
        </Button>
      </Tooltip>
      <Tooltip label={redoEntry ? `Rehacer: ${redoEntry.batch.label} (Ctrl+Shift+Z)` : 'Nada para rehacer'}>
        <Button variant="ghost" size="icon" aria-label="Rehacer" disabled={!inDesign || !redoEntry} onClick={() => state.redo()}>
          <Redo2 size={16} />
        </Button>
      </Tooltip>
    </div>
  );
}

export function TopBar({ onExit }: { onExit: () => void }) {
  const projectName = useEditor((state) => state.projectName);
  const doc = useEditor((state) => state.doc);
  const activeScreenId = useEditor((state) => state.activeScreenId);
  const mode = useUi((state) => state.mode);
  const setMode = useUi((state) => state.setMode);
  const askOpen = useUi((state) => state.askOpen);
  const setAskOpen = useUi((state) => state.setAskOpen);
  const gate = useAiGate();

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card px-3">
      <Tooltip label="Volver a Proyectos">
        <Button variant="ghost" size="icon" aria-label="Volver a Proyectos" onClick={onExit}>
          <ArrowLeft size={16} />
        </Button>
      </Tooltip>

      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-semibold" data-testid="project-name" title={projectName}>
          {projectName || doc?.name}
        </span>
        <span className="text-muted-foreground">/</span>
        {doc && doc.screens.length > 0 ? (
          <>
            <Select
              aria-label="Pantalla"
              data-testid="screen-select"
              className="h-8 w-44"
              value={activeScreenId ?? ''}
              onChange={(event) => editorStore.getState().setActiveScreen(event.target.value)}
            >
              {doc.screens.map((screen) => (
                <option key={screen.id} value={screen.id}>
                  {screen.name}
                </option>
              ))}
            </Select>
            <Tooltip label="Agregar pantalla">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Agregar pantalla"
                onClick={() => {
                  const batch = addScreenBatch(doc);
                  const created = batch.ops[0];
                  const result = editorStore.getState().dispatch(batch);
                  if (result.ok && created?.type === 'addScreen') editorStore.getState().setActiveScreen(created.screen.id);
                }}
              >
                <Plus size={16} />
              </Button>
            </Tooltip>
          </>
        ) : null}
      </div>

      <SyncIndicator />

      <div role="tablist" aria-label="Modo" className="mx-auto flex rounded-lg bg-background p-0.5">
        {MODES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            className={cn(
              'rounded-md px-4 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
              mode === id && 'bg-accent text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <UndoRedo />
      <VersionsMenu />
      <Tooltip
        label={gate.reason ?? (mode === 'design' ? 'Pedir un cambio a la IA' : 'Volvé a Diseñar para pedir cambios')}
        align="end"
        wrap={!gate.usable}
      >
        <Button
          variant="secondary"
          size="sm"
          data-testid="ask-ai-trigger"
          aria-pressed={askOpen}
          disabled={mode !== 'design' || !gate.usable}
          onClick={() => setAskOpen(!askOpen)}
        >
          <Sparkles size={14} /> Pedir a la IA
        </Button>
      </Tooltip>
    </header>
  );
}
