import { useMemo } from 'react';
import type { FormaDocument } from '@forma/design-core';
import { computeHiddenNodes } from '../tabs';
import { CanvasContext, NodeView, type CanvasContextValue } from '../canvas/NodeView';

const NO_SELECTION: ReadonlySet<string> = new Set();
const ignore = () => undefined;

interface ProposalThumbnailProps {
  document: FormaDocument | undefined;
  /** Rendered width in px; the height follows the screen's aspect ratio. */
  width: number;
  screenId?: string;
}

/** A proposal's screen drawn with the editor's own renderer, scaled down and non-interactive. */
export function ProposalThumbnail({ document, width, screenId }: ProposalThumbnailProps) {
  const screen = document?.screens.find((s) => s.id === screenId) ?? document?.screens[0];
  const context = useMemo<CanvasContextValue | null>(
    () =>
      document && screen
        ? { doc: document, screen, hidden: computeHiddenNodes(screen, {}), selected: NO_SELECTION, onNodePointerDown: ignore }
        : null,
    [document, screen],
  );

  if (!screen || !context) {
    return (
      <div
        data-testid="proposal-thumbnail"
        data-state="loading"
        className="flex items-center justify-center rounded-md bg-muted text-xs text-muted-foreground"
        style={{ width, height: (width * 9) / 16 }}
      >
        Cargando vista previa…
      </div>
    );
  }

  const zoom = width / screen.size.width;
  return (
    <div
      data-testid="proposal-thumbnail"
      data-state="ready"
      aria-hidden
      className="pointer-events-none relative overflow-hidden rounded-md"
      style={{ width, height: screen.size.height * zoom, background: '#1a1c22', boxShadow: '0 0 0 1px rgb(255 255 255 / 0.08)' }}
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
          ['--inv-zoom' as string]: 1 / zoom,
        }}
      >
        <CanvasContext.Provider value={context}>
          <NodeView nodeId={screen.rootId} />
        </CanvasContext.Provider>
      </div>
    </div>
  );
}
