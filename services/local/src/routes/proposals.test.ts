import { describe, expect, it } from 'vitest';
import {
  createProject,
  getDocument,
  sampleDocument,
  structurallyBrokenDocument,
  useServer,
} from '../testing';

const proposalBody = (overrides: Record<string, unknown> = {}) => ({
  title: 'Tabbed grid',
  summary: 'Grid with category tabs',
  rationale: {
    need: 'Browse many items',
    patterns: ['tabs'],
    tradeoffs: ['more clicks'],
    fromReferences: ['src_1'],
    requirementIds: ['r1'],
  },
  document: sampleDocument('Proposal doc'),
  origin: 'ai',
  ...overrides,
});

describe('proposals', () => {
  const server = useServer();

  const create = (projectId: string, overrides: Record<string, unknown> = {}) =>
    server().inject({
      method: 'POST',
      url: `/projects/${projectId}/proposals`,
      payload: proposalBody(overrides),
    });

  const list = async (projectId: string, query = '') =>
    (
      await server().inject({ method: 'GET', url: `/projects/${projectId}/proposals${query}` })
    ).json().proposals as { id: string; status: string; title: string }[];

  it('creates a candidate proposal and returns metadata without the document', async () => {
    const { id } = await createProject(server());
    const response = await create(id);
    expect(response.statusCode).toBe(201);
    const proposal = response.json();
    expect(proposal).toMatchObject({
      title: 'Tabbed grid',
      summary: 'Grid with category tabs',
      origin: 'ai',
      status: 'candidate',
      rationale: { patterns: ['tabs'], requirementIds: ['r1'] },
    });
    expect(proposal).not.toHaveProperty('document');
  });

  it('returns the full proposal with its document', async () => {
    const { id } = await createProject(server());
    const proposal = (await create(id)).json();
    const got = await server().inject({
      method: 'GET',
      url: `/projects/${id}/proposals/${proposal.id}`,
    });
    expect(got.statusCode).toBe(200);
    expect(got.json().document.name).toBe('Proposal doc');
  });

  it('rejects an invalid or structurally broken document', async () => {
    const { id } = await createProject(server());
    const garbage = await create(id, { document: { nope: true } });
    expect(garbage.statusCode).toBe(422);
    expect(garbage.json().error.code).toBe('invalidDocument');
    const broken = await create(id, { document: structurallyBrokenDocument() });
    expect(broken.statusCode).toBe(422);
    expect(await list(id)).toEqual([]);
  });

  it.each([
    ['unknown origin', { origin: 'oracle' }],
    ['missing title', { title: '' }],
    ['missing rationale', { rationale: undefined }],
  ])('rejects %s with 400', async (_name, overrides) => {
    const { id } = await createProject(server());
    expect((await create(id, overrides)).statusCode).toBe(400);
  });

  it('discards softly and recovers a discarded proposal', async () => {
    const app = server();
    const { id } = await createProject(app);
    const proposal = (await create(id)).json();
    const patch = (status: string) =>
      app.inject({
        method: 'PATCH',
        url: `/projects/${id}/proposals/${proposal.id}`,
        payload: { status },
      });

    expect((await patch('discarded')).json().status).toBe('discarded');
    const discarded = await list(id);
    expect(discarded).toHaveLength(1);
    expect(discarded[0]!.status).toBe('discarded');
    const full = await app.inject({
      method: 'GET',
      url: `/projects/${id}/proposals/${proposal.id}`,
    });
    expect(full.json().document.name).toBe('Proposal doc');

    expect((await patch('candidate')).json().status).toBe('candidate');
  });

  it('filters the list by status', async () => {
    const app = server();
    const { id } = await createProject(app);
    const a = (await create(id, { title: 'A' })).json();
    await create(id, { title: 'B' });
    await app.inject({
      method: 'PATCH',
      url: `/projects/${id}/proposals/${a.id}`,
      payload: { status: 'discarded' },
    });
    expect((await list(id, '?status=candidate')).map((p) => p.title)).toEqual(['B']);
    expect(await list(id)).toHaveLength(2);
  });

  it('rejects adopting through PATCH: adoption only goes through the adopt route', async () => {
    const app = server();
    const { id } = await createProject(app);
    const proposal = (await create(id)).json();
    const response = await app.inject({
      method: 'PATCH',
      url: `/projects/${id}/proposals/${proposal.id}`,
      payload: { status: 'adopted' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('badRequest');
    expect((await list(id))[0]!.status).toBe('candidate');
    expect((await getDocument(app, id)).revision).toBe(1);
  });

  it('rejects an unknown status', async () => {
    const { id } = await createProject(server());
    const proposal = (await create(id)).json();
    const response = await server().inject({
      method: 'PATCH',
      url: `/projects/${id}/proposals/${proposal.id}`,
      payload: { status: 'deleted' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('adopts a proposal: replaces the document with a new revision and keeps other proposals', async () => {
    const app = server();
    const { id } = await createProject(app);
    const chosen = (await create(id, { title: 'Chosen' })).json();
    const other = (
      await create(id, { title: 'Other', document: sampleDocument('Other doc') })
    ).json();

    const adopted = await app.inject({
      method: 'POST',
      url: `/projects/${id}/proposals/${chosen.id}/adopt`,
    });
    expect(adopted.statusCode).toBe(200);
    const body = adopted.json();
    expect(body.revision).toBe(2);
    expect(body.document.name).toBe('Proposal doc');
    expect(body.proposal).toMatchObject({ id: chosen.id, status: 'adopted' });

    const current = await getDocument(app, id);
    expect(current.revision).toBe(2);
    expect(current.document.name).toBe('Proposal doc');

    const proposals = await list(id);
    expect(proposals.find((p) => p.id === other.id)?.status).toBe('candidate');
    expect(proposals).toHaveLength(2);
  });

  it('adopting with a stale baseRevision answers 409 and changes nothing', async () => {
    const app = server();
    const { id } = await createProject(app);
    const proposal = (await create(id)).json();
    const response = await app.inject({
      method: 'POST',
      url: `/projects/${id}/proposals/${proposal.id}/adopt`,
      payload: { baseRevision: 7 },
    });
    expect(response.statusCode).toBe(409);
    expect((await getDocument(app, id)).revision).toBe(1);
    expect((await list(id))[0]!.status).toBe('candidate');
  });

  it('answers 404 for unknown proposals', async () => {
    const { id } = await createProject(server());
    const app = server();
    expect(
      (await app.inject({ method: 'GET', url: `/projects/${id}/proposals/nope` })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'POST', url: `/projects/${id}/proposals/nope/adopt` }))
        .statusCode,
    ).toBe(404);
  });
});
