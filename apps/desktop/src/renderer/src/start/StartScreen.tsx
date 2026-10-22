import { useEffect, useState } from 'react';
import { FolderOpen, LayoutTemplate, PencilRuler, Sparkles } from 'lucide-react';
import { api, isApiError, type Project } from '@/api';
import { AiEnableDialog } from '@/app/AiEnableDialog';
import { retryAiStatus, useAiGate } from '@/app/useAiGate';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { ExploreTab } from '@/editor/store';

export type StartIntent = 'scratch' | 'template' | 'ai';

export interface OpenOptions {
  tab: ExploreTab;
  /** Show the guided AI strip (adjuntar → analizar → generar). */
  guide: boolean;
}

const INTENTS: Record<
  StartIntent,
  { title: string; body: string; open: OpenOptions; icon: typeof Sparkles; variant: 'default' | 'secondary' | 'outline' }
> = {
  ai: {
    title: 'Crear con IA',
    body: 'Subí tu documentación y tus referencias: la IA extrae los requisitos y propone alternativas que podés comparar, probar y adoptar. Necesita una clave de Gemini en el servicio local; sin ella seguís trabajando a mano.',
    open: { tab: 'references', guide: true },
    icon: Sparkles,
    variant: 'default',
  },
  template: {
    title: 'Usar plantilla',
    body: 'Elegí una solución lista según la función que necesitás, por ejemplo un inventario con pestañas, y editala a tu gusto.',
    open: { tab: 'library', guide: false },
    icon: LayoutTemplate,
    variant: 'secondary',
  },
  scratch: {
    title: 'Empezar desde cero',
    body: 'Una pantalla vacía de 1920 × 1080 para armar tu interfaz paso a paso.',
    open: { tab: 'layers', guide: false },
    icon: PencilRuler,
    variant: 'outline',
  },
};

const ORDER: StartIntent[] = ['ai', 'template', 'scratch'];
/** Without AI the other two entries lead and the AI card steps back. */
const ORDER_WITHOUT_AI: StartIntent[] = ['template', 'scratch', 'ai'];
const VARIANT_WITHOUT_AI: Partial<Record<StartIntent, 'default' | 'secondary'>> = { template: 'default', scratch: 'secondary' };
const DEFAULT_NAME = 'Nuevo proyecto';

interface StartScreenProps {
  serviceUp: boolean;
  onOpen: (project: Project, options: OpenOptions) => void;
}

export function StartScreen({ serviceUp, onOpen }: StartScreenProps) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [intent, setIntent] = useState<StartIntent | null>(null);
  const [name, setName] = useState(DEFAULT_NAME);
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const gate = useAiGate();

  useEffect(() => {
    if (!serviceUp) return;
    let current = true;
    void api.listProjects().then(
      (list) => {
        if (!current) return;
        setProjects([...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
        setListError(null);
      },
      (error: unknown) => {
        if (current) setListError(isApiError(error) ? error.message : 'No se pudieron cargar los proyectos.');
      },
    );
    return () => {
      current = false;
    };
  }, [serviceUp]);

  const close = () => {
    setIntent(null);
    setCreateError(null);
    setBusy(false);
  };

  const create = async () => {
    if (!intent || busy) return;
    const trimmed = name.trim() || DEFAULT_NAME;
    setBusy(true);
    setCreateError(null);
    try {
      const project = await api.createProject(trimmed);
      onOpen(project, INTENTS[intent].open);
    } catch (error) {
      setCreateError(isApiError(error) ? error.message : 'No se pudo crear el proyecto.');
      setBusy(false);
    }
  };

  const startWith = (next: StartIntent) => {
    setName(DEFAULT_NAME);
    setIntent(next);
  };

  return (
    <main className="mx-auto flex h-full max-w-4xl flex-col gap-10 overflow-y-auto px-6 py-12" data-testid="start-screen">
      <header className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Forma Studio</h1>
        <p className="mt-2 text-muted-foreground">¿Cómo querés empezar?</p>
      </header>

      <section aria-label="Cómo empezar" className="grid gap-4 sm:grid-cols-3">
        {(gate.usable ? ORDER : ORDER_WITHOUT_AI).map((key) => {
          const { title, body, icon: Icon, variant: baseVariant } = INTENTS[key];
          const variant = (!gate.usable && VARIANT_WITHOUT_AI[key]) || baseVariant;
          if (key === 'ai' && !gate.usable) {
            return (
              <div
                key={key}
                data-testid="ai-unavailable-card"
                className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-5 text-left"
              >
                <span className="flex items-center gap-2 text-base font-semibold text-muted-foreground">
                  <Icon size={18} /> Crear con IA (no disponible)
                </span>
                <span className="text-[13px] text-muted-foreground">{gate.summary}</span>
                <span className="flex gap-3 text-[13px]">
                  {gate.state !== 'unknown' ? (
                    <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => setHelpOpen(true)}>
                      Cómo habilitarla
                    </button>
                  ) : null}
                  <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => void retryAiStatus()}>
                    Reintentar
                  </button>
                </span>
              </div>
            );
          }
          return (
            <Button
              key={key}
              variant={variant}
              disabled={!serviceUp}
              onClick={() => startWith(key)}
              className="h-auto flex-col items-start gap-2 whitespace-normal p-5 text-left"
            >
              <span className="flex items-center gap-2 text-base font-semibold">
                <Icon size={18} /> {title}
              </span>
              <span className="text-[13px] font-normal opacity-80">{body}</span>
            </Button>
          );
        })}
      </section>

      <section aria-label="Proyectos recientes" className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <FolderOpen size={15} /> Proyectos recientes
        </h2>
        {listError ? <p className="text-sm text-destructive">{listError}</p> : null}
        {projects && projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no tenés proyectos. Elegí una de las opciones de arriba.</p>
        ) : null}
        <ul className="grid gap-2">
          {(projects ?? []).map((project) => (
            <li key={project.id}>
              <button
                type="button"
                data-testid="recent-project"
                onClick={() => onOpen(project, { tab: 'layers', guide: false })}
                className="flex w-full items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-accent"
              >
                <span className="truncate font-medium">{project.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  Editado {new Date(project.updatedAt).toLocaleString('es')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <AiEnableDialog open={helpOpen} onClose={() => setHelpOpen(false)} />

      <Dialog
        open={intent !== null}
        onClose={close}
        title={intent ? INTENTS[intent].title : ''}
        description="Ponele un nombre a tu proyecto. Después podés cambiar todo."
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <label className="block space-y-1.5 text-sm">
            <span className="text-muted-foreground">Nombre del proyecto</span>
            <Input
              autoFocus
              aria-label="Nombre del proyecto"
              value={name}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {createError ? <p className="text-sm text-destructive">{createError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Creando…' : 'Crear proyecto'}
            </Button>
          </div>
        </form>
      </Dialog>
    </main>
  );
}
