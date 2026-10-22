import { Check, Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useUi, type ExploreTab } from '../store';
import { guideSteps, summarizeImpact, type GuideStepId } from './logic';
import { aiStore, useAi } from './store';

const STEP_TAB: Record<GuideStepId, ExploreTab> = {
  sources: 'references',
  requirements: 'requirements',
  proposals: 'proposals',
};

/** The "Crear con IA" strip: attach → analyze → generate, each unlocked by the previous one. */
export function AiGuide() {
  const visible = useUi((state) => state.guide);
  const setGuide = useUi((state) => state.setGuide);
  const setTab = useUi((state) => state.setExploreTab);
  const sources = useAi((state) => state.sources.length);
  const requirements = useAi((state) => state.requirements.length);
  const proposals = useAi((state) => state.proposals.filter((p) => p.status !== 'discarded').length);
  const available = useAi((state) => state.availability);
  if (!visible) return null;

  const steps = guideSteps({ sources, requirements, proposals });
  return (
    <div data-testid="ai-guide" className="border-b border-border bg-primary/10 px-4 py-2">
      <div className="flex items-center gap-3">
        <ol className="flex flex-1 flex-wrap items-center gap-2" aria-label="Pasos para crear con IA">
          {steps.map((step, i) => (
            <li key={step.id}>
              <button
                type="button"
                data-testid={`guide-step-${step.id}`}
                data-done={step.done}
                disabled={!step.enabled}
                onClick={() => setTab(STEP_TAB[step.id])}
                className={cn(
                  'flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-sm transition-colors',
                  step.enabled ? 'hover:bg-accent' : 'cursor-not-allowed opacity-50',
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold',
                    step.done ? 'bg-success text-background' : 'bg-primary/30',
                  )}
                >
                  {step.done ? <Check size={12} /> : i + 1}
                </span>
                {step.label}
              </button>
            </li>
          ))}
        </ol>
        <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Cerrar guía" onClick={() => setGuide(false)}>
          <X size={14} />
        </Button>
      </div>
      {available !== 'available' ? (
        <p className="mt-1.5 text-xs text-muted-foreground" data-testid="guide-ai-note">
          {available === 'unavailable'
            ? 'La IA no está disponible en este servicio (falta la clave de Gemini). Podés subir tu documentación y diseñar a mano.'
            : 'La IA necesita una clave de Gemini en el servicio local. Si falta, te lo avisamos y podés seguir a mano.'}
        </p>
      ) : null}
    </div>
  );
}

/** Non-blocking note after sources changed: what may be outdated. Nothing is regenerated for the user. */
export function ImpactNotice() {
  const impacts = useAi((state) => state.impacts);
  const setTab = useUi((state) => state.setExploreTab);
  const summary = summarizeImpact(impacts);
  if (!summary) return null;
  return (
    <div data-testid="impact-notice" role="status" className="flex items-start gap-2 border-b border-border bg-primary/10 px-4 py-2 text-sm">
      <Info size={16} className="mt-0.5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 space-y-1">
        <p>
          <strong>Cambiaron tus fuentes.</strong> Estas partes de tu proyecto podrían verse afectadas; no regeneramos
          nada por tu cuenta.
        </p>
        {summary.requirements.length > 0 ? (
          <p className="text-xs" data-testid="impact-requirements">
            Requisitos: {summary.requirements.map((r) => `«${r.text}»`).join(', ')}
          </p>
        ) : null}
        {summary.proposals.length > 0 ? (
          <p className="text-xs" data-testid="impact-proposals">
            Propuestas: {summary.proposals.map((p) => `«${p.title}»`).join(', ')}
          </p>
        ) : null}
      </div>
      <Button variant="outline" size="sm" onClick={() => setTab('requirements')}>
        Revisar requisitos
      </Button>
      <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Cerrar aviso de cambios" onClick={() => aiStore.getState().dismissImpact()}>
        <X size={14} />
      </Button>
    </div>
  );
}
