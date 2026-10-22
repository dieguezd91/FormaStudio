import type { FastifyInstance } from 'fastify';
import { AiOutputError, AiProviderError, type AiProvider } from '@forma/ai';
import { extractRequirements } from '../ai/requirements';
import { generateProposals } from '../ai/proposals';
import { previewEdit } from '../ai/edit';
import { sourceImpact } from '../ai/impact';
import {
  aiAuthFailed,
  aiDisabled,
  aiInvalidOutput,
  aiOverloaded,
  aiProviderError,
  aiQuotaExceeded,
  aiRequestRejected,
  aiTimeout,
  aiUnavailable,
  type AppError,
} from '../errors';
import { aiEditBody, aiImpactQuery, aiProposalsBody, aiRequirementsBody } from '../schemas';
import { parseInput } from '../validation';
import { currentDocument, requireProject, type ProjectParams, type RouteContext } from './support';

/** The envelope error for a classified provider failure (see `classifyProviderError`). */
function providerFailure(error: AiProviderError): AppError {
  switch (error.kind) {
    case 'rejected':
      return aiRequestRejected(error.providerMessage);
    case 'auth':
      return aiAuthFailed();
    case 'quota':
      return aiQuotaExceeded(error);
    case 'overloaded':
      return aiOverloaded(error.retryAfterSeconds);
    case 'timeout':
      return aiTimeout();
    default:
      return aiProviderError(error.message);
  }
}

/** Provider failures become envelope errors; the model's content never reaches logs or messages. */
async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AiOutputError) throw aiInvalidOutput(error.issues);
    if (error instanceof AiProviderError) throw providerFailure(error);
    throw error;
  }
}

export function registerAiRoutes(
  app: FastifyInstance,
  { repo, ai, aiStatus, aiLimits }: RouteContext,
): void {
  /** The kill switch wins over everything; a missing key is reported separately. */
  const requireAi = (): AiProvider => {
    if (!aiStatus.enabled) throw aiDisabled();
    if (!ai) throw aiUnavailable();
    return ai;
  };

  // Model-free and project-free: lets the UI decide whether to offer AI at all.
  app.get('/ai/status', async () => aiStatus);

  app.post<ProjectParams>('/projects/:id/ai/requirements', async (request) => {
    const provider = requireAi();
    const projectId = request.params.id;
    requireProject(repo, projectId);
    const body = parseInput(aiRequirementsBody, request.body);
    return guarded(() =>
      extractRequirements({ repo, ai: provider, limits: aiLimits }, projectId, body?.sourceIds),
    );
  });

  app.post<ProjectParams>('/projects/:id/ai/proposals', async (request, reply) => {
    const provider = requireAi();
    const projectId = request.params.id;
    requireProject(repo, projectId);
    const body = parseInput(aiProposalsBody, request.body) ?? { count: 3 };
    const { document } = currentDocument(repo, projectId);
    const result = await guarded(() =>
      generateProposals({ repo, ai: provider }, projectId, document, body),
    );
    return reply.code(201).send(result);
  });

  app.post<ProjectParams>('/projects/:id/ai/edit', async (request) => {
    const provider = requireAi();
    const projectId = request.params.id;
    requireProject(repo, projectId);
    const body = parseInput(aiEditBody, request.body);
    const stored = currentDocument(repo, projectId);
    return guarded(() => previewEdit({ repo, ai: provider }, projectId, stored, body));
  });

  // Deterministic and model-free, so it works without an API key.
  app.get<ProjectParams>('/projects/:id/ai/impact', async (request) => {
    const projectId = request.params.id;
    requireProject(repo, projectId);
    const { since } = parseInput(aiImpactQuery, request.query);
    const sinceIso = since === undefined ? undefined : new Date(since).toISOString();
    return { since: sinceIso ?? null, impacts: sourceImpact(repo, projectId, sinceIso) };
  });
}
