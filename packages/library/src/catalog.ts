import { z } from 'zod';
import {
  behaviorKindSchema,
  type DataSource,
  type IdGenerator,
  type Intent,
  type Operation,
} from '@forma/design-core';
import type { TokenKit } from './tokens';

export const COMPATIBILITY_TARGETS = ['unity-ugui', 'unity-uitoolkit', 'web-react'] as const;
export type CompatibilityTarget = (typeof COMPATIBILITY_TARGETS)[number];

export const compatibilityLevelSchema = z.enum([
  'supported',
  'adapted',
  'approximate',
  'unavailable',
]);
export type CompatibilityLevel = z.infer<typeof compatibilityLevelSchema>;

/** How faithfully an exporter target can reproduce an entry, with a short Spanish note. */
export const compatibilityHintSchema = z.strictObject({
  level: compatibilityLevelSchema,
  note: z.string().min(1),
});
export type CompatibilityHint = z.infer<typeof compatibilityHintSchema>;

export const libraryEntryMetaSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(['component', 'pattern', 'screen']),
  category: z.enum(['basic', 'navigation', 'game-system', 'interaction']),
  family: z.string().min(1).optional(),
  /** Spanish, user-facing. */
  name: z.string().min(1),
  /** Spanish one-liner: the problem the entry solves. */
  purpose: z.string().min(1),
  /** Spanish and English synonyms used by search. */
  tags: z.array(z.string().min(1)),
  behaviors: z.array(behaviorKindSchema),
  provenance: z.strictObject({ kind: z.literal('original') }),
  compatibility: z.strictObject({
    'unity-ugui': compatibilityHintSchema,
    'unity-uitoolkit': compatibilityHintSchema,
    'web-react': compatibilityHintSchema,
  }),
});
export type LibraryEntryMeta = z.infer<typeof libraryEntryMetaSchema>;

/** Everything `build` may use; `insertEntry` guarantees `newId` never collides with the screen. */
export interface BuildContext {
  entryId: string;
  idGen: IdGenerator;
  /** Collision-free `<prefix>_<suffix>` id for a node of the target screen. */
  newId: (prefix: string) => string;
  screenId: string;
  parentId: string;
  tokens: TokenKit;
}

export interface BuildResult {
  /** Parents are always added before their children. */
  ops: Operation[];
  rootNodeId: string;
  dataSources: DataSource[];
  intents: Intent[];
}

export type EntryParams = Record<string, unknown>;

export interface LibraryEntry extends LibraryEntryMeta {
  /** Configurable options with defaults; `params.parse({})` yields the defaults. */
  params: z.ZodType<EntryParams>;
  /** `params` must already be parsed by `params`. */
  build: (params: EntryParams, ctx: BuildContext) => BuildResult;
}

export interface EntryDefinition<S extends z.ZodObject> extends LibraryEntryMeta {
  params: S;
  build: (params: z.output<S>, ctx: BuildContext) => BuildResult;
}

/** Types `build` against the entry's own params schema while storing it uniformly. */
export function defineEntry<S extends z.ZodObject>(definition: EntryDefinition<S>): LibraryEntry {
  const { params, build, ...meta } = definition;
  libraryEntryMetaSchema.parse(meta);
  return {
    ...meta,
    params: params as unknown as z.ZodType<EntryParams>,
    build: (raw, ctx) => build(params.parse(raw), ctx),
  };
}
