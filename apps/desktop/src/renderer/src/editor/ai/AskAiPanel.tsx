import { useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import { useAiGate } from '@/app/useAiGate';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { useEditor, useUi } from '../store';
import { AiUnavailable, WarningList } from './AiUnavailable';
import { isPreviewStale } from './logic';
import { aiStore, useAi } from './store';

/** "Afecta: …" line shared by the request box and the preview. */
export function scopeLabel(selectedCount: number): string {
  if (selectedCount === 0) return 'Afecta: pantalla completa';
  return `Afecta: ${selectedCount} ${selectedCount === 1 ? 'elemento seleccionado' : 'elementos seleccionados'}`;
}

function Preview() {
  const edit = useAi((state) => state.edit);
  const revision = useEditor((state) => state.revision);
  const pending = useEditor((state) => state.pending);
  if (edit.phase !== 'preview') return null;
  const { preview, request, refreshed } = edit;
  const stale = isPreviewStale(preview, { revision, pending });
  return (
    <section aria-label="Vista previa" data-testid="edit-preview" className="space-y-2 border-t border-border pt-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vista previa del cambio</h3>
      <p className="text-xs text-muted-foreground" data-testid="edit-scope">
        {scopeLabel(request.selectedNodeIds.length)}
      </p>
      {preview.explanation ? <p className="text-[13px]" data-testid="edit-explanation">{preview.explanation}</p> : null}
      {preview.changes.length > 0 ? (
        <ul data-testid="edit-changes" aria-label="Cambios" className="list-disc space-y-0.5 pl-4 text-xs">
          {preview.changes.map((change, i) => (
            <li key={i}>{change}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">La IA no propone ningún cambio.</p>
      )}
      <WarningList warnings={preview.warnings} testId="edit-warnings" />
      {refreshed ? (
        <p role="status" data-testid="edit-refreshed" className="text-xs text-primary">
          El documento cambió desde la vista previa anterior; pedimos una nueva. Revisala antes de aplicar.
        </p>
      ) : null}
      {stale ? (
        <p role="status" data-testid="edit-stale" className="text-xs text-primary">
          El documento cambió desde esta vista previa. Al aplicar vamos a pedir una nueva en lugar de aplicarla a ciegas.
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button size="sm" disabled={preview.batch.ops.length === 0} onClick={() => void aiStore.getState().applyEdit()}>
          {stale ? 'Actualizar vista previa' : 'Aplicar'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => aiStore.getState().discardEdit()}>
          Descartar
        </Button>
      </div>
    </section>
  );
}

/** Compact command box for "Pedir a la IA", scoped to the current selection (design doc §3.5). */
export function AskAiPanel() {
  const open = useUi((state) => state.askOpen);
  const setOpen = useUi((state) => state.setAskOpen);
  const selection = useEditor((state) => state.selection);
  const proposals = useAi((state) => state.proposals).filter((p) => p.status !== 'discarded');
  const edit = useAi((state) => state.edit);
  const gate = useAiGate();
  const unavailable = !gate.usable;
  const [instruction, setInstruction] = useState('');
  const [combine, setCombine] = useState<string[]>([]);

  if (!open) return null;
  const loading = edit.phase === 'loading';
  const hasPreview = edit.phase === 'preview';

  return (
    <aside
      aria-label="Pedir a la IA"
      data-testid="ask-ai"
      className="fixed right-4 top-14 z-[85] max-h-[calc(100vh-5rem)] w-[26rem] space-y-3 overflow-y-auto rounded-xl border border-border bg-popover p-3 shadow-2xl"
    >
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles size={14} className="text-primary" /> Pedir a la IA
        </h2>
        <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Cerrar" onClick={() => setOpen(false)}>
          <X size={14} />
        </Button>
      </div>

      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (instruction.trim() === '' || loading || !gate.usable) return;
          void aiStore.getState().requestEdit(instruction.trim(), combine);
        }}
      >
        <p className="text-xs text-muted-foreground" data-testid="ask-scope">
          {scopeLabel(selection.length)}
        </p>
        <Textarea
          aria-label="Qué querés cambiar"
          placeholder="Por ejemplo: «agregá un botón de ordenar arriba de la grilla»"
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
        />
        {proposals.length > 0 ? (
          <fieldset className="space-y-1">
            <legend className="mb-1 text-xs text-muted-foreground">Combinar con propuestas (opcional)</legend>
            {proposals.map((proposal) => (
              <label key={proposal.id} className="flex items-center gap-1.5 text-[13px]">
                <input
                  type="checkbox"
                  checked={combine.includes(proposal.id)}
                  disabled={!combine.includes(proposal.id) && combine.length >= 5}
                  onChange={(event) =>
                    setCombine(event.target.checked ? [...combine, proposal.id] : combine.filter((id) => id !== proposal.id))
                  }
                />
                <span className="truncate">{proposal.title}</span>
              </label>
            ))}
          </fieldset>
        ) : null}
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={!gate.usable || loading || instruction.trim() === ''}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            {loading ? 'Pensando…' : hasPreview ? 'Pedir de nuevo' : 'Ver cambios'}
          </Button>
          {loading ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => aiStore.getState().cancelEdit()}>
              Cancelar
            </Button>
          ) : null}
        </div>
      </form>

      <AiUnavailable />
      {edit.phase === 'error' && !unavailable ? (
        <p role="alert" data-testid="edit-error" className="text-xs text-destructive">
          {edit.message}
        </p>
      ) : null}
      <Preview />
    </aside>
  );
}
