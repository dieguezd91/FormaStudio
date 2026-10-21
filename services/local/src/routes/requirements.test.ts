import { describe, expect, it } from 'vitest';
import { createProject, useServer } from '../testing';

const requirement = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  text: `Requirement ${id}`,
  kind: 'goal',
  status: 'confirmed',
  sourceRefs: [{ sourceId: 'src_1', sourceVersion: 1, excerpt: 'tabs and stacks' }],
  ...overrides,
});

describe('requirements', () => {
  const server = useServer();

  const put = (projectId: string, payload: object) =>
    server().inject({ method: 'PUT', url: `/projects/${projectId}/requirements`, payload });

  it('starts empty', async () => {
    const { id } = await createProject(server());
    const response = await server().inject({ method: 'GET', url: `/projects/${id}/requirements` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ requirements: [] });
  });

  it('replaces the whole set preserving order and source references', async () => {
    const { id } = await createProject(server());
    const first = [
      requirement('r2'),
      requirement('r1', { kind: 'flow', status: 'gap', sourceRefs: [] }),
    ];
    expect((await put(id, { requirements: first })).statusCode).toBe(200);
    const got = (
      await server().inject({ method: 'GET', url: `/projects/${id}/requirements` })
    ).json();
    expect(got.requirements).toEqual(first);

    await put(id, { requirements: [requirement('r3', { status: 'assumed' })] });
    const replaced = (
      await server().inject({ method: 'GET', url: `/projects/${id}/requirements` })
    ).json();
    expect(replaced.requirements.map((r: { id: string }) => r.id)).toEqual(['r3']);
  });

  it('allows the same requirement id in different projects', async () => {
    const a = await createProject(server(), { name: 'A' });
    const b = await createProject(server(), { name: 'B' });
    expect((await put(a.id, { requirements: [requirement('r1')] })).statusCode).toBe(200);
    expect((await put(b.id, { requirements: [requirement('r1')] })).statusCode).toBe(200);
  });

  it.each([
    ['unknown kind', { requirements: [requirement('r1', { kind: 'wish' })] }],
    ['unknown status', { requirements: [requirement('r1', { status: 'maybe' })] }],
    ['duplicate ids', { requirements: [requirement('r1'), requirement('r1')] }],
    ['bad source ref', { requirements: [requirement('r1', { sourceRefs: [{ sourceId: 's' }] })] }],
    ['missing list', {}],
  ])('rejects %s with 400 and keeps the previous set', async (_name, payload) => {
    const { id } = await createProject(server());
    await put(id, { requirements: [requirement('keep')] });
    const response = await put(id, payload);
    expect(response.statusCode).toBe(400);
    const got = (
      await server().inject({ method: 'GET', url: `/projects/${id}/requirements` })
    ).json();
    expect(got.requirements.map((r: { id: string }) => r.id)).toEqual(['keep']);
  });
});
