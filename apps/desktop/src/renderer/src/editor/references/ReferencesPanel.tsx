import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { FileText, Trash2, Upload } from 'lucide-react';
import { api, isApiError } from '@/api';
import type { NewSource, SourceIntent, SourceMeta, SourceScopeLevel } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { messageOf } from '../session';
import { useEditor } from '../store';
import { bytesToBase64, classifyFile, scopeFor } from './files';

const INTENTS: { id: SourceIntent; label: string }[] = [
  { id: 'structure', label: 'Estructura' },
  { id: 'interaction', label: 'Interacción' },
  { id: 'hierarchy', label: 'Jerarquía' },
  { id: 'visual-style', label: 'Estilo visual' },
  { id: 'inspiration', label: 'Inspiración' },
];

const SCOPE_LABEL = { project: 'Proyecto', screen: 'Pantalla', node: 'Elemento', proposal: 'Propuesta' } as const;

function useSources(projectId: string | null) {
  const [sources, setSources] = useState<SourceMeta[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!projectId) return;
    await api.listSources(projectId).then(
      (list) => {
        setSources(list);
        setError(null);
      },
      (e: unknown) => setError(messageOf(e)),
    );
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    let current = true;
    void api.listSources(projectId).then(
      (list) => {
        if (!current) return;
        setSources(list);
        setError(null);
      },
      (e: unknown) => current && setError(messageOf(e)),
    );
    return () => {
      current = false;
    };
  }, [projectId]);

  return { sources, error, reload };
}

function Thumbnail({ projectId, source }: { projectId: string; source: SourceMeta }) {
  if (source.mimeType.startsWith('image/') && source.hasBlob) {
    return (
      <img
        src={api.sourceBlobUrl(projectId, source.id)}
        alt={source.title}
        className="h-12 w-12 shrink-0 rounded object-cover"
      />
    );
  }
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
      <FileText size={20} />
    </span>
  );
}

function SourceRow({
  projectId,
  source,
  onDeleted,
}: {
  projectId: string;
  source: SourceMeta;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const notify = useEditor((state) => state.notify);
  const remove = async () => {
    try {
      await api.deleteSource(projectId, source.id);
      onDeleted();
    } catch (e) {
      notify('error', messageOf(e));
    }
  };
  return (
    <li data-testid="source-row" className="flex gap-2 rounded-lg border border-border p-2">
      <Thumbnail projectId={projectId} source={source} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-sm font-medium" title={source.title}>
          {source.title}
        </p>
        <p className="text-xs text-muted-foreground">
          {SCOPE_LABEL[source.scope.level]} · {(source.sizeBytes / 1024).toFixed(1)} KB
        </p>
        <div className="flex flex-wrap gap-1">
          {source.intent.map((intent) => (
            <Badge key={intent}>{INTENTS.find((i) => i.id === intent)?.label ?? intent}</Badge>
          ))}
        </div>
        {source.provenance.url || source.provenance.license ? (
          <p className="break-all text-[11px] text-muted-foreground">
            {[source.provenance.url, source.provenance.license].filter(Boolean).join(' · ')}
          </p>
        ) : null}
      </div>
      {confirming ? (
        <div className="flex shrink-0 flex-col gap-1">
          <Button variant="destructive" size="sm" onClick={() => void remove()}>
            Eliminar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
            Cancelar
          </Button>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Eliminar ${source.title}`}
          onClick={() => setConfirming(true)}
        >
          <Trash2 size={15} />
        </Button>
      )}
    </li>
  );
}

export function ReferencesPanel() {
  const projectId = useEditor((state) => state.projectId);
  const activeScreenId = useEditor((state) => state.activeScreenId);
  const selection = useEditor((state) => state.selection);
  const notify = useEditor((state) => state.notify);
  const { sources, error, reload } = useSources(projectId);

  const [mode, setMode] = useState<'document' | 'image'>('document');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [level, setLevel] = useState<SourceScopeLevel>('project');
  const [intent, setIntent] = useState<SourceIntent[]>([]);
  const [url, setUrl] = useState('');
  const [license, setLicense] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  if (!projectId) return null;

  const nodeScopeAvailable = selection.length === 1;
  const effectiveLevel = level === 'node' && !nodeScopeAvailable ? 'project' : level;
  const hasPayload = file !== null || (mode === 'document' && text.trim() !== '');

  const reset = () => {
    setTitle('');
    setText('');
    setFile(null);
    setIntent([]);
    setUrl('');
    setLicense('');
    if (fileInput.current) fileInput.current.value = '';
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!hasPayload || busy) return;
    const provenance = {
      ...(url.trim() ? { url: url.trim() } : {}),
      ...(license.trim() ? { license: license.trim() } : {}),
    };
    const base = {
      scope: scopeFor(effectiveLevel, activeScreenId, selection),
      intent,
      ...(Object.keys(provenance).length > 0 ? { provenance } : {}),
    };
    setBusy(true);
    try {
      let input: NewSource;
      if (file) {
        const kind = classifyFile(file.name, file.type);
        if (!kind || (mode === 'image') !== (kind.type === 'image')) {
          notify(
            'error',
            mode === 'image'
              ? 'Elegí una imagen PNG, JPG o WEBP.'
              : 'Elegí un archivo .txt, .md o .pdf.',
          );
          return;
        }
        const label = title.trim() || file.name;
        input =
          kind.type === 'text'
            ? { ...base, kind: 'document', title: label, mimeType: kind.mimeType, content: await file.text() }
            : {
                ...base,
                kind: kind.type === 'image' ? 'reference' : 'document',
                title: label,
                mimeType: kind.mimeType,
                dataBase64: bytesToBase64(new Uint8Array(await file.arrayBuffer())),
              };
      } else {
        input = {
          ...base,
          kind: 'document',
          title: title.trim() || 'Texto pegado',
          mimeType: 'text/plain',
          content: text,
        };
      }
      await api.createSource(projectId, input);
      reset();
      await reload();
    } catch (e) {
      notify('error', isApiError(e) ? e.message : messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-3" data-testid="references-panel">
      <p className="text-xs text-muted-foreground">
        Sumá documentos e imágenes que expliquen qué necesitás. Todavía no se analizan: la lectura con IA llega
        más adelante.
      </p>

      <form onSubmit={(event) => void submit(event)} className="space-y-3 rounded-lg border border-border p-3">
        <div role="radiogroup" aria-label="Tipo de referencia" className="flex gap-1">
          {(['document', 'image'] as const).map((value) => (
            <Button
              key={value}
              role="radio"
              aria-checked={mode === value}
              variant={mode === value ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => {
                setMode(value);
                setFile(null);
                if (fileInput.current) fileInput.current.value = '';
              }}
            >
              {value === 'document' ? 'Documento' : 'Imagen'}
            </Button>
          ))}
        </div>

        <Input
          aria-label="Título"
          placeholder="Título (opcional)"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />

        {mode === 'document' ? (
          <Textarea
            aria-label="Texto del documento"
            placeholder="Pegá acá el texto (txt o markdown)…"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        ) : null}

        <input
          ref={fileInput}
          type="file"
          aria-label={mode === 'document' ? 'Archivo de documento' : 'Archivo de imagen'}
          accept={mode === 'document' ? '.txt,.md,.pdf,text/plain,text/markdown,application/pdf' : 'image/png,image/jpeg,image/webp'}
          className="block w-full text-xs text-muted-foreground file:mr-2 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-foreground"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        {mode === 'document' ? (
          <p className="text-[11px] text-muted-foreground">
            Los PDF se guardan tal cual; el texto se extrae más adelante.
          </p>
        ) : null}

        <label className="grid grid-cols-[64px_1fr] items-center gap-2 text-[13px]">
          <span className="text-muted-foreground">Aplica a</span>
          <Select
            aria-label="Alcance"
            value={effectiveLevel}
            onChange={(event) => setLevel(event.target.value as SourceScopeLevel)}
          >
            <option value="project">Todo el proyecto</option>
            <option value="screen">Esta pantalla</option>
            <option value="node" disabled={!nodeScopeAvailable}>
              Elemento seleccionado{nodeScopeAvailable ? '' : ' (elegí uno)'}
            </option>
          </Select>
        </label>

        <fieldset className="space-y-1">
          <legend className="mb-1 text-xs text-muted-foreground">¿Para qué sirve?</legend>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {INTENTS.map(({ id, label }) => (
              <label key={id} className="flex items-center gap-1.5 text-[13px]">
                <input
                  type="checkbox"
                  checked={intent.includes(id)}
                  onChange={(event) =>
                    setIntent((previous) =>
                      event.target.checked ? [...previous, id] : previous.filter((i) => i !== id),
                    )
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">Origen y licencia (opcional)</summary>
          <div className="mt-2 space-y-2">
            <Input aria-label="URL de origen" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
            <Input aria-label="Licencia" placeholder="Licencia (p. ej. CC-BY)" value={license} onChange={(e) => setLicense(e.target.value)} />
          </div>
        </details>

        <Button type="submit" size="sm" disabled={!hasPayload || busy}>
          <Upload size={14} /> {busy ? 'Subiendo…' : 'Agregar referencia'}
        </Button>
      </form>

      {error ? <p className="text-xs text-destructive">No se pudo cargar la lista: {error}</p> : null}
      {sources.length === 0 && !error ? (
        <p className="text-sm text-muted-foreground">Todavía no agregaste referencias.</p>
      ) : (
        <ul className="space-y-2" aria-label="Referencias del proyecto">
          {sources.map((source) => (
            <SourceRow key={source.id} projectId={projectId} source={source} onDeleted={() => void reload()} />
          ))}
        </ul>
      )}
    </div>
  );
}
