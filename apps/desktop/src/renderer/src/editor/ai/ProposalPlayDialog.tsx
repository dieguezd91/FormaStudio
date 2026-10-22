import { useMemo, useState } from 'react';
import { createRuntime } from '@forma/runtime';
import { X } from 'lucide-react';
import type { ProposalMeta } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { ActivityPanel } from '../play/ActivityPanel';
import { PlayStage } from '../play/PlayStage';
import { SimulationBanner } from '../play/SimulationBanner';
import { useAi } from './store';

/**
 * Probar for a proposal that is not adopted: its own document on a fresh runtime, in a full-window
 * layer. Nothing here touches the open document.
 */
export function ProposalPlayDialog({ proposal, onClose }: { proposal: ProposalMeta; onClose: () => void }) {
  const doc = useAi((state) => state.documents[proposal.id]);
  const [pickedScreen, setPickedScreen] = useState<string | null>(null);
  const screen = doc?.screens.find((s) => s.id === pickedScreen) ?? doc?.screens[0];
  const runtime = useMemo(() => (doc && screen ? createRuntime(doc, screen.id) : null), [doc, screen]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Probar propuesta ${proposal.title}`}
      data-testid="proposal-play"
      className="fixed inset-0 z-[100] flex flex-col bg-background"
    >
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
        <span className="truncate text-sm font-semibold">{proposal.title}</span>
        <Badge tone="primary">Propuesta sin adoptar</Badge>
        {doc && doc.screens.length > 1 ? (
          <Select
            aria-label="Pantalla de la propuesta"
            className="h-8 w-44"
            value={screen?.id ?? ''}
            onChange={(event) => setPickedScreen(event.target.value)}
          >
            {doc.screens.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        ) : null}
        <span className="flex-1" />
        <Button variant="outline" size="sm" onClick={onClose}>
          <X size={14} /> Cerrar
        </Button>
      </header>
      <div className="flex min-h-0 flex-1">
        {doc && screen && runtime ? (
          <>
            <main className="flex min-w-0 flex-1 flex-col" aria-label="Probar propuesta">
              <SimulationBanner doc={doc} screenId={screen.id} />
              <PlayStage doc={doc} screen={screen} runtime={runtime} />
            </main>
            <ActivityPanel runtime={runtime} screen={screen} />
          </>
        ) : (
          <p className="m-auto text-sm text-muted-foreground">Cargando propuesta…</p>
        )}
      </div>
    </div>
  );
}
