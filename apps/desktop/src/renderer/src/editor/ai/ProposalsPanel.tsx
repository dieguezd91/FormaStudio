import { useEffect, useState } from 'react';
import { Columns2, Loader2, Play, Sparkles, Undo2, X } from 'lucide-react';
import type { ProposalMeta, ProposalStatus } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useEditor } from '../store';
import { AiUnavailable, WarningList } from './AiUnavailable';
import { CompareDialog } from './CompareDialog';
import { ProposalPlayDialog } from './ProposalPlayDialog';
import { ProposalThumbnail } from './ProposalThumbnail';
import { aiStore, useAi } from './store';

const STATUS_LABEL: Record<ProposalStatus, string> = {
  candidate: 'Candidata',
  adopted: 'Adoptada',
  discarded: 'Descartada',
};
const STATUS_TONE: Record<ProposalStatus, 'neutral' | 'success' | 'danger'> = {
  candidate: 'neutral',
  adopted: 'success',
  discarded: 'danger',
};

const NEW_SCREEN = '';
const MAX_COMPARE = 3;

function Rationale({ proposal }: { proposal: ProposalMeta }) {
  const requirements = useAi((state) => state.requirements);
  const sources = useAi((state) => state.sources);
  const { need, patterns, tradeoffs, fromReferences, requirementIds } = proposal.rationale;
  // Ids the service no longer knows (e.g. requirements re-extracted since) are shown as-is.
  const requirementText = (id: string) => requirements.find((r) => r.id === id)?.text ?? id;
  const referenceTitle = (id: string) => sources.find((s) => s.id === id)?.title ?? id;
  const rows: [string, string[]][] = [
    ['Patrones', patterns],
    ['Compromisos', tradeoffs],
    ['De referencias', fromReferences.map(referenceTitle)],
    ['Requisitos vinculados', requirementIds.map(requirementText)],
  ];
  return (
    <details data-testid="rationale" className="text-xs">
      <summary className="cursor-pointer text-muted-foreground">Ver fundamentos</summary>
      <dl className="mt-1.5 space-y-1.5">
        <div>
          <dt className="font-medium">Necesidad</dt>
          <dd className="text-muted-foreground">{need || '—'}</dd>
        </div>
        {rows.map(([label, items]) => (
          <div key={label}>
            <dt className="font-medium">{label}</dt>
            <dd className="text-muted-foreground">
              {items.length === 0 ? (
                '—'
              ) : (
                <ul className="list-disc pl-4">
                  {items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

interface CardProps {
  proposal: ProposalMeta;
  selected: boolean;
  canSelect: boolean;
  onToggleCompare: () => void;
  onAdopt: () => void;
  onPlay: () => void;
}

function ProposalCard({ proposal, selected, canSelect, onToggleCompare, onAdopt, onPlay }: CardProps) {
  const document = useAi((state) => state.documents[proposal.id]);
  const warnings = useAi((state) => state.proposalWarnings).filter((w) => w.proposalId === proposal.id);
  const discarded = proposal.status === 'discarded';

  useEffect(() => {
    void aiStore.getState().loadDocument(proposal.id);
  }, [proposal.id]);

  return (
    <li
      data-testid="proposal-card"
      data-status={proposal.status}
      data-title={proposal.title}
      className={cn('space-y-2 rounded-lg border border-border p-2', discarded && 'opacity-70')}
    >
      <ProposalThumbnail document={document} width={270} />
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold">{proposal.title}</p>
        <Badge tone={STATUS_TONE[proposal.status]} className="shrink-0">
          {STATUS_LABEL[proposal.status]}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{proposal.summary}</p>
      <Rationale proposal={proposal} />
      <WarningList warnings={warnings} testId="proposal-warnings" />
      <label className="flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          aria-label={`Comparar ${proposal.title}`}
          checked={selected}
          disabled={!selected && !canSelect}
          onChange={onToggleCompare}
        />
        Comparar
      </label>
      <div className="flex flex-wrap gap-1.5">
        {proposal.status !== 'adopted' && !discarded ? (
          <Button size="sm" onClick={onAdopt}>
            Adoptar
          </Button>
        ) : null}
        <Button size="sm" variant="secondary" onClick={onPlay}>
          <Play size={13} /> Probar
        </Button>
        {discarded ? (
          <Button size="sm" variant="ghost" onClick={() => void aiStore.getState().setProposalStatus(proposal.id, 'candidate')}>
            <Undo2 size={13} /> Recuperar
          </Button>
        ) : proposal.status === 'candidate' ? (
          <Button size="sm" variant="ghost" onClick={() => void aiStore.getState().setProposalStatus(proposal.id, 'discarded')}>
            Descartar
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function AdoptDialog({ proposal, onClose }: { proposal: ProposalMeta; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    const adopted = await aiStore.getState().adopt(proposal);
    setBusy(false);
    if (adopted) onClose();
  };
  return (
    <Dialog open onClose={onClose} title={`Adoptar «${proposal.title}»`}>
      <div className="space-y-4" data-testid="adopt-dialog">
        <p className="text-sm">
          Esto <strong>reemplaza el documento actual</strong> por esta propuesta. No se puede deshacer con Ctrl+Z: para
          volver atrás vas a usar <strong>Versiones</strong>. Antes de reemplazar guardamos tu estado actual como la
          versión «Antes de adoptar {proposal.title}».
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="destructive" disabled={busy} onClick={() => void confirm()}>
            {busy ? 'Adoptando…' : 'Sí, adoptar'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function ProposalsPanel() {
  const doc = useEditor((state) => state.doc);
  const activeScreenId = useEditor((state) => state.activeScreenId);
  const proposals = useAi((state) => state.proposals);
  const busy = useAi((state) => state.proposalsBusy);
  const error = useAi((state) => state.proposalsError);
  const unavailable = useAi((state) => state.availability === 'unavailable');
  const warnings = useAi((state) => state.proposalWarnings).filter((w) => w.proposalId === undefined);

  const [brief, setBrief] = useState('');
  const [count, setCount] = useState(3);
  const [target, setTarget] = useState<string | null>(null);
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [adopting, setAdopting] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  const screenId = target ?? activeScreenId ?? NEW_SCREEN;
  const visible = proposals.filter((p) => (p.status === 'discarded') === showDiscarded);
  const discardedCount = proposals.filter((p) => p.status === 'discarded').length;
  const compared = compareIds.flatMap((id) => proposals.find((p) => p.id === id && p.status !== 'discarded') ?? []);
  const adoptingProposal = proposals.find((p) => p.id === adopting);
  const playingProposal = proposals.find((p) => p.id === playing);

  const toggleCompare = (id: string) =>
    setCompareIds((previous) =>
      previous.includes(id) ? previous.filter((other) => other !== id) : [...previous, id].slice(0, MAX_COMPARE),
    );

  return (
    <div className="space-y-3 p-3" data-testid="proposals-panel">
      <p className="text-xs text-muted-foreground">
        La IA propone alternativas estructuralmente distintas, apoyadas en tus requisitos y referencias. Podés
        compararlas, probarlas sin adoptar y quedarte con una.
      </p>

      <form
        className="space-y-2 rounded-lg border border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void aiStore.getState().generate({
            count,
            ...(brief.trim() ? { brief: brief.trim() } : {}),
            ...(screenId === NEW_SCREEN ? {} : { screenId }),
          });
        }}
      >
        <Textarea
          aria-label="Indicaciones (opcional)"
          placeholder="Indicaciones opcionales: por ejemplo, «priorizá el uso con mando»"
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
        />
        <label className="grid grid-cols-[88px_1fr] items-center gap-2 text-[13px]">
          <span className="text-muted-foreground">Cantidad</span>
          <Input
            type="number"
            min={1}
            max={5}
            aria-label="Cantidad de propuestas"
            value={count}
            onChange={(event) => setCount(Math.min(5, Math.max(1, Math.round(Number(event.target.value) || 1))))}
          />
        </label>
        <label className="grid grid-cols-[88px_1fr] items-center gap-2 text-[13px]">
          <span className="text-muted-foreground">Pantalla</span>
          <Select aria-label="Pantalla destino" value={screenId} onChange={(event) => setTarget(event.target.value)}>
            {doc?.screens.map((screen) => (
              <option key={screen.id} value={screen.id}>
                Reemplazar «{screen.name}»
              </option>
            ))}
            <option value={NEW_SCREEN}>Pantalla nueva</option>
          </Select>
        </label>
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {busy ? 'Generando…' : 'Generar propuestas'}
          </Button>
          {busy ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => aiStore.getState().cancelGeneration()}>
              <X size={14} /> Cancelar
            </Button>
          ) : null}
        </div>
      </form>

      <AiUnavailable />
      {error && !unavailable ? (
        <p role="alert" data-testid="proposals-error" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <WarningList warnings={warnings} testId="proposals-warnings" />

      {proposals.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div role="radiogroup" aria-label="Filtro de propuestas" className="flex gap-1">
            <Button
              role="radio"
              aria-checked={!showDiscarded}
              size="sm"
              variant={showDiscarded ? 'ghost' : 'secondary'}
              onClick={() => setShowDiscarded(false)}
            >
              Activas
            </Button>
            <Button
              role="radio"
              aria-checked={showDiscarded}
              size="sm"
              variant={showDiscarded ? 'secondary' : 'ghost'}
              onClick={() => setShowDiscarded(true)}
            >
              Descartadas ({discardedCount})
            </Button>
          </div>
          <Button size="sm" variant="outline" disabled={compared.length < 2} onClick={() => setComparing(true)}>
            <Columns2 size={14} /> Comparar ({compared.length})
          </Button>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {proposals.length === 0
            ? 'Todavía no hay propuestas.'
            : showDiscarded
              ? 'No hay propuestas descartadas.'
              : 'No quedan propuestas activas: recuperá alguna descartada o generá nuevas.'}
        </p>
      ) : (
        <ul className="space-y-3" aria-label="Propuestas">
          {visible.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              selected={compareIds.includes(proposal.id)}
              canSelect={compareIds.length < MAX_COMPARE}
              onToggleCompare={() => toggleCompare(proposal.id)}
              onAdopt={() => setAdopting(proposal.id)}
              onPlay={() => {
                void aiStore.getState().loadDocument(proposal.id);
                setPlaying(proposal.id);
              }}
            />
          ))}
        </ul>
      )}

      {comparing && compared.length >= 2 ? <CompareDialog proposals={compared} onClose={() => setComparing(false)} /> : null}
      {adoptingProposal ? <AdoptDialog proposal={adoptingProposal} onClose={() => setAdopting(null)} /> : null}
      {playingProposal ? <ProposalPlayDialog proposal={playingProposal} onClose={() => setPlaying(null)} /> : null}
    </div>
  );
}
