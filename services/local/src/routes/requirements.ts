import type { FastifyInstance } from 'fastify';
import { putRequirementsBody } from '../schemas';
import { parseInput } from '../validation';
import { requireProject, type ProjectParams, type RouteContext } from './support';

export function registerRequirementRoutes(app: FastifyInstance, { repo }: RouteContext): void {
  app.get<ProjectParams>('/projects/:id/requirements', async (request) => {
    requireProject(repo, request.params.id);
    return { requirements: repo.requirements.list(request.params.id) };
  });

  app.put<ProjectParams>('/projects/:id/requirements', async (request) => {
    const projectId = request.params.id;
    requireProject(repo, projectId);
    const body = parseInput(putRequirementsBody, request.body);
    return {
      requirements: repo.transaction(() =>
        repo.requirements.replaceAll(projectId, body.requirements),
      ),
    };
  });
}
