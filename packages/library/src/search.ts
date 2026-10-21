import type { BehaviorKind } from '@forma/design-core';
import type { LibraryEntry } from './catalog';
import { listEntries } from './registry';

export interface SearchHit {
  entry: LibraryEntry;
  score: number;
  /** Words of the query (normalized, in query order) that matched the entry. */
  matchedTerms: string[];
}

export interface SearchOptions {
  limit?: number;
}

const DEFAULT_LIMIT = 10;

const STOPWORDS = new Set(
  (
    'a al con de del el e en la las lo los o para por que se si sin su un una unas unos y ' +
    'and for in of on the to with an quiero necesito busco'
  ).split(' '),
);

/** Groups of words that mean the same to a designer; the first stem of a group is canonical. */
const SYNONYM_GROUPS = [
  ['inventario', 'inventory', 'mochila', 'backpack'],
  ['pestaña', 'tab', 'solapa'],
  ['arrastrar', 'arrastrable', 'arrastre', 'drag', 'draggable', 'soltar', 'drop', 'dragdrop'],
  ['objeto', 'item', 'articulo'],
  ['equipamiento', 'equipment', 'equipo', 'equipar', 'equipacion'],
  ['contextual', 'context', 'derecho'],
  ['apilar', 'apilable', 'pila', 'stack', 'stackable'],
  ['dividir', 'split', 'partir', 'separar'],
  ['tooltip', 'emergente', 'hover'],
  ['cuadricula', 'grid', 'rejilla', 'casilla', 'slot'],
  ['lista', 'list', 'listado'],
  ['filtrar', 'filtro', 'filtrable', 'filter', 'buscar', 'busqueda', 'search', 'buscador'],
  ['boton', 'button', 'pulsador'],
  ['texto', 'text', 'etiqueta', 'label'],
  ['panel', 'contenedor', 'container'],
  ['seleccionar', 'seleccion', 'select', 'seleccionable'],
  ['scroll', 'desplazar', 'desplazamiento'],
];

/** Search vocabulary for each behavior kind (Spanish and English). */
const BEHAVIOR_TERMS: Record<BehaviorKind, string> = {
  tabs: 'pestañas tabs solapas',
  select: 'seleccionar selección select',
  dragDrop: 'arrastrar soltar drag drop',
  stack: 'apilar pilas stack cantidad',
  split: 'dividir partir split',
  contextMenu: 'menú contextual clic derecho context menu',
  tooltip: 'tooltip descripción emergente hover',
};

const FIELD_WEIGHTS = { name: 10, tags: 6, id: 4, purpose: 3, behaviors: 2 } as const;
type Field = keyof typeof FIELD_WEIGHTS;

/** Lowercase, accent-free ("pestañas" -> "pestanas"), split into alphanumeric words. */
export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Naive plural and gender folding shared by Spanish and English ("objetos" ~ "objeto" ~ "obj"). */
export function stem(word: string): string {
  if (word.length <= 3) return word;
  let w = word;
  if (w.endsWith('ces')) w = `${w.slice(0, -3)}z`;
  else if (w.endsWith('es') && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith('s')) w = w.slice(0, -1);
  return w.length > 4 && /[aeo]$/.test(w) ? w.slice(0, -1) : w;
}

const CANONICAL = new Map<string, string>();
for (const group of SYNONYM_GROUPS) {
  const [first = ''] = group;
  const canonical = stem(normalizeWords(first).join(''));
  for (const word of group) CANONICAL.set(stem(normalizeWords(word).join('')), canonical);
}

const conceptOf = (word: string): string => {
  const s = stem(word);
  return CANONICAL.get(s) ?? s;
};

const conceptsOf = (text: string): Set<string> =>
  new Set(
    normalizeWords(text)
      .filter((w) => !STOPWORDS.has(w))
      .map(conceptOf),
  );

interface IndexedEntry {
  entry: LibraryEntry;
  fields: Record<Field, Set<string>>;
  /** Per tag, so several matching tags can add up. */
  tags: Set<string>[];
}

let index: IndexedEntry[] | undefined;

function getIndex(): IndexedEntry[] {
  index ??= listEntries().map((entry) => {
    const behaviorText = entry.behaviors.map((k) => `${k} ${BEHAVIOR_TERMS[k]}`).join(' ');
    const tags = entry.tags.map(conceptsOf);
    return {
      entry,
      tags,
      fields: {
        name: conceptsOf(entry.name),
        tags: new Set(tags.flatMap((t) => [...t])),
        id: conceptsOf(`${entry.id} ${entry.family ?? ''} ${entry.category}`),
        purpose: conceptsOf(entry.purpose),
        behaviors: conceptsOf(behaviorText),
      },
    };
  });
  return index;
}

/** Each extra tag that also matches adds this fraction of the tag weight. */
const EXTRA_TAG_BONUS = 0.25;
/** Weight of fields other than the best one for the same term. */
const SECONDARY_FIELD_FACTOR = 0.2;

function scoreEntry(
  { fields, tags }: IndexedEntry,
  query: { word: string; concept: string }[],
): { score: number; matched: string[] } {
  let total = 0;
  const matched: string[] = [];
  for (const { word, concept } of query) {
    const weights = (Object.keys(FIELD_WEIGHTS) as Field[])
      .filter((field) => fields[field].has(concept))
      .map((field) => FIELD_WEIGHTS[field]);
    if (weights.length === 0) continue;
    matched.push(word);
    const [best = 0, ...rest] = weights.sort((a, b) => b - a);
    const extraTags = Math.max(0, tags.filter((t) => t.has(concept)).length - 1);
    total +=
      best +
      SECONDARY_FIELD_FACTOR * rest.reduce((sum, w) => sum + w, 0) +
      EXTRA_TAG_BONUS * FIELD_WEIGHTS.tags * extraTags;
  }
  const coverage = matched.length / query.length;
  return { score: total * (0.5 + 0.5 * coverage), matched };
}

/**
 * Deterministic keyword search over the catalog: accent- and plural-insensitive, with a small
 * ES/EN synonym map. Name matches outweigh tags, tags outweigh purpose, purpose outweighs
 * behaviors; entries matching more of the query rank higher. Ties keep catalog order.
 */
export function searchLibrary(query: string, options: SearchOptions = {}): SearchHit[] {
  const seen = new Set<string>();
  const words = normalizeWords(query).filter(
    (w) => !STOPWORDS.has(w) && !seen.has(w) && seen.add(w),
  );
  if (words.length === 0) return [];
  const terms = words.map((word) => ({ word, concept: conceptOf(word) }));

  return getIndex()
    .map((indexed) => ({ entry: indexed.entry, ...scoreEntry(indexed, terms) }))
    .filter((hit) => hit.matched.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit ?? DEFAULT_LIMIT)
    .map(({ entry, score, matched }) => ({ entry, score, matchedTerms: matched }));
}
