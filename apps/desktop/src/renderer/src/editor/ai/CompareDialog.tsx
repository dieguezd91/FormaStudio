import { useEffect, useMemo } from 'react';
import { Check, Minus } from 'lucide-react';
import type { ProposalMeta } from '@/api/types';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { compareProposals, type ComparisonRow } from './logic';
import { ProposalThumbnail } from './ProposalThumbnail';
import { aiStore, useAi } from './store';

const GROUPS: { kind: ComparisonRow['kind']; title: string }[] = [
  { kind: 'entry', title: 'Componentes de la biblioteca' },
  { kind: 'behavior', title: 'Comportamientos' },
  { kind: 'nodeType', title: 'Tipos de elemento' },
];

/** Side-by-side previews plus a structural diff of 2–3 proposals (design doc §6.5). */
export function CompareDialog({ proposals, onClose }: { proposals: ProposalMeta[]; onClose: () => void }) {
  const documents = useAi((state) => state.documents);
  const ids = proposals.map((proposal) => proposal.id).join(',');

  useEffect(() => {
    for (const id of ids.split(',')) if (id) void aiStore.getState().loadDocument(id);
  }, [ids]);

  const ready = proposals.every((proposal) => documents[proposal.id] !== undefined);
  const comparison = useMemo(
    () =>
      ready
        ? compareProposals(proposals.map((p) => ({ id: p.id, title: p.title, document: documents[p.id]! })))
        : null,
    [ready, proposals, documents],
  );
  const grid = { gridTemplateColumns: `minmax(10rem, 1.2fr) repeat(${proposals.length}, minmax(0, 2fr))` };

  return (
    <Dialog
      open={proposals.length > 0}
      onClose={onClose}
      title="Comparar propuestas"
      description="Las diferencias aparecen primero; lo que todas comparten, al final."
      className="max-h-[90vh] max-w-5xl overflow-y-auto"
    >
      <div data-testid="compare-dialog" className="space-y-4">
        <div className="grid items-start gap-3" style={grid}>
          <span />
          {proposals.map((proposal) => (
            <div key={proposal.id} data-testid="compare-column" className="space-y-1.5">
              <p className="truncate text-sm font-semibold" title={proposal.title}>
                {proposal.title}
              </p>
              <ProposalThumbnail document={documents[proposal.id]} width={260} />
              <p className="text-[11px] text-muted-foreground">
                {comparison?.columns.find((c) => c.id === proposal.id)?.nodeCount ?? '…'} elementos
              </p>
            </div>
          ))}
        </div>

        {comparison ? (
          GROUPS.map(({ kind, title }) => {
            const rows = comparison.rows.filter((row) => row.kind === kind);
            if (rows.length === 0) return null;
            return (
              <section key={kind} aria-label={title} data-testid={`compare-${kind}`} className="space-y-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {rows.map((row) => (
                    <li
                      key={row.key}
                      data-testid="compare-row"
                      data-key={row.key}
                      data-shared={row.shared}
                      className={cn('grid items-center gap-3 px-3 py-1.5 text-[13px]', !row.shared && 'bg-primary/10')}
                      style={grid}
                    >
                      <span>{row.label}</span>
                      {row.present.map((present, i) => (
                        <span
                          key={comparison.columns[i]?.id}
                          data-present={present}
                          className={cn('flex items-center gap-1.5', !present && 'text-muted-foreground')}
                        >
                          {present ? <Check size={14} className="text-success" /> : <Minus size={14} />}
                          {kind === 'nodeType' ? <span className="tabular-nums">{row.counts[i]}</span> : null}
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        ) : (
          <p className="text-sm text-muted-foreground">Cargando propuestas…</p>
        )}
      </div>
    </Dialog>
  );
}
