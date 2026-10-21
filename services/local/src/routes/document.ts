import type { FastifyInstance } from 'fastify';
import { applyBatch, parseOperationBatch } from '@forma/design-core';
import { unprocessable } from '../errors';
import { applyBatchBody, putDocumentBody } from '../schemas';
import { parseInput } from '../validation';
import {
  assertRevision,
  currentDocument,
  parseValidDocument,
  requireProject,
  type ProjectParams,
  type RouteContext,
} from './support';

export function registerDocumentRoutes(app: FastifyInstance, { repo }: RouteContext): void {
  app.get<ProjectParams>('/projects/:id/document', async (request) => {
    requireProject(repo, request.params.id);
    return currentDocument(repo, request.params.id);
  });

  app.put<ProjectParams>('/projects/:id/document', async (request) => {
    const projectId = request.params.id;
    requireProject(repo, projectId);
    const body = parseInput(putDocumentBody, request.body);
    const document = parseValidDocument(body.document);
    return repo.transaction(() => {
      assertRevision(currentDocument(repo, projectId), body.baseRevision);
      return repo.documents.replace(projectId, document);
    });
  });

  app.post<ProjectParams>('/projects/:id/document/batches', async (request) => {
    const projectId = request.params.id;
    requireProject(repo, projectId);
    const body = parseInput(applyBatchBody, request.body);
    const parsed = parseOperationBatch(body.batch);
    if (!parsed.ok) {
      throw unprocessable('invalidBatch', parsed.error.message, parsed.error.issues);
    }
    const batch = parsed.value;
    return repo.transaction(() => {
      const current = currentDocument(repo, projectId);
      assertRevision(current, body.baseRevision);
      const applied = applyBatch(current.document, batch);
      if (!applied.ok) {
        const { code, message, opIndex, screenId, nodeId } = applied.error;
        throw unprocessable(code, message, undefined, {
          opIndex,
          ...(screenId === undefined ? {} : { screenId }),
          ...(nodeId === undefined ? {} : { nodeId }),
        });
      }
      const stored = repo.documents.replace(projectId, applied.doc);
      repo.documents.appendLog(projectId, batch, stored.revision);
      return stored;
    });
  });

  app.get<ProjectParams>('/projects/:id/document/batches', async (request) => {
    requireProject(repo, request.params.id);
    return { operationLog: repo.documents.listLog(request.params.id) };
  });
}
