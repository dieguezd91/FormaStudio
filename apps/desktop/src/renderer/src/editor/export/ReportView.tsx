import type { FormaScreen } from '@forma/design-core';
import type { BundleDiff, CompatibilityReport, CompatibilityStatus } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { REMOVED_NODES_NOTE, describeDiff, describeSubject, groupReport } from './logic';

const STATUS_TONE: Record<CompatibilityStatus, 'success' | 'primary' | 'neutral' | 'danger'> = {
  supported: 'success',
  adapted: 'primary',
  approximate: 'neutral',
  unavailable: 'danger',
};

function BulletList({ title, items, testId }: { title: string; items: string[]; testId: string }) {
  return (
    <section data-testid={testId} className="rounded-lg border border-border bg-card p-3">
      <h4 className="mb-1.5 text-sm font-semibold">{title}</h4>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nada para mostrar.</p>
      ) : (
        <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The compatibility report grouped by status, plus what the developer receives and must connect. */
export function ReportView({
  report,
  screen,
}: {
  report: CompatibilityReport;
  screen: FormaScreen | undefined;
}) {
  const groups = groupReport(report);
  return (
    <div data-testid="export-report" className="space-y-3">
      <div className="space-y-2">
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">El informe no tiene observaciones.</p>
        ) : (
          groups.map((group) => (
            <section
              key={group.status}
              data-testid="report-group"
              data-status={group.status}
              className="rounded-lg border border-border bg-card"
            >
              <h4 className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm font-semibold">
                <Badge tone={STATUS_TONE[group.status]}>{group.label}</Badge>
                <span className="text-xs font-normal text-muted-foreground">
                  {group.items.length} {group.items.length === 1 ? 'elemento' : 'elementos'}
                </span>
              </h4>
              <ul className="divide-y divide-border">
                {group.items.map((item, i) => (
                  <li key={i} data-testid="report-item" className="space-y-0.5 px-3 py-2 text-xs">
                    <p className="font-medium">{describeSubject(item, screen)}</p>
                    <p className="text-muted-foreground">{item.impact}</p>
                    <p>
                      <span className="font-medium">Qué hacer: </span>
                      <span className="text-muted-foreground">{item.action}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <BulletList
          title="Qué vas a recibir"
          items={report.summary.youWillReceive}
          testId="summary-receive"
        />
        <BulletList
          title="Qué tenés que conectar"
          items={report.summary.youMustConnect}
          testId="summary-connect"
        />
      </div>
    </div>
  );
}

/** What re-exporting would change versus the previous export of the screen. */
export function DiffView({
  diff,
  screen,
  className,
}: {
  diff: BundleDiff;
  screen: FormaScreen | undefined;
  className?: string;
}) {
  const view = describeDiff(diff, (id) => screen?.nodes[id]?.name);
  return (
    <section
      data-testid="export-diff"
      className={cn('rounded-lg border border-border bg-card p-3', className)}
    >
      <h4 className="mb-1.5 text-sm font-semibold">Cambios respecto de la última exportación</h4>
      {view.isEmpty ? (
        <p className="text-xs text-muted-foreground">
          No hay cambios en las propiedades que gestiona Forma.
        </p>
      ) : (
        <div className="space-y-2">
          {view.sections.map((section) => (
            <div key={section.key} data-testid={`diff-${section.key}`} className="text-xs">
              <p className="font-medium">
                {section.label} ({section.lines.length})
              </p>
              <ul className="list-disc pl-4 text-muted-foreground">
                {section.lines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          ))}
          {diff.removed.length > 0 ? (
            <p data-testid="diff-removed-note" className="text-xs text-muted-foreground">
              {REMOVED_NODES_NOTE}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
