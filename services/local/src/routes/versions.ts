import type { FastifyInstance } from 'fastify';
import { notFound } from '../errors';
import { createVersionBody, optionalRevisionBody } from '../schemas';
import { parseInput } from '../validation';
import {
  assertRevision,
  currentDocument,
  requireProject,
  type ProjectParams,
  type RouteContext,
} from './support';

interface VersionParams {
  Params: { id: string; versionId: string };
}

export function registerVersionRoutes(app: FastifyInstance, { repo }: RouteContext): void {
  const requireVersion = (projectId: string, versionId: string) => {
    requireProject(repo, projectId);
    const version = repo.versions.get(projectId, versionId);
    if (!version) throw notFound('Version');
    return version;
  };

  app.post<ProjectParams>('/projects/:id/versions', async (request, reply) => {
    const projectId = request.params.id;
    requireProject(repo, projectId);
    const body = parseInput(createVersionBody, request.body);
    const version = repo.transaction(() => {
      const current = currentDocument(repo, projectId);
      return repo.versions.create(projectId, {
        ...body,
        document: current.document,
        documentRevision: current.revision,
      });
    });
    return reply.code(201).send(version);
  });

  app.get<ProjectParams>('/projects/:id/versions', async (request) => {
    requireProject(repo, request.params.id);
    return { versions: repo.versions.list(request.params.id) };
  });

  app.get<VersionParams>('/projects/:id/versions/:versionId', async (request) =>
    requireVersion(request.params.id, request.params.versionId),
  );

  app.post<VersionParams>('/projects/:id/versions/:versionId/approve', async (request) => {
    const { id, versionId } = request.params;
    requireVersion(id, versionId);
    return repo.transaction(() => repo.versions.approve(id, versionId));
  });

  app.post<VersionParams>('/projects/:id/versions/:versionId/restore', async (request) => {
    const { id, versionId } = request.params;
    const version = requireVersion(id, versionId);
    const body = parseInput(optionalRevisionBody, request.body);
    return repo.transaction(() => {
      assertRevision(currentDocument(repo, id), body?.baseRevision);
      return repo.documents.replace(id, version.document);
    });
  });
}
