import { describe, expect, it } from 'vitest';
import { createProject, getDocument, useServer } from '../testing';

describe('projects', () => {
  const server = useServer();

  it('creates a project with an initial draft version 1 and an empty document', async () => {
    const app = server();
    const response = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: { name: 'Inventory', target: { platform: 'unity', ui: 'ugui' } },
    });
    expect(response.statusCode).toBe(201);
    const project = response.json();
    expect(project).toMatchObject({
      name: 'Inventory',
      target: { platform: 'unity', ui: 'ugui' },
    });
    expect(project.id).toEqual(expect.any(String));

    const { document, revision } = await getDocument(app, project.id);
    expect(revision).toBe(1);
    expect(document).toMatchObject({
      name: 'Inventory',
      target: { platform: 'unity' },
      screens: [],
    });

    const versions = (
      await app.inject({ method: 'GET', url: `/projects/${project.id}/versions` })
    ).json();
    expect(versions.versions).toHaveLength(1);
    expect(versions.versions[0]).toMatchObject({ number: 1, status: 'draft' });
    expect(versions.versions[0]).not.toHaveProperty('document');
  });

  it.each([
    [{}],
    [{ name: '', target: { platform: 'unity' } }],
    [{ name: 'x', target: { platform: 'console' } }],
    [{ name: 'x' }],
  ])('rejects invalid body %j with 400 and issues', async (payload) => {
    const response = await server().inject({ method: 'POST', url: '/projects', payload });
    expect(response.statusCode).toBe(400);
    const { error } = response.json();
    expect(error.code).toBe('badRequest');
    expect(error.issues.length).toBeGreaterThan(0);
  });

  it('lists projects most recently updated first', async () => {
    const app = server();
    const a = await createProject(app, { name: 'A' });
    await new Promise((r) => setTimeout(r, 5));
    const b = await createProject(app, { name: 'B' });
    await new Promise((r) => setTimeout(r, 5));
    await app.inject({ method: 'PATCH', url: `/projects/${a.id}`, payload: { name: 'A2' } });

    const { projects } = (await app.inject({ method: 'GET', url: '/projects' })).json();
    expect(projects.map((p: { id: string }) => p.id)).toEqual([a.id, b.id]);
    expect(projects[0].name).toBe('A2');
  });

  it('gets, renames and deletes a project', async () => {
    const app = server();
    const { id } = await createProject(app);

    const got = await app.inject({ method: 'GET', url: `/projects/${id}` });
    expect(got.statusCode).toBe(200);
    expect(got.json().id).toBe(id);

    const patched = await app.inject({
      method: 'PATCH',
      url: `/projects/${id}`,
      payload: { name: 'Renamed' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().name).toBe('Renamed');

    const deleted = await app.inject({ method: 'DELETE', url: `/projects/${id}` });
    expect(deleted.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/projects/${id}` })).statusCode).toBe(404);
  });

  it('answers 404 for unknown project ids on every project route', async () => {
    const app = server();
    const routes: [string, string][] = [
      ['GET', '/projects/nope'],
      ['PATCH', '/projects/nope'],
      ['DELETE', '/projects/nope'],
      ['GET', '/projects/nope/document'],
      ['GET', '/projects/nope/versions'],
      ['GET', '/projects/nope/sources'],
      ['GET', '/projects/nope/source-changes'],
      ['GET', '/projects/nope/requirements'],
      ['GET', '/projects/nope/proposals'],
    ];
    for (const [method, url] of routes) {
      const response = await app.inject({
        method: method as 'GET',
        url,
        ...(method === 'PATCH' ? { payload: { name: 'x' } } : {}),
      });
      expect(response.statusCode, `${method} ${url}`).toBe(404);
      expect(response.json().error.code).toBe('notFound');
    }
  });

  it('cascades deletion to documents, versions, sources, requirements and proposals', async () => {
    const app = server();
    const { id } = await createProject(app);
    await app.inject({
      method: 'POST',
      url: `/projects/${id}/sources`,
      payload: {
        kind: 'document',
        title: 'Brief',
        mimeType: 'text/markdown',
        content: '# hi',
        scope: { level: 'project' },
      },
    });
    await app.inject({ method: 'DELETE', url: `/projects/${id}` });
    const other = await createProject(app, { name: 'Other' });
    expect(
      (await app.inject({ method: 'GET', url: `/projects/${other.id}/sources` })).json().sources,
    ).toEqual([]);
    expect((await app.inject({ method: 'GET', url: `/projects/${id}/versions` })).statusCode).toBe(
      404,
    );
  });
});
