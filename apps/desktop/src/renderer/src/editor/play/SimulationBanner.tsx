import { useMemo } from 'react';
import { FlaskConical } from 'lucide-react';
import type { Connection, FormaDocument } from '@forma/design-core';
import { describeSimulation, type SimulationEntry } from '@forma/runtime';
import { Badge } from '@/components/ui/badge';
import { intentLabel } from './activity';

const TONES: Record<Connection, 'primary' | 'neutral' | 'success'> = {
  simulated: 'primary',
  unconnected: 'neutral',
  connected: 'success',
};

function EntryBadge({ entry, label }: { entry: SimulationEntry; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs" data-testid="simulation-entry" data-connection={entry.connection}>
      <span className="text-muted-foreground">{label}</span>
      <Badge tone={TONES[entry.connection]}>{entry.label}</Badge>
    </span>
  );
}

/**
 * Persistent honesty notice (design doc §3.7 / §9.5): what the user sees and does in Probar is
 * not the real game, and each source / intent says how connected it really is.
 */
export function SimulationBanner({ doc, screenId }: { doc: FormaDocument; screenId: string }) {
  const description = useMemo(() => describeSimulation(doc, screenId), [doc, screenId]);
  return (
    <div role="note" data-testid="play-banner" className="shrink-0 border-b border-border bg-primary/10 px-4 py-2">
      <p className="flex items-center gap-2 text-sm font-medium">
        <FlaskConical size={16} className="shrink-0 text-primary" />
        {description.allConnected
          ? 'Prototipo con datos de ejemplo — el documento marca todo como conectado, pero Probar no habla con el juego'
          : 'Prototipo con datos simulados — las acciones no están conectadas al juego'}
      </p>
      {description.dataSources.length > 0 || description.intents.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1" data-testid="simulation-badges">
          {description.dataSources.map((entry) => (
            <EntryBadge key={`data-${entry.id}`} entry={entry} label={`Datos · ${entry.name}`} />
          ))}
          {description.intents.map((entry) => (
            <EntryBadge key={`intent-${entry.id}`} entry={entry} label={`Acción · ${intentLabel(entry.name)}`} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
