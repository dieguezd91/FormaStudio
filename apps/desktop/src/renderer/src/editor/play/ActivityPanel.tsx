import { useState, useSyncExternalStore } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import type { FormaScreen } from '@forma/design-core';
import type { Runtime, RuntimeEvent } from '@forma/runtime';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { handledByLabel, intentLabel, newestFirst, outcomeLabel, summarizePayload } from './activity';

const time = (at: number) =>
  new Date(at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function ActivityRow({ event, screen }: { event: RuntimeEvent; screen: FormaScreen }) {
  const summary = summarizePayload(event.payload, (value) =>
    Object.hasOwn(screen.nodes, value) ? screen.nodes[value]?.name : undefined,
  );
  const applied = event.outcome === 'applied';
  return (
    <li
      data-testid="activity-event"
      data-intent={event.name}
      data-outcome={event.outcome}
      data-handled-by={event.handledBy}
      className="space-y-1 border-b border-border px-3 py-2 text-xs"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{intentLabel(event.name)}</span>
        <span className="tabular-nums text-muted-foreground">{time(event.at)}</span>
      </div>
      {summary ? <p className="break-words text-muted-foreground">{summary}</p> : null}
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={event.handledBy === 'none' ? 'danger' : 'primary'}>{handledByLabel(event.handledBy)}</Badge>
        <Badge tone={applied ? 'success' : 'danger'}>{outcomeLabel(event.outcome)}</Badge>
      </div>
      {event.reason ? <p className="text-destructive">{event.reason}</p> : null}
    </li>
  );
}

/** Live list of what the prototype asked the "game" to do and how that went (newest first). */
export function ActivityPanel({ runtime, screen }: { runtime: Runtime; screen: FormaScreen }) {
  const state = useSyncExternalStore(runtime.subscribe, runtime.getState);
  // "Limpiar registro" only hides the entries logged so far; it is tied to the runtime it was clicked on.
  const [cleared, setCleared] = useState({ runtime, count: 0 });
  const hidden = cleared.runtime === runtime ? cleared.count : 0;
  const events = newestFirst(state.log, hidden);

  return (
    <aside
      aria-label="Actividad"
      data-testid="activity-panel"
      className="flex w-80 shrink-0 flex-col border-l border-border bg-card"
    >
      <div className="flex items-center gap-2 border-b border-border p-3">
        <h2 className="flex-1 text-sm font-semibold">Actividad</h2>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            runtime.dispatch({ type: 'reset' });
            setCleared({ runtime, count: 0 });
          }}
        >
          <RotateCcw size={13} /> Reiniciar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={events.length === 0}
          onClick={() => setCleared({ runtime, count: state.log.length })}
        >
          <Trash2 size={13} /> Limpiar registro
        </Button>
      </div>
      {events.length === 0 ? (
        <p className="p-3 text-xs text-muted-foreground" data-testid="activity-empty">
          Todavía no pasó nada. Arrastrá un objeto, hacé clic derecho sobre una casilla o usá las flechas y Enter.
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto" data-testid="activity-list">
          {events.map((event, i) => (
            <ActivityRow key={state.log.length - i} event={event} screen={screen} />
          ))}
        </ul>
      )}
    </aside>
  );
}
