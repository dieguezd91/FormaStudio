import { useCallback, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Maximize, Minus, Plus, Grid3x3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { layoutBatch, type LayoutUpdate } from '../batches';
import { computeHiddenNodes, tabForButton } from '../tabs';
import { editorStore, useActiveScreen, useEditor, useUi } from '../store';
import { fitZoom, stepZoom } from './geometry';
import { CanvasContext, NodeView, type CanvasContextValue } from './NodeView';
import { pickSelectable } from './pick';
import { SelectionControls } from './SelectionControls';
import { useElementSize } from './useElementSize';

type ZoomMode = 'fit' | number;

export function Canvas() {
  const doc = useEditor((state) => state.doc);
  const screen = useActiveScreen();
  const selection = useEditor((state) => state.selection);
  const tabShown = useEditor((state) => state.tabShown);
  const snapEnabled = useUi((state) => state.snap);
  const setSnap = useUi((state) => state.setSnap);

  const viewportRef = useRef<HTMLDivElement>(null);
  const viewport = useElementSize(viewportRef);
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit');

  const zoom = !screen
    ? 1
    : zoomMode === 'fit'
      ? fitZoom(viewport, screen.size)
      : zoomMode;

  const hidden = useMemo(
    () => (screen ? computeHiddenNodes(screen, tabShown) : new Set<string>()),
    [screen, tabShown],
  );
  const selected = useMemo(() => new Set(selection), [selection]);

  const onNodePointerDown = useCallback(
    (event: PointerEvent, nodeId: string) => {
      event.stopPropagation();
      if (event.button !== 0 || !screen) return;
      const state = editorStore.getState();
      if (nodeId === screen.rootId) {
        if (!event.shiftKey) state.clearSelection();
        return;
      }
      const tab = tabForButton(screen, nodeId);
      if (tab) state.showTab(tab.tabBarId, tab.tabId);
      const target = pickSelectable(screen, nodeId);
      if (event.shiftKey) state.select([target], { additive: true });
      else if (!state.selection.includes(target)) state.select([target]);
      else if (state.selection.length > 1) return;
      else state.select([target]);
    },
    [screen],
  );

  const onAreaClick = useCallback(
    (elementId: string | undefined, additive: boolean) => {
      if (!screen || !elementId || elementId === screen.rootId) return;
      const state = editorStore.getState();
      const target = pickSelectable(screen, elementId);
      if (additive) state.select([target], { additive: true });
      else state.select([target]);
    },
    [screen],
  );

  const onCommit = useCallback(
    (updates: LayoutUpdate[]) => {
      if (screen) editorStore.getState().dispatch(layoutBatch(screen, updates));
    },
    [screen],
  );

  if (!doc || !screen) return null;

  const movable = selection.filter((id) => {
    const node = screen.nodes[id];
    return node && !node.locked && id !== screen.rootId && !hidden.has(id);
  });
  const context: CanvasContextValue = { doc, screen, hidden, selected, onNodePointerDown };
  const empty = (screen.nodes[screen.rootId]?.children.length ?? 0) === 0;
  const simulated = doc.dataSources.some((d) => d.connection === 'simulated');

  const clearOnBackground = (event: PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).dataset.canvasBg !== undefined) {
      editorStore.getState().clearSelection();
    }
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col" data-testid="canvas">
      <div
        ref={viewportRef}
        data-canvas-bg
        onPointerDown={clearOnBackground}
        className="relative min-h-0 flex-1 overflow-auto bg-canvas"
      >
        <div
          data-canvas-bg
          className="flex min-h-full min-w-full items-center justify-center p-8"
          style={{ width: 'max-content' }}
        >
          <div
            className="relative shrink-0"
            style={{ width: screen.size.width * zoom, height: screen.size.height * zoom }}
          >
            <div
              data-testid="canvas-stage"
              data-zoom={zoom}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: screen.size.width,
                height: screen.size.height,
                transform: `scale(${zoom})`,
                transformOrigin: '0 0',
                background: '#1a1c22',
                boxShadow: '0 0 0 1px rgb(255 255 255 / 0.08)',
                ['--inv-zoom' as string]: 1 / zoom,
              }}
            >
              <CanvasContext.Provider value={context}>
                <NodeView nodeId={screen.rootId} />
              </CanvasContext.Provider>
            </div>
            <SelectionControls
              screen={screen}
              targets={movable}
              zoom={zoom}
              snapEnabled={snapEnabled}
              onCommit={onCommit}
              onAreaClick={onAreaClick}
            />
          </div>
        </div>
        {empty ? (
          <p className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-sm text-muted-foreground">
            Pantalla vacía. Insertá un componente desde la pestaña Biblioteca.
          </p>
        ) : null}
      </div>

      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-lg">
        <Tooltip label="Alejar" side="top">
          <Button variant="ghost" size="icon" aria-label="Alejar" onClick={() => setZoomMode(stepZoom(zoom, -1))}>
            <Minus size={15} />
          </Button>
        </Tooltip>
        <span className="w-12 text-center text-xs tabular-nums" data-testid="zoom-level">
          {Math.round(zoom * 100)}%
        </span>
        <Tooltip label="Acercar" side="top">
          <Button variant="ghost" size="icon" aria-label="Acercar" onClick={() => setZoomMode(stepZoom(zoom, 1))}>
            <Plus size={15} />
          </Button>
        </Tooltip>
        <Button variant="ghost" size="sm" onClick={() => setZoomMode('fit')}>
          <Maximize size={14} /> Ajustar
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setZoomMode(1)}>
          100%
        </Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <Tooltip label="Ajustar a una cuadrícula de 8 px al mover" side="top">
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={snapEnabled}
            className={cn(snapEnabled && 'bg-accent text-primary')}
            onClick={() => setSnap(!snapEnabled)}
          >
            <Grid3x3 size={14} /> Cuadrícula
          </Button>
        </Tooltip>
      </div>

      {simulated ? (
        <Badge tone="primary" className="absolute left-3 top-3" title="Los datos que ves son de ejemplo">
          Datos simulados
        </Badge>
      ) : null}
    </div>
  );
}
