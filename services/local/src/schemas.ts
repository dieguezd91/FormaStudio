import { z } from 'zod';
import { targetSchema } from '@forma/design-core';

const nonEmpty = (max: number) => z.string().trim().min(1).max(max);
const revision = z.int().min(1);

// Projects
export const createProjectBody = z.strictObject({ name: nonEmpty(200), target: targetSchema });
export const renameProjectBody = z.strictObject({ name: nonEmpty(200) });

// Design document (document and batch contents are validated by design-core, not here)
export const putDocumentBody = z.strictObject({ document: z.unknown(), baseRevision: revision });
export const applyBatchBody = z.strictObject({ batch: z.unknown(), baseRevision: revision });
/** Body of restore/adopt; the whole body is optional. */
export const optionalRevisionBody = z
  .strictObject({ baseRevision: revision.optional() })
  .optional();

// Versions
export const createVersionBody = z.strictObject({
  label: nonEmpty(200),
  note: z.string().max(5000).optional(),
});

// Exports
export const analyzeExportBody = z.strictObject({
  screenId: nonEmpty(200),
  /** When given, the response also says whether this Unity project has the Forma package. */
  unityProjectPath: nonEmpty(1000).optional(),
});
export const exportUguiBody = z.strictObject({
  screenId: nonEmpty(200),
  unityProjectPath: nonEmpty(1000),
  outputFolder: z.string().max(500).optional(),
});
export const installPackageBody = z.strictObject({ unityProjectPath: nonEmpty(1000) });

// Sources
export const sourceKindSchema = z.enum(['document', 'reference']);
export const scopeLevelSchema = z.enum(['project', 'screen', 'node', 'proposal']);
export const sourceIntentSchema = z.enum([
  'structure',
  'interaction',
  'hierarchy',
  'visual-style',
  'inspiration',
]);

export const sourceScopeSchema = z
  .strictObject({ level: scopeLevelSchema, targetId: nonEmpty(200).optional() })
  .refine((scope) => scope.level === 'project' || scope.targetId !== undefined, {
    message: 'targetId is required unless the scope level is project',
    path: ['targetId'],
  });

export const provenanceSchema = z.strictObject({
  url: z.string().max(2000).optional(),
  author: z.string().max(500).optional(),
  license: z.string().max(500).optional(),
  notes: z.string().max(5000).optional(),
});

const mimeType = z.string().regex(/^[A-Za-z0-9][\w.+-]*\/[A-Za-z0-9][\w.+-]*$/, 'not a MIME type');

/** Linear-time check; avoids a backtracking regex on multi-megabyte payloads. */
const base64 = z
  .string()
  .min(1)
  .refine((s) => s.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(s), 'not valid base64');

export const createSourceBody = z
  .strictObject({
    kind: sourceKindSchema,
    title: nonEmpty(300),
    mimeType,
    content: z.string().optional(),
    dataBase64: base64.optional(),
    scope: sourceScopeSchema,
    intent: z.array(sourceIntentSchema).optional(),
    provenance: provenanceSchema.optional(),
  })
  .refine((body) => body.content === undefined || body.dataBase64 === undefined, {
    message: 'provide either content or dataBase64, not both',
    path: ['dataBase64'],
  });

export const replaceSourceBody = z
  .strictObject({
    title: nonEmpty(300).optional(),
    mimeType: mimeType.optional(),
    content: z.string().optional(),
    dataBase64: base64.optional(),
  })
  .refine((body) => (body.content === undefined) !== (body.dataBase64 === undefined), {
    message: 'provide exactly one of content or dataBase64',
    path: ['content'],
  });

export const sourceChangesQuery = z.strictObject({
  since: z.iso.datetime({ offset: true }).optional(),
});

// Requirements
export const requirementKindSchema = z.enum(['goal', 'data', 'flow', 'constraint', 'interaction']);
export const requirementStatusSchema = z.enum(['confirmed', 'assumed', 'contradiction', 'gap']);

export const requirementSchema = z.strictObject({
  id: nonEmpty(200),
  text: z.string().min(1).max(5000),
  kind: requirementKindSchema,
  status: requirementStatusSchema,
  sourceRefs: z.array(
    z.strictObject({
      sourceId: nonEmpty(200),
      sourceVersion: z.int().min(1),
      excerpt: z.string().max(5000),
    }),
  ),
});
export type Requirement = z.infer<typeof requirementSchema>;

export const putRequirementsBody = z
  .strictObject({ requirements: z.array(requirementSchema) })
  .refine((body) => new Set(body.requirements.map((r) => r.id)).size === body.requirements.length, {
    message: 'requirement ids must be unique',
    path: ['requirements'],
  });

// Proposals
export const proposalOriginSchema = z.enum(['ai', 'library', 'manual']);
export const proposalStatusSchema = z.enum(['candidate', 'adopted', 'discarded']);

export const rationaleSchema = z.strictObject({
  need: z.string().max(5000),
  patterns: z.array(z.string().max(500)),
  tradeoffs: z.array(z.string().max(1000)),
  fromReferences: z.array(z.string().max(200)),
  requirementIds: z.array(z.string().max(200)),
});
export type Rationale = z.infer<typeof rationaleSchema>;

export const createProposalBody = z.strictObject({
  title: nonEmpty(300),
  summary: z.string().max(5000),
  rationale: rationaleSchema,
  document: z.unknown(),
  origin: proposalOriginSchema,
});
/** Adoption is a document replacement and therefore only happens through the adopt route. */
export const patchProposalBody = z.strictObject({ status: z.enum(['candidate', 'discarded']) });
export const listProposalsQuery = z.strictObject({ status: proposalStatusSchema.optional() });

// AI
export const MAX_AI_PROPOSALS = 5;

/** Optional: without `sourceIds`, every project-scoped source is analysed (§15.2). */
export const aiRequirementsBody = z
  .strictObject({ sourceIds: z.array(nonEmpty(200)).max(100).optional() })
  .optional();

export const aiProposalsBody = z
  .strictObject({
    screenId: nonEmpty(200).optional(),
    count: z.int().min(1).max(MAX_AI_PROPOSALS).default(3),
    brief: z.string().trim().max(4000).optional(),
  })
  .optional();

export const aiEditBody = z.strictObject({
  instruction: nonEmpty(4000),
  screenId: nonEmpty(200),
  selectedNodeIds: z.array(nonEmpty(200)).max(200),
  proposalIds: z.array(nonEmpty(200)).max(5).optional(),
});

export const aiImpactQuery = sourceChangesQuery;
