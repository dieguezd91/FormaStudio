import { z } from 'zod';
import { listEntries } from '@forma/library';

export interface CatalogItem {
  id: string;
  name: string;
  purpose: string;
  family?: string;
  behaviors: string[];
  /** JSON Schema of the configurable params, with defaults. */
  params: unknown;
}

/** Compact, model-facing view of the library: what each entry is for and how to configure it. */
export function buildLibraryCatalog(): CatalogItem[] {
  return listEntries().map((entry) => {
    const { $schema: _schema, ...params } = z.toJSONSchema(entry.params, { io: 'input' });
    void _schema;
    return {
      id: entry.id,
      name: entry.name,
      purpose: entry.purpose,
      ...(entry.family === undefined ? {} : { family: entry.family }),
      behaviors: entry.behaviors,
      params,
    };
  });
}
