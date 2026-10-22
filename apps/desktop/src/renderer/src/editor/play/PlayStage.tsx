import { useRef, useSyncExternalStore } from 'react';
import { Gamepad2 } from 'lucide-react';
import type { FormaDocument, FormaScreen } from '@forma/design-core';
import type { Runtime } from '@forma/runtime';
import { Badge } from '@/components/ui/badge';
import { fitZoom } from '../canvas/geometry';
import { useElementSize } from '../canvas/useElementSize';
import { ContextMenuOverlay, DragGhost, SplitDialog, TooltipOverlay } from './PlayOverlays';
import { PlayContext, PlayNode } from './PlayNode';
import { useGamepad, useKeyboardInput, usePointerInput } from './usePlayInput';

interface PlayStageProps {
  doc: FormaDocument;
  screen: FormaScreen;
  runtime: Runtime;
}

/** The active screen at fit scale, interactive through the runtime only (nothing here edits the document). */
export function PlayStage({ doc, screen, runtime }: PlayStageProps) {
  const state = useSyncExternalStore(runtime.subscribe, runtime.getState);
  const viewportRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const viewport = useElementSize(viewportRef);
  const zoom = fitZoom(viewport, screen.size);

  const pointer = usePointerInput(runtime, frameRef, zoom);
  useKeyboardInput(runtime);
  const gamepad = useGamepad(runtime);

  const { menu, tooltip, drag, split } = state.ui;
  const splitName = split ? runtime.resolveNode(split.nodeId).record?.['name'] : undefined;

  return (
    <div
      ref={viewportRef}
      className="relative min-h-0 flex-1 overflow-hidden bg-canvas"
      data-testid="play-viewport"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          ref={frameRef}
          data-testid="play-stage"
          data-zoom={zoom}
          className="relative shrink-0 select-none"
          style={{ width: screen.size.width * zoom, height: screen.size.height * zoom, touchAction: 'none' }}
          onPointerDown={pointer.onPointerDown}
          onPointerMove={pointer.onPointerMove}
          onPointerLeave={pointer.onPointerLeave}
        >
          <div
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
            }}
          >
            <PlayContext.Provider value={{ doc, screen, runtime, state }}>
              <PlayNode nodeId={screen.rootId} />
            </PlayContext.Provider>
          </div>
          {menu ? <ContextMenuOverlay runtime={runtime} menu={menu} zoom={zoom} /> : null}
          {split ? (
            <SplitDialog
              key={`${split.nodeId}:${split.itemRef.uid}`}
              runtime={runtime}
              split={split}
              itemName={typeof splitName === 'string' ? splitName : undefined}
            />
          ) : null}
        </div>
      </div>

      {menu ? (
        <div
          className="absolute inset-0 z-20"
          data-testid="play-menu-backdrop"
          onPointerDown={() => runtime.dispatch({ type: 'menuClose' })}
        />
      ) : null}
      {tooltip && pointer.hoverAt ? <TooltipOverlay record={tooltip.record} at={pointer.hoverAt} /> : null}
      {drag && pointer.ghost ? (
        <DragGhost record={runtime.resolveNode(drag.sourceNodeId).record} at={pointer.ghost} />
      ) : null}
      {gamepad ? (
        <Badge tone="success" className="absolute right-3 top-3 gap-1" data-testid="gamepad-badge">
          <Gamepad2 size={12} /> Mando conectado
        </Badge>
      ) : null}
    </div>
  );
}
