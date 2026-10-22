import { AskAiButton } from '../ai/AskAiButton';
import { useActiveScreen, useEditor } from '../store';
import { NodeInspector } from './NodeInspector';
import { ScreenInspector } from './ScreenInspector';

/** Contextual panel: shows what applies to the current selection (design doc §8.2). */
export function Inspector() {
  const doc = useEditor((state) => state.doc);
  const screen = useActiveScreen();
  const selection = useEditor((state) => state.selection);
  if (!doc || !screen) return null;

  const [first] = selection;
  const node = selection.length === 1 && first ? screen.nodes[first] : undefined;

  return (
    <aside
      aria-label="Inspector"
      data-testid="inspector"
      className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-border bg-card"
    >
      {node ? (
        <NodeInspector key={node.id} doc={doc} screen={screen} node={node} />
      ) : selection.length > 1 ? (
        <div className="space-y-2 p-3" data-testid="multi-inspector">
          <p className="text-sm font-semibold">{selection.length} elementos seleccionados</p>
          <p className="text-xs text-muted-foreground">
            Arrastrá en el canvas para moverlos juntos, duplicalos con Ctrl+D o eliminalos con Supr.
          </p>
          <AskAiButton />
        </div>
      ) : (
        <ScreenInspector doc={doc} screen={screen} />
      )}
    </aside>
  );
}
