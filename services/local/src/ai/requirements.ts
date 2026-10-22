import { createHash } from 'node:crypto';
import {
  generateValidated,
  requirementsOutputSchema,
  type AiProvider,
  type RequirementsOutput,
} from '@forma/ai';
import { REQUIREMENTS_SYSTEM, buildRequirementsMessages } from '@forma/ai/prompts';
import type { Repository } from '../db';
import { notFound, unprocessable } from '../errors';
import { requirementSchema, type Requirement } from '../schemas';
import type { AiLimits } from './limits';
import { normalizeForMatch } from './text';
import { warning, type AiWarning } from './warnings';

export interface RequirementsResult {
  requirements: Requirement[];
  warnings: AiWarning[];
  usedSources: { id: string; title: string; type: 'text' | 'image'; sourceVersion: number }[];
}

interface TextSource {
  type: 'text';
  id: string;
  title: string;
  version: number;
  text: string;
  normalized: string;
}
interface ImageSource {
  type: 'image';
  id: string;
  title: string;
  version: number;
  mediaType: string;
  data: Uint8Array;
}
type SentSource = TextSource | ImageSource;

const isImage = (mimeType: string) => mimeType.startsWith('image/');

/** Requirement ids are derived from the text so re-extracting the same requirement keeps its id. */
const requirementId = (text: string): string =>
  `req_${createHash('sha1').update(normalizeForMatch(text)).digest('hex').slice(0, 10)}`;

/**
 * Selects what may be sent to the model: the sources the request names, or every project-scoped
 * source. Text goes as text; images (within the byte limit) go as image parts; anything else
 * (PDF without text, oversized blobs) is skipped and reported.
 */
function collectSources(
  repo: Repository,
  projectId: string,
  sourceIds: string[] | undefined,
  limits: AiLimits,
): { sent: SentSource[]; warnings: AiWarning[] } {
  const all = repo.sources.list(projectId);
  const selected =
    sourceIds === undefined
      ? all.filter((source) => source.scope.level === 'project')
      : sourceIds.map((id) => {
          const source = all.find((candidate) => candidate.id === id);
          if (!source) throw notFound('Source');
          return source;
        });

  const sent: SentSource[] = [];
  const warnings: AiWarning[] = [];
  const skip = (id: string, title: string, reason: string) =>
    warnings.push(warning('sourceSkipped', `Se omitió «${title}»: ${reason}`, { sourceId: id }));
  let images = 0;

  for (const meta of selected) {
    const source = repo.sources.get(projectId, meta.id);
    if (!source) continue;
    if (source.content !== null && source.content.trim() !== '') {
      let text = source.content;
      if (text.length > limits.maxTextChars) {
        text = text.slice(0, limits.maxTextChars);
        warnings.push(
          warning(
            'sourceTruncated',
            `«${source.title}» es muy largo: solo se analizaron los primeros ${limits.maxTextChars} caracteres.`,
            { sourceId: source.id },
          ),
        );
      }
      sent.push({
        type: 'text',
        id: source.id,
        title: source.title,
        version: source.sourceVersion,
        text,
        normalized: normalizeForMatch(text),
      });
    } else if (source.hasBlob && isImage(source.mimeType)) {
      if (source.sizeBytes > limits.maxBlobBytes) {
        skip(source.id, source.title, `supera el tamaño máximo para enviar a la IA (${limits.maxBlobBytes} bytes).`);
      } else if (images >= limits.maxImages) {
        skip(source.id, source.title, `solo se analizan ${limits.maxImages} imágenes por solicitud.`);
      } else {
        const blob = repo.sources.getBlob(projectId, source.id);
        if (!blob) continue;
        images++;
        sent.push({
          type: 'image',
          id: source.id,
          title: source.title,
          version: source.sourceVersion,
          mediaType: blob.mimeType,
          data: blob.data,
        });
      }
    } else if (source.hasBlob && source.mimeType === 'application/pdf') {
      skip(source.id, source.title, 'es un PDF sin contenido de texto y este corte aún no lo analiza.');
    } else {
      skip(source.id, source.title, 'no tiene texto ni es una imagen que se pueda analizar.');
    }
  }
  return { sent, warnings };
}

/**
 * Applies the traceability rules the model cannot be trusted with (§5.2, §5.4): excerpts must
 * occur in the cited text source, and `confirmed` needs textual evidence.
 */
export function reviewRequirements(
  output: RequirementsOutput,
  sources: readonly SentSource[],
): { requirements: Requirement[]; warnings: AiWarning[] } {
  const byId = new Map(sources.map((source) => [source.id, source]));
  const requirements: Requirement[] = [];
  const warnings: AiWarning[] = [];
  const seen = new Set<string>();

  for (const extracted of output.requirements) {
    const id = requirementId(extracted.text);
    if (seen.has(id)) continue;
    seen.add(id);

    const sourceRefs: Requirement['sourceRefs'] = [];
    let droppedExcerpts = 0;
    let textEvidence = false;
    for (const ref of extracted.sourceRefs) {
      const source = byId.get(ref.sourceId);
      if (!source) continue;
      if (source.type === 'image') {
        sourceRefs.push({ sourceId: source.id, sourceVersion: source.version, excerpt: ref.excerpt });
        continue;
      }
      const needle = normalizeForMatch(ref.excerpt);
      if (needle !== '' && source.normalized.includes(needle)) {
        textEvidence = true;
        sourceRefs.push({ sourceId: source.id, sourceVersion: source.version, excerpt: ref.excerpt });
      } else {
        droppedExcerpts++;
      }
    }

    let status = extracted.status;
    if (status === 'confirmed' && !textEvidence) {
      status = 'assumed';
      const reason =
        droppedExcerpts > 0
          ? 'el extracto citado no aparece en la fuente'
          : sourceRefs.length > 0
            ? 'solo hay evidencia en imágenes'
            : 'no cita ninguna fuente';
      warnings.push(
        warning(
          'requirementDowngraded',
          `«${extracted.text}» pasó de confirmado a supuesto: ${reason}.`,
          { requirementId: id },
        ),
      );
    } else if (droppedExcerpts > 0) {
      warnings.push(
        warning(
          'excerptNotFound',
          `Se descartaron ${droppedExcerpts} cita(s) de «${extracted.text}» porque el extracto no aparece en la fuente.`,
          { requirementId: id },
        ),
      );
    }
    requirements.push(
      requirementSchema.parse({
        id,
        text: extracted.text,
        kind: extracted.kind,
        status,
        sourceRefs,
      }),
    );
  }
  return { requirements, warnings };
}

export interface RequirementsDeps {
  repo: Repository;
  ai: AiProvider;
  limits: AiLimits;
}

export async function extractRequirements(
  { repo, ai, limits }: RequirementsDeps,
  projectId: string,
  sourceIds: string[] | undefined,
): Promise<RequirementsResult> {
  const { sent, warnings } = collectSources(repo, projectId, sourceIds, limits);
  if (sent.length === 0) {
    throw unprocessable(
      'noSources',
      'No hay fuentes que analizar: añade documentos de texto o imágenes de referencia al proyecto.',
      warnings.map((w) => ({ path: w.sourceId ?? '', message: w.message })),
    );
  }
  const known = new Set(sent.map((source) => source.id));
  const documents = sent.filter((s): s is TextSource => s.type === 'text');
  const images = sent.filter((s): s is ImageSource => s.type === 'image');

  const reviewed = await generateValidated({
    model: images.length > 0 ? ai.visionModel : ai.model,
    schema: requirementsOutputSchema,
    schemaName: 'requirements',
    system: REQUIREMENTS_SYSTEM,
    messages: buildRequirementsMessages({ documents, images }),
    validate: (output) => {
      const issues = output.requirements.flatMap((requirement, i) =>
        requirement.sourceRefs
          .filter((ref) => !known.has(ref.sourceId))
          .map((ref) => `requirements.${i}.sourceRefs: unknown sourceId '${ref.sourceId}'; use only the ids provided`),
      );
      return issues.length > 0 ? { ok: false, issues } : { ok: true, value: reviewRequirements(output, sent) };
    },
  });

  const requirements = repo.transaction(() =>
    repo.requirements.replaceAll(projectId, reviewed.requirements),
  );
  return {
    requirements,
    warnings: [...warnings, ...reviewed.warnings],
    usedSources: sent.map(({ id, title, type, version }) => ({
      id,
      title,
      type,
      sourceVersion: version,
    })),
  };
}
