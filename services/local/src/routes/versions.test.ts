import { describe, expect, it } from 'vitest';
import { addScreenBatch, createProject, getDocument, useServer } from '../testing';

interface VersionMeta {
  id: string;
  number: number;
  label: string;
  status: string;
}

describe('versions', () => {
  const server = useServer();

  const snapshot = (projectId: string, label: string, note?: string) =>
    server().inject({
      method: 'POST',
      url: `/projects/${projectId}/versions`,
      payload: { label, ...(note === undefined ? {} : { note }) },
    });

  const list = async (projectId: string) =>
    (await server().inject({ method: 'GET', url: `/projects/${projectId}/versions` })).json()
      .versions as VersionMeta[];

  const approve = (projectId: string, versionId: string) =>
    server().inject({
      method: 'POST',
      url: `/projects/${projectId}/versions/${versionId}/approve`,
    });

  it('snapshots the current document as a new draft version', async () => {
    const app = server();
    const { id } = await createProject(app);
    await app.inject({
      method: 'POST',
      url: `/projects/${id}/document/batches`,
      payload: { batch: addScreenBatch(), baseRevision: 1 },
    });
    const response = await snapshot(id, 'With screen', 'first pass');
    expect(response.statusCode).toBe(201);
    const version = response.json();
    expect(version).toMatchObject({
      number: 2,
      label: 'With screen',
      note: 'first pass',
      status: 'draft',
    });
    expect(version).not.toHaveProperty('document');

    const full = (
      await app.inject({ method: 'GET', url: `/projects/${id}/versions/${version.id}` })
    ).json();
    expect(full.document.screens).toHaveLength(1);
  });

  it('lists versions without payloads, newest first', async () => {
    const { id } = await createProject(server());
    await snapshot(id, 'Second');
    const versions = await list(id);
    expect(versions.map((v) => v.number)).toEqual([2, 1]);
    expect(versions[0]).not.toHaveProperty('document');
  });

  it('answers 404 for an unknown version and for a version of another project', async () => {
    const app = server();
    const a = await createProject(app, { name: 'A' });
    const b = await createProject(app, { name: 'B' });
    const version = (await snapshot(a.id, 'v')).json();
    const unknown = await app.inject({ method: 'GET', url: `/projects/${a.id}/versions/nope` });
    expect(unknown.statusCode).toBe(404);
    const foreign = await app.inject({
      method: 'GET',
      url: `/projects/${b.id}/versions/${version.id}`,
    });
    expect(foreign.statusCode).toBe(404);
  });

  it('keeps a single approved version, superseding the previous one', async () => {
    const app = server();
    const { id } = await createProject(app);
    const first = (await list(id))[0]!;
    const second = (await snapshot(id, 'Second')).json();

    const approved = await approve(id, first.id);
    expect(approved.statusCode).toBe(200);
    expect(approved.json().status).toBe('approved');

    await approve(id, second.id);
    const statuses = Object.fromEntries((await list(id)).map((v) => [v.number, v.status]));
    expect(statuses).toEqual({ 1: 'superseded', 2: 'approved' });
  });

  it('approving the already approved version is idempotent', async () => {
    const { id } = await createProject(server());
    const first = (await list(id))[0]!;
    await approve(id, first.id);
    await approve(id, first.id);
    expect((await list(id))[0]!.status).toBe('approved');
  });

  it('restores a snapshot as a new revision without deleting history', async () => {
    const app = server();
    const { id } = await createProject(app);
    const first = (await list(id))[0]!;
    await app.inject({
      method: 'POST',
      url: `/projects/${id}/document/batches`,
      payload: { batch: addScreenBatch(), baseRevision: 1 },
    });
    expect((await getDocument(app, id)).document.screens).toHaveLength(1);

    const restored = await app.inject({
      method: 'POST',
      url: `/projects/${id}/versions/${first.id}/restore`,
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json().revision).toBe(3);
    expect(restored.json().document.screens).toHaveLength(0);
    expect((await getDocument(app, id)).revision).toBe(3);
    expect(await list(id)).toHaveLength(1);
  });

  it('rejects a restore with a stale baseRevision', async () => {
    const app = server();
    const { id } = await createProject(app);
    const first = (await list(id))[0]!;
    const response = await app.inject({
      method: 'POST',
      url: `/projects/${id}/versions/${first.id}/restore`,
      payload: { baseRevision: 99 },
    });
    expect(response.statusCode).toBe(409);
  });

  it('rejects a snapshot without a label', async () => {
    const { id } = await createProject(server());
    const response = await server().inject({
      method: 'POST',
      url: `/projects/${id}/versions`,
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });
});
