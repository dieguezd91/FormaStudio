import { useEffect } from 'react';
import { Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Canvas } from './canvas/Canvas';
import { ExplorePanel } from './explore/ExplorePanel';
import { Inspector } from './inspector/Inspector';
import { ModePlaceholder } from './ModePlaceholder';
import { useEditorShortcuts } from './shortcuts';
import { editorStore, useEditor, useUi } from './store';
import { TopBar } from './TopBar';

function NoticeToast() {
  const notice = useEditor((state) => state.notice);
  const noticeId = notice?.id;
  const kind = notice?.kind;

  useEffect(() => {
    if (noticeId === undefined || kind !== 'info') return;
    const timer = setTimeout(() => editorStore.getState().dismissNotice(), 7000);
    return () => clearTimeout(timer);
  }, [noticeId, kind]);

  if (!notice) return null;
  return (
    <div
      role={notice.kind === 'error' ? 'alert' : 'status'}
      data-testid="notice"
      data-kind={notice.kind}
      className={cn(
        'fixed bottom-4 left-4 z-[110] flex max-w-md items-start gap-2 rounded-lg border bg-popover p-3 text-sm shadow-xl',
        notice.kind === 'error' ? 'border-destructive/60' : 'border-border',
      )}
    >
      <p className="flex-1">{notice.message}</p>
      <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Cerrar aviso" onClick={() => editorStore.getState().dismissNotice()}>
        <X size={14} />
      </Button>
    </div>
  );
}

function AiNotice() {
  const visible = useUi((state) => state.aiNotice);
  const hide = useUi((state) => state.setAiNotice);
  if (!visible) return null;
  return (
    <div
      data-testid="ai-notice"
      className="flex items-start gap-2 border-b border-border bg-primary/10 px-4 py-2 text-sm"
    >
      <Info size={16} className="mt-0.5 shrink-0 text-primary" />
      <p className="flex-1">
        <strong>Crear con IA todavía no está disponible.</strong> La generación llega en una próxima versión. Mientras
        tanto, subí acá tus documentos e imágenes de referencia: quedan guardados con el proyecto para cuando esté
        lista, y podés diseñar a mano o con la Biblioteca.
      </p>
      <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Cerrar" onClick={() => hide(false)}>
        <X size={14} />
      </Button>
    </div>
  );
}

interface EditorScreenProps {
  projectId: string;
  projectName: string;
  serviceUp: boolean;
  onExit: () => void;
}

export function EditorScreen({ projectId, projectName, serviceUp, onExit }: EditorScreenProps) {
  const status = useEditor((state) => state.status);
  const loadError = useEditor((state) => state.loadError);
  const syncStatus = useEditor((state) => state.syncStatus);
  const pending = useEditor((state) => state.pending);
  const mode = useUi((state) => state.mode);

  useEffect(() => {
    void editorStore.getState().open(projectId, projectName);
    return () => editorStore.getState().close();
  }, [projectId, projectName]);

  useEditorShortcuts(status === 'ready' && mode === 'design');

  // Edits that were waiting for the service go out as soon as it is back.
  useEffect(() => {
    if (serviceUp && syncStatus === 'offline') editorStore.getState().retrySync();
  }, [serviceUp, syncStatus]);

  useEffect(() => {
    if (pending === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending]);

  if (status === 'failed') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center" data-testid="editor-error">
        <h2 className="text-lg font-semibold">No pudimos abrir el proyecto</h2>
        <p className="max-w-md text-sm text-muted-foreground">{loadError}</p>
        <div className="flex gap-2">
          <Button onClick={() => void editorStore.getState().open(projectId, projectName)}>Reintentar</Button>
          <Button variant="outline" onClick={onExit}>
            Volver a Proyectos
          </Button>
        </div>
      </div>
    );
  }

  if (status !== 'ready') {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground" data-testid="editor-loading">
        Abriendo proyecto…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col" data-testid="editor">
      <TopBar onExit={onExit} />
      <AiNotice />
      <div className="flex min-h-0 flex-1">
        {mode === 'design' ? (
          <>
            <ExplorePanel />
            <main className="min-w-0 flex-1" aria-label="Canvas">
              <Canvas />
            </main>
            <Inspector />
          </>
        ) : (
          <main className="min-w-0 flex-1">
            <ModePlaceholder mode={mode} />
          </main>
        )}
      </div>
      <NoticeToast />
    </div>
  );
}
