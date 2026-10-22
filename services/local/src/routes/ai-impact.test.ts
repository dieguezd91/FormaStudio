import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { addSource, putRequirements } from '../ai/testing';
import { createProject, sampleDocument, useServer } from '../testing';

interface Impact {
  change: { sourceId: string; sourceVersion: number; change: string };
  requirements: { id: string; referencedVersion: number }[];
  proposals: { id: string; requirementIds: string[] }[];
  screens: { screenId: string; proposalId: string; inCurrentDocument: boolean }[];
}

const requirement = (id: string, refs: { sourceId: string; sourceVersion: number }[]) => ({
  id,
  text: `Requisito ${id}`,
  kind: 'data',
  status: 'confirmed',
  sourceRefs: refs.map((r) => ({ ...r, excerpt: 'x' })),
});

const replaceContent = (app: FastifyInstance, projectId: string, sourceId: string, content: string) =>
  app.inject({
    method: 'PUT',
    url: `/projects/${projectId}/sources/${sourceId}`,
    payload: { content },
  });

const impact = async (app: FastifyInstance, projectId: string, query = '') =>
  (await app.inject({ method: 'GET', url: `/projects/${projectId}/ai/impact${query}` })).json<{
    impacts: Impact[];
  }>();

const createProposal = (app: FastifyInstance, projectId: string, requirementIds: string[]) =>
  app.inject({
    method: 'POST',
    url: `/projects/${projectId}/proposals`,
    payload: {
      title: 'Propuesta',
      summary: '',
      rationale: { need: '', patterns: [], tradeoffs: [], fromReferences: [], requirementIds },
      document: sampleDocument('P'),
      origin: 'ai',
    },
  });

describe('GET /projects/:id/ai/impact (no model involved)', () => {
  const server = useServer();

  it('lists requirements, proposals and screens affected by an updated source', async () => {
    const app = server();
    const { id } = await createProject(app);
    const a = await addSource(app, id, { title: 'A', content: 'uno' });
    const b = await addSource(app, id, { title: 'B', content: 'dos' });
    await putRequirements(app, id, [
      requirement('req_a', [{ sourceId: a.id, sourceVersion: 1 }]),
      requirement('req_b', [{ sourceId: b.id, sourceVersion: 1 }]),
      requirement('req_none', []),
    ]);
    const linked = (await createProposal(app, id, ['req_a'])).json();
    await createProposal(app, id, ['req_b']);

    await replaceContent(app, id, a.id, 'uno v2');

    const { impacts } = await impact(app, id);
    expect(impacts).toHaveLength(1);
    const [only] = impacts;
    expect(only!.change).toMatchObject({ sourceId: a.id, sourceVersion: 2, change: 'updated' });
    expect(only!.requirements).toEqual([
      expect.objectContaining({ id: 'req_a', referencedVersion: 1 }),
    ]);
    expect(only!.proposals).toEqual([
      expect.objectContaining({ id: linked.id, requirementIds: ['req_a'] }),
    ]);
    expect(only!.screens).toEqual([
      expect.objectContaining({
        screenId: 'screen_main',
        proposalId: linked.id,
        inCurrentDocument: false,
      }),
    ]);

    // Once adopted, the proposal's screen is part of the project's document.
    await app.inject({ method: 'POST', url: `/projects/${id}/proposals/${linked.id}/adopt` });
    const adopted = await impact(app, id);
    expect(adopted.impacts[0]!.screens[0]).toMatchObject({ inCurrentDocument: true });
  });

  it('ignores requirements already based on the new source version', async () => {
    const app = server();
    const { id } = await createProject(app);
    const a = await addSource(app, id, { content: 'uno' });
    await putRequirements(app, id, [
      requirement('req_old', [{ sourceId: a.id, sourceVersion: 1 }]),
      requirement('req_fresh', [{ sourceId: a.id, sourceVersion: 2 }]),
    ]);
    await replaceContent(app, id, a.id, 'uno v2');
    const { impacts } = await impact(app, id);
    expect(impacts[0]!.requirements.map((r) => r.id)).toEqual(['req_old']);
  });

  it('reports a deleted source as impacting every requirement that cites it', async () => {
    const app = server();
    const { id } = await createProject(app);
    const a = await addSource(app, id, { content: 'uno' });
    await putRequirements(app, id, [requirement('req_a', [{ sourceId: a.id, sourceVersion: 1 }])]);
    await app.inject({ method: 'DELETE', url: `/projects/${id}/sources/${a.id}` });
    const { impacts } = await impact(app, id);
    expect(impacts[0]!.change).toMatchObject({ sourceId: a.id, change: 'deleted' });
    expect(impacts[0]!.requirements.map((r) => r.id)).toEqual(['req_a']);
  });

  it('only considers changes after `since`, and never changes anything', async () => {
    const app = server();
    const { id } = await createProject(app);
    const a = await addSource(app, id, { content: 'uno' });
    await putRequirements(app, id, [requirement('req_a', [{ sourceId: a.id, sourceVersion: 1 }])]);
    await replaceContent(app, id, a.id, 'dos');
    const future = new Date(Date.now() + 60_000).toISOString();
    expect((await impact(app, id, `?since=${encodeURIComponent(future)}`)).impacts).toEqual([]);
    const past = new Date(Date.now() - 60_000).toISOString();
    expect((await impact(app, id, `?since=${encodeURIComponent(past)}`)).impacts).toHaveLength(1);

    const stored = await app.inject({ method: 'GET', url: `/projects/${id}/requirements` });
    expect(stored.json().requirements).toHaveLength(1);
    const proposals = await app.inject({ method: 'GET', url: `/projects/${id}/proposals` });
    expect(proposals.json().proposals).toEqual([]);
  });

  it('answers 400 for a malformed `since` and 404 for an unknown project', async () => {
    const app = server();
    const { id } = await createProject(app);
    expect((await app.inject({ method: 'GET', url: `/projects/${id}/ai/impact?since=yesterday` })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/projects/nope/ai/impact' })).statusCode).toBe(404);
  });
});

describe('AI routes without a provider (no API key)', () => {
  const server = useServer();
  const nullServer = useServer({ ai: null });

  it('answer 503 aiUnavailable with Spanish instructions, while the rest keeps working', async () => {
    const app = server();
    const { id } = await createProject(app);
    const calls = [
      { method: 'POST', url: `/projects/${id}/ai/requirements` },
      { method: 'POST', url: `/projects/${id}/ai/proposals`, payload: {} },
      {
        method: 'POST',
        url: `/projects/${id}/ai/edit`,
        payload: { instruction: 'x', screenId: 's', selectedNodeIds: [] },
      },
    ] as const;
    for (const call of calls) {
      const response = await app.inject(call);
      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe('aiUnavailable');
      expect(response.json().error.message).toContain('GOOGLE_GENERATIVE_AI_API_KEY');
      expect(response.json().error.message).toMatch(/clave/i);
    }

    expect((await app.inject({ method: 'GET', url: '/projects' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/projects/${id}/document` })).statusCode).toBe(200);
    expect((await createProject(app, { name: 'Otro' })).name).toBe('Otro');
    expect((await app.inject({ method: 'GET', url: `/projects/${id}/ai/impact` })).statusCode).toBe(200);
  });

  it('treats an explicit null provider like a missing one', async () => {
    const app = nullServer();
    const { id } = await createProject(app);
    const response = await app.inject({ method: 'POST', url: `/projects/${id}/ai/requirements` });
    expect(response.statusCode).toBe(503);
  });
});
