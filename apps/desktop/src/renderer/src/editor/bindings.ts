import type { Connection, FormaDocument, FormaNode } from '@forma/design-core';

/**
 * Resolver for the binding path convention documented in `@forma/library/src/bindings.ts`:
 *
 *   items                      the whole collection
 *   items[category=Armas]      rows whose field equals the value (filters may repeat)
 *   items[category=Armas][3]   zero-based position inside the filtered rows
 *   items[3].icon              a field of that row
 *
 * Kept here because the library does not export a resolver yet. Candidate to move into the
 * Test-mode runtime (task 6) so editor, runtime and exporters share one implementation.
 */

export type PathStep =
  | { kind: 'filter'; field: string; value: string }
  | { kind: 'index'; index: number }
  | { kind: 'field'; name: string };

export interface ParsedPath {
  root: string;
  steps: PathStep[];
}

const IDENT = /^[A-Za-z_][\w-]*/;

export function parseBindingPath(path: string): ParsedPath | undefined {
  const rootMatch = IDENT.exec(path);
  if (!rootMatch) return undefined;
  const steps: PathStep[] = [];
  let rest = path.slice(rootMatch[0].length);
  while (rest.length > 0) {
    if (rest.startsWith('[')) {
      const end = rest.indexOf(']');
      if (end < 0) return undefined;
      const inner = rest.slice(1, end);
      rest = rest.slice(end + 1);
      if (/^\d+$/.test(inner)) {
        steps.push({ kind: 'index', index: Number(inner) });
        continue;
      }
      const eq = inner.indexOf('=');
      if (eq <= 0) return undefined;
      steps.push({ kind: 'filter', field: inner.slice(0, eq), value: inner.slice(eq + 1) });
    } else if (rest.startsWith('.')) {
      const name = IDENT.exec(rest.slice(1));
      if (!name) return undefined;
      steps.push({ kind: 'field', name: name[0] });
      rest = rest.slice(1 + name[0].length);
    } else {
      return undefined;
    }
  }
  return { root: rootMatch[0], steps };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const own = (record: Record<string, unknown>, key: string): unknown =>
  Object.hasOwn(record, key) ? record[key] : undefined;

/** Resolves `path` against a data source's mock data; `undefined` when anything is missing. */
export function resolveBindingPath(mock: unknown, path: string): unknown {
  const parsed = parseBindingPath(path);
  if (!parsed) return undefined;
  // A collection data source is its own root ("items"); object sources are looked up by key.
  let current: unknown = Array.isArray(mock) ? mock : isRecord(mock) ? own(mock, parsed.root) : undefined;
  for (const step of parsed.steps) {
    if (current === undefined) return undefined;
    if (step.kind === 'filter') {
      if (!Array.isArray(current)) return undefined;
      current = current.filter((row) => isRecord(row) && String(own(row, step.field)) === step.value);
    } else if (step.kind === 'index') {
      if (!Array.isArray(current)) return undefined;
      current = current[step.index];
    } else {
      if (!isRecord(current)) return undefined;
      current = own(current, step.name);
    }
  }
  return current;
}

/** `items[x][2].icon` -> `items[x][2].name`; undefined when the path does not end in a field. */
export function siblingFieldPath(path: string, field: string): string | undefined {
  const parsed = parseBindingPath(path);
  const last = parsed?.steps.at(-1);
  if (!parsed || last?.kind !== 'field') return undefined;
  const dot = path.lastIndexOf('.');
  return `${path.slice(0, dot)}.${field}`;
}

export interface ItemPreview {
  name?: string;
  icon?: string;
  quantity?: number;
  connection: Connection;
}

/** Mock item an `itemView` shows, or undefined when it has no (resolvable) binding. */
export function resolveItemPreview(doc: FormaDocument, node: FormaNode): ItemPreview | undefined {
  const binding = node.bindings.find((b) => b.prop === 'icon') ?? node.bindings[0];
  if (!binding) return undefined;
  const source = doc.dataSources.find((d) => d.id === binding.dataSourceId);
  if (!source) return undefined;

  const read = (prop: string): unknown => {
    const bound = node.bindings.find((b) => b.prop === prop);
    return bound ? resolveBindingPath(source.mock, bound.path) : undefined;
  };
  const icon = read('icon');
  const quantity = read('quantity');
  const namePath = siblingFieldPath(binding.path, 'name');
  const name = namePath ? resolveBindingPath(source.mock, namePath) : undefined;
  if (icon === undefined && quantity === undefined && name === undefined) return undefined;

  return {
    connection: source.connection,
    ...(typeof name === 'string' ? { name } : {}),
    ...(typeof icon === 'string' ? { icon } : {}),
    ...(typeof quantity === 'number' ? { quantity } : {}),
  };
}
