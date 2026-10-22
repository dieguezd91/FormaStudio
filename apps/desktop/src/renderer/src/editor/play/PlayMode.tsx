import { useMemo } from 'react';
import { createRuntime } from '@forma/runtime';
import { useActiveScreen, useEditor } from '../store';
import { ActivityPanel } from './ActivityPanel';
import { PlayStage } from './PlayStage';
import { SimulationBanner } from './SimulationBanner';

/**
 * Probar: the active screen running on a fresh runtime. The runtime is rebuilt whenever the
 * document or the screen changes; nothing here writes to the document.
 */
export function PlayMode() {
  const doc = useEditor((state) => state.doc);
  const screen = useActiveScreen();
  const screenId = screen?.id;
  const runtime = useMemo(
    () => (doc && screenId ? createRuntime(doc, screenId) : null),
    [doc, screenId],
  );

  if (!doc || !screen || !runtime) {
    return (
      <main className="flex min-w-0 flex-1 items-center justify-center text-sm text-muted-foreground">
        No hay una pantalla para probar.
      </main>
    );
  }

  return (
    <>
      <main className="flex min-w-0 flex-1 flex-col" aria-label="Probar" data-testid="play-mode">
        <SimulationBanner doc={doc} screenId={screen.id} />
        <PlayStage doc={doc} screen={screen} runtime={runtime} />
      </main>
      <ActivityPanel runtime={runtime} screen={screen} />
    </>
  );
}
