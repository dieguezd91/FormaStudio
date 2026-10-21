import type { Binding } from '@forma/design-core';
import { INVENTORY_ITEMS_ID } from './mock/items';

/**
 * Binding path convention for item collections (documented here because the schema stores paths
 * as opaque strings and the Test-mode runtime and exporters must agree on it):
 *
 *   items                      the whole collection of the bound data source
 *   items[category=Armas]      only the rows whose field equals the value (filters may repeat)
 *   items[category=Armas][3]   zero-based position inside the filtered rows
 *   items[3].icon              a field of that row
 *
 * Filter values may not contain `[`, `]` or `=`; entries validate their params with
 * `FILTER_VALUE_PATTERN`.
 */
export const COLLECTION_ROOT = 'items';

export const FILTER_VALUE_PATTERN = /^[^[\]=]+$/;

export interface ItemFilter {
  field: string;
  value: string;
}

export const collectionPath = (filter?: ItemFilter): string =>
  filter ? `${COLLECTION_ROOT}[${filter.field}=${filter.value}]` : COLLECTION_ROOT;

export const rowPath = (collection: string, index: number, field?: string): string =>
  `${collection}[${index}]${field ? `.${field}` : ''}`;

/** Binding on the items data source; `id` only has to be unique within its node. */
export const itemBinding = (prop: string, path: string): Binding => ({
  id: prop,
  prop,
  dataSourceId: INVENTORY_ITEMS_ID,
  path,
});
