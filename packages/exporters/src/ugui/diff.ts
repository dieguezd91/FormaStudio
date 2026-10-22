import { isDeepStrictEqual } from 'node:util';
import type { BundleNode, UguiBundle } from './bundle';

export interface BundleDiff {
  /** Node ids present only in `next`. */
  added: string[];
  /** Node ids present only in `previous`. */
  removed: string[];
  /** Nodes whose managed properties differ; `paths` are managed property paths. */
  changed: { nodeId: string; name: string; paths: string[] }[];
  renamed: { nodeId: string; from: string; to: string }[];
}

/** Value at a managed path: `components.FormaTabs` finds the component by its type. */
function valueAt(node: BundleNode, path: string): unknown {
  const [head, ...rest] = path.split('.');
  let current: unknown =
    head === 'components'
      ? node.components.find((c) => c.type === rest.shift())
      : (node as Record<string, unknown>)[head ?? ''];
  for (const key of rest) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/**
 * What a re-export would change, keyed by node id and comparing only the properties Forma
 * manages in either bundle (`bundle.managed`). Developer-owned properties and bundle metadata
 * never show up. A rename is reported in `renamed`, not in `changed`.
 */
export function diffBundles(previous: UguiBundle, next: UguiBundle): BundleDiff {
  const before = new Map(previous.nodes.map((n) => [n.id, n]));
  const after = new Map(next.nodes.map((n) => [n.id, n]));
  const diff: BundleDiff = { added: [], removed: [], changed: [], renamed: [] };

  for (const id of after.keys()) if (!before.has(id)) diff.added.push(id);
  for (const id of before.keys()) if (!after.has(id)) diff.removed.push(id);

  for (const [id, node] of after) {
    const old = before.get(id);
    if (!old) continue;
    if (old.name !== node.name) diff.renamed.push({ nodeId: id, from: old.name, to: node.name });
    const paths = [
      ...new Set([...(previous.managed[id] ?? []), ...(next.managed[id] ?? [])]),
    ].filter(
      (path) => path !== 'name' && !isDeepStrictEqual(valueAt(old, path), valueAt(node, path)),
    );
    if (paths.length > 0) diff.changed.push({ nodeId: id, name: node.name, paths });
  }
  return diff;
}
