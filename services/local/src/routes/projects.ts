import type { FastifyInstance } from 'fastify';
import { createEmptyDocument } from '@forma/design-core';
import { notFound } from '../errors';
import { createProjectBody, renameProjectBody } from '../schemas';
import { parseInput } from '../validation';
import { requireProject, type ProjectParams, type RouteContext } from './support';

export function registerProjectRoutes(app: FastifyInstance, { repo }: RouteContext): void {
  app.post('/projects', async (request, reply) => {
    const body = parseInput(createProjectBody, request.body);
    const project = repo.transaction(() => {
      const created = repo.projects.create(body);
      const document = createEmptyDocument(body);
      const stored = repo.documents.create(created.id, document);
      repo.versions.create(created.id, {
        label: 'Initial draft',
        document,
        documentRevision: stored.revision,
      });
      return created;
    });
    return reply.code(201).send(project);
  });

  app.get('/projects', async () => ({ projects: repo.projects.list() }));

  app.get<ProjectParams>('/projects/:id', async (request) =>
    requireProject(repo, request.params.id),
  );

  app.patch<ProjectParams>('/projects/:id', async (request) => {
    const { name } = parseInput(renameProjectBody, request.body);
    const project = repo.projects.rename(request.params.id, name);
    if (!project) throw notFound('Project');
    return project;
  });

  app.delete<ProjectParams>('/projects/:id', async (request, reply) => {
    repo.transaction(() => {
      if (!repo.projects.delete(request.params.id)) throw notFound('Project');
      repo.sources.pruneBlobs();
    });
    return reply.code(204).send();
  });
}
