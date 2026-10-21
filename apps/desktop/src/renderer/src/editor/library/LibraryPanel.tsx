import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { insertEntry, listEntries, listFamilies, searchLibrary, type LibraryEntryMeta } from '@forma/library';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BEHAVIOR_LABELS } from '../behaviors';
import { randomIds } from '../session';
import { editorStore, useEditor } from '../store';
import { insertionParent } from './insert';

const UGUI_LEVEL = {
  supported: { text: 'Compatible con Unity uGUI', tone: 'success' },
  adapted: { text: 'Se adapta en Unity uGUI', tone: 'primary' },
  approximate: { text: 'Aproximado en Unity uGUI', tone: 'primary' },
  unavailable: { text: 'No disponible en Unity uGUI', tone: 'danger' },
} as const;

function insert(entryId: string) {
  const state = editorStore.getState();
  const screen = state.doc?.screens.find((s) => s.id === state.activeScreenId);
  if (!state.doc || !screen) return;
  const parentId = insertionParent(screen, state.selection);
  const result = insertEntry(state.doc, {
    entryId,
    screenId: screen.id,
    parentId,
    idGen: randomIds,
  });
  if (!result.ok) {
    state.notify('error', `No se pudo insertar: ${result.error.message}`);
    return;
  }
  const applied = state.dispatch(result.value);
  const inserted = result.value.ops.find((op) => op.type === 'addNode' && op.parentId === parentId);
  if (applied.ok && inserted?.type === 'addNode') state.select([inserted.node.id]);
}

function EntryCard({ entry }: { entry: LibraryEntryMeta }) {
  const ugui = UGUI_LEVEL[entry.compatibility['unity-ugui'].level];
  return (
    <li
      data-testid="library-entry"
      data-entry-id={entry.id}
      className="space-y-2 rounded-lg border border-border bg-background/40 p-3"
    >
      <div>
        <h4 className="text-sm font-semibold">{entry.name}</h4>
        <p className="mt-0.5 text-xs text-muted-foreground">{entry.purpose}</p>
      </div>
      <div className="flex flex-wrap gap-1">
        {entry.behaviors.map((kind) => (
          <Badge key={kind}>{BEHAVIOR_LABELS[kind]}</Badge>
        ))}
      </div>
      <p className="text-xs">
        <Badge tone={ugui.tone} title={entry.compatibility['unity-ugui'].note}>
          {ugui.text}
        </Badge>{' '}
        <span className="text-muted-foreground">{entry.compatibility['unity-ugui'].note}</span>
      </p>
      <Button size="sm" aria-label={`Insertar ${entry.name}`} onClick={() => insert(entry.id)}>
        <Plus size={14} /> Insertar
      </Button>
    </li>
  );
}

export function LibraryPanel() {
  const selection = useEditor((state) => state.selection);
  const [query, setQuery] = useState('');
  const families = useMemo(() => listFamilies(), []);
  const basics = useMemo(() => listEntries().filter((entry) => !entry.family), []);
  const hits = useMemo(() => (query.trim() === '' ? [] : searchLibrary(query)), [query]);
  const searching = query.trim() !== '';

  return (
    <div className="space-y-3 p-3" data-testid="library-panel">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-2 top-2.5 text-muted-foreground" />
        <Input
          aria-label="Buscar en la biblioteca"
          placeholder="Buscar: inventario con pestañas…"
          className="pl-7"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Se inserta {selection.length === 1 ? 'dentro de la selección' : 'en la raíz de la pantalla'}; después podés editar
        todo.
      </p>

      {searching ? (
        hits.length > 0 ? (
          <ul className="space-y-2" aria-label="Resultados">
            {hits.map((hit) => (
              <EntryCard key={hit.entry.id} entry={hit.entry} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No encontramos nada para “{query}”. Probá con palabras como “inventario”, “pestañas” o “botón”.
          </p>
        )
      ) : (
        <>
          {families.map((family) => (
            <section key={family.id} className="space-y-2" aria-label={family.name}>
              <div>
                <h3 className="text-sm font-semibold">{family.name}</h3>
                <p className="text-xs text-muted-foreground">{family.description}</p>
              </div>
              <ul className="space-y-2">
                {family.variants.map((variant) => (
                  <EntryCard key={variant.id} entry={variant} />
                ))}
              </ul>
            </section>
          ))}
          <details className="space-y-2">
            <summary className="cursor-pointer text-sm font-semibold">Componentes básicos</summary>
            <ul className="mt-2 space-y-2">
              {basics.map((entry) => (
                <EntryCard key={entry.id} entry={entry} />
              ))}
            </ul>
          </details>
        </>
      )}
    </div>
  );
}
