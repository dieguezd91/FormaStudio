import { useState } from 'react';
import { Loader2, ScanSearch, X } from 'lucide-react';
import type { AiWarning, Requirement, RequirementStatus, SourceMeta } from '@/api/types';
import { useAiGate } from '@/app/useAiGate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { AiUnavailable, WarningList } from './AiUnavailable';
import { countByStatus, groupRequirements, STATUS_LABEL } from './logic';
import { aiStore, useAi } from './store';

const STATUS_TONE: Record<RequirementStatus, 'success' | 'neutral' | 'danger' | 'primary'> = {
  confirmed: 'success',
  assumed: 'neutral',
  contradiction: 'danger',
  gap: 'primary',
};

const STATUS_HINT: Record<RequirementStatus, string> = {
  confirmed: 'Dicho explícitamente en la documentación',
  assumed: 'Inferido por la IA: confirmalo antes de apoyarte en él',
  contradiction: 'Las fuentes dicen cosas incompatibles',
  gap: 'Falta información en la documentación',
};

function SourceRefs({ requirement, sources }: { requirement: Requirement; sources: SourceMeta[] }) {
  if (requirement.sourceRefs.length === 0) {
    return <p className="text-[11px] text-muted-foreground">Sin cita en las fuentes.</p>;
  }
  return (
    <ul className="space-y-1.5" aria-label="Fuentes">
      {requirement.sourceRefs.map((ref, i) => {
        const source = sources.find((candidate) => candidate.id === ref.sourceId);
        const changed = source !== undefined && source.sourceVersion > ref.sourceVersion;
        return (
          <li key={`${ref.sourceId}-${i}`} data-testid="source-ref" className="border-l-2 border-border pl-2">
            <p className="text-[11px] font-medium">
              {source?.title ?? 'Fuente eliminada'}
              <span className="font-normal text-muted-foreground"> · v{ref.sourceVersion}</span>
              {changed ? <span className="font-normal text-destructive"> · la fuente cambió</span> : null}
            </p>
            {ref.excerpt ? <blockquote className="text-[11px] italic text-muted-foreground">“{ref.excerpt}”</blockquote> : null}
          </li>
        );
      })}
    </ul>
  );
}

function RequirementItem({
  requirement,
  sources,
  warnings,
}: {
  requirement: Requirement;
  sources: SourceMeta[];
  warnings: AiWarning[];
}) {
  return (
    <li
      data-testid="requirement"
      data-status={requirement.status}
      className="space-y-1.5 rounded-lg border border-border p-2"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px]">{requirement.text}</p>
        <Badge tone={STATUS_TONE[requirement.status]} title={STATUS_HINT[requirement.status]} className="shrink-0">
          {STATUS_LABEL[requirement.status]}
        </Badge>
      </div>
      <SourceRefs requirement={requirement} sources={sources} />
      <WarningList warnings={warnings} testId="requirement-warnings" />
    </li>
  );
}

export function RequirementsPanel() {
  const sources = useAi((state) => state.sources);
  const requirements = useAi((state) => state.requirements);
  const warnings = useAi((state) => state.requirementWarnings);
  const busy = useAi((state) => state.requirementsBusy);
  const error = useAi((state) => state.requirementsError);
  const gate = useAiGate();
  const unavailable = !gate.usable;
  // Only what the user toggled is stored; everything else follows the default (project-wide sources).
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const isChecked = (source: SourceMeta) => overrides[source.id] ?? source.scope.level === 'project';
  const chosen = sources.filter(isChecked);
  const groups = groupRequirements(requirements);
  const counts = countByStatus(requirements);
  const requirementWarnings = (id: string) => warnings.filter((warning) => warning.requirementId === id);
  const general = warnings.filter((warning) => warning.requirementId === undefined);

  return (
    <div className="space-y-3 p-3" data-testid="requirements-panel">
      <p className="text-xs text-muted-foreground">
        La IA lee tus documentos e imágenes y extrae requisitos, cada uno con la cita de donde salió. Lo que no
        encuentra citado queda como supuesto.
      </p>

      {sources.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Primero agregá documentos o imágenes en la pestaña Referencias.
        </p>
      ) : (
        <fieldset className="space-y-1">
          <legend className="mb-1 text-xs text-muted-foreground">Fuentes a analizar</legend>
          {sources.map((source) => (
            <label key={source.id} className="flex items-center gap-1.5 text-[13px]">
              <input
                type="checkbox"
                checked={isChecked(source)}
                onChange={(event) => setOverrides({ ...overrides, [source.id]: event.target.checked })}
              />
              <span className="truncate" title={source.title}>
                {source.title}
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="flex items-center gap-2">
        <Tooltip label={gate.reason ?? 'Analizar documentación'} wrap={!gate.usable}>
          <Button
            size="sm"
            disabled={!gate.usable || busy || chosen.length === 0}
            onClick={() => void aiStore.getState().analyze(chosen.map((source) => source.id))}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <ScanSearch size={14} />}
            {busy ? 'Analizando…' : 'Analizar documentación'}
          </Button>
        </Tooltip>
        {busy ? (
          <Button variant="ghost" size="sm" onClick={() => aiStore.getState().cancelGeneration()}>
            <X size={14} /> Cancelar
          </Button>
        ) : null}
      </div>

      <AiUnavailable />
      {error && !unavailable ? (
        <p role="alert" data-testid="requirements-error" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <WarningList warnings={general} testId="requirements-warnings" />

      {requirements.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-1.5" data-testid="requirements-summary">
            {(Object.keys(counts) as RequirementStatus[]).map((status) => (
              <Badge key={status} tone={STATUS_TONE[status]}>
                {counts[status]} {STATUS_LABEL[status]}
              </Badge>
            ))}
          </div>
          {groups.map((group) => (
            <section key={group.kind} aria-label={group.label} data-kind={group.kind} className="space-y-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h3>
              <ul className="space-y-2">
                {group.requirements.map((requirement) => (
                  <RequirementItem
                    key={requirement.id}
                    requirement={requirement}
                    sources={sources}
                    warnings={requirementWarnings(requirement.id)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </>
      ) : !busy ? (
        <p className="text-sm text-muted-foreground">Todavía no se analizó la documentación.</p>
      ) : null}
    </div>
  );
}
