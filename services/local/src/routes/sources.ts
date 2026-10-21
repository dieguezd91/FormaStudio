import type { FastifyInstance } from 'fastify';
import { notFound, payloadTooLarge } from '../errors';
import { createSourceBody, replaceSourceBody, sourceChangesQuery } from '../schemas';
import { parseInput } from '../validation';
import { requireProject, type ProjectParams, type RouteContext } from './support';

interface SourceParams {
  Params: { id: string; sourceId: string };
}

/** Decoded size of a validated base64 string, without decoding it. */
function decodedLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return (base64.length / 4) * 3 - padding;
}

export function registerSourceRoutes(
  app: FastifyInstance,
  { repo, maxSourceBytes }: RouteContext,
): void {
  /** Enforces the size limit on whichever payload is present and decodes binary data. */
  const readPayload = (content: string | undefined, dataBase64: string | undefined) => {
    if (content !== undefined && Buffer.byteLength(content) > maxSourceBytes) {
      throw payloadTooLarge(maxSourceBytes);
    }
    if (dataBase64 !== undefined && decodedLength(dataBase64) > maxSourceBytes) {
      throw payloadTooLarge(maxSourceBytes);
    }
    return {
      content,
      data: dataBase64 === undefined ? undefined : Buffer.from(dataBase64, 'base64'),
    };
  };

  const requireSource = (projectId: string, sourceId: string) => {
    requireProject(repo, projectId);
    const source = repo.sources.get(projectId, sourceId);
    if (!source) throw notFound('Source');
    return source;
  };

  app.post<ProjectParams>('/projects/:id/sources', async (request, reply) => {
    const projectId = request.params.id;
    requireProject(repo, projectId);
    const body = parseInput(createSourceBody, request.body);
    const payload = readPayload(body.content, body.dataBase64);
    const source = repo.transaction(() =>
      repo.sources.create(projectId, {
        kind: body.kind,
        title: body.title,
        mimeType: body.mimeType,
        scope: body.scope,
        intent: body.intent ?? [],
        provenance: body.provenance ?? {},
        ...payload,
      }),
    );
    return reply.code(201).send(source);
  });

  app.get<ProjectParams>('/projects/:id/sources', async (request) => {
    requireProject(repo, request.params.id);
    return { sources: repo.sources.list(request.params.id) };
  });

  app.get<SourceParams>('/projects/:id/sources/:sourceId', async (request) =>
    requireSource(request.params.id, request.params.sourceId),
  );

  app.get<SourceParams>('/projects/:id/sources/:sourceId/blob', async (request, reply) => {
    requireProject(repo, request.params.id);
    const blob = repo.sources.getBlob(request.params.id, request.params.sourceId);
    if (!blob) throw notFound('Source blob');
    return reply
      .header('content-type', blob.mimeType)
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', "default-src 'none'; sandbox")
      .send(blob.data);
  });

  app.put<SourceParams>('/projects/:id/sources/:sourceId', async (request) => {
    const { id, sourceId } = request.params;
    requireSource(id, sourceId);
    const body = parseInput(replaceSourceBody, request.body);
    const payload = readPayload(body.content, body.dataBase64);
    return repo.transaction(() =>
      repo.sources.replace(id, sourceId, {
        title: body.title,
        mimeType: body.mimeType,
        ...payload,
      }),
    );
  });

  app.delete<SourceParams>('/projects/:id/sources/:sourceId', async (request, reply) => {
    const { id, sourceId } = request.params;
    requireProject(repo, id);
    repo.transaction(() => {
      if (!repo.sources.delete(id, sourceId)) throw notFound('Source');
    });
    return reply.code(204).send();
  });

  app.get<ProjectParams>('/projects/:id/source-changes', async (request) => {
    requireProject(repo, request.params.id);
    const { since } = parseInput(sourceChangesQuery, request.query);
    return {
      changes: repo.sources.listChanges(
        request.params.id,
        since === undefined ? undefined : new Date(since).toISOString(),
      ),
    };
  });
}
