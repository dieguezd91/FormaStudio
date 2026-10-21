import { describe, expect, it } from 'vitest';
import { createProject, PNG_BASE64, useServer } from '../testing';

const docBody = {
  kind: 'document',
  title: 'Inventory brief',
  mimeType: 'text/markdown',
  content: '# Inventory\nTabs and stacks.',
  scope: { level: 'project' },
};

const imageBody = {
  kind: 'reference',
  title: 'Diablo grid',
  mimeType: 'image/png',
  dataBase64: PNG_BASE64,
  scope: { level: 'screen', targetId: 'screen_main' },
  intent: ['hierarchy', 'visual-style'],
  provenance: { url: 'https://example.com/shot', author: 'someone', license: 'CC-BY', notes: 'n' },
};

describe('sources', () => {
  const server = useServer();

  const post = (projectId: string, payload: object) =>
    server().inject({ method: 'POST', url: `/projects/${projectId}/sources`, payload });

  it('stores a text document and returns it with its content', async () => {
    const { id } = await createProject(server());
    const created = await post(id, docBody);
    expect(created.statusCode).toBe(201);
    const meta = created.json();
    expect(meta).toMatchObject({
      kind: 'document',
      title: 'Inventory brief',
      mimeType: 'text/markdown',
      scope: { level: 'project' },
      intent: [],
      sourceVersion: 1,
      hasBlob: false,
    });
    expect(meta).not.toHaveProperty('content');

    const got = await server().inject({ method: 'GET', url: `/projects/${id}/sources/${meta.id}` });
    expect(got.statusCode).toBe(200);
    expect(got.json()).toMatchObject({ id: meta.id, content: docBody.content });
  });

  it('stores an image reference as a blob served with its content type', async () => {
    const app = server();
    const { id } = await createProject(app);
    const meta = (await post(id, imageBody)).json();
    expect(meta).toMatchObject({
      hasBlob: true,
      intent: ['hierarchy', 'visual-style'],
      provenance: imageBody.provenance,
      scope: { level: 'screen', targetId: 'screen_main' },
      sizeBytes: Buffer.from(PNG_BASE64, 'base64').length,
    });

    const blob = await app.inject({
      method: 'GET',
      url: `/projects/${id}/sources/${meta.id}/blob`,
    });
    expect(blob.statusCode).toBe(200);
    expect(blob.headers['content-type']).toBe('image/png');
    expect(blob.headers['x-content-type-options']).toBe('nosniff');
    expect(blob.rawPayload.equals(Buffer.from(PNG_BASE64, 'base64'))).toBe(true);
  });

  it('answers 404 for the blob of a text-only source', async () => {
    const { id } = await createProject(server());
    const meta = (await post(id, docBody)).json();
    const blob = await server().inject({
      method: 'GET',
      url: `/projects/${id}/sources/${meta.id}/blob`,
    });
    expect(blob.statusCode).toBe(404);
  });

  it('lists metadata only', async () => {
    const { id } = await createProject(server());
    await post(id, docBody);
    await post(id, imageBody);
    const { sources } = (
      await server().inject({ method: 'GET', url: `/projects/${id}/sources` })
    ).json();
    expect(sources).toHaveLength(2);
    for (const source of sources) expect(source).not.toHaveProperty('content');
  });

  it.each([
    ['both content and data', { ...docBody, dataBase64: PNG_BASE64 }],
    ['invalid base64', { ...imageBody, dataBase64: 'not base64!' }],
    ['unknown kind', { ...docBody, kind: 'video' }],
    ['unknown intent', { ...imageBody, intent: ['vibes'] }],
    ['unknown scope level', { ...docBody, scope: { level: 'galaxy' } }],
    ['screen scope without target', { ...docBody, scope: { level: 'screen' } }],
    ['malformed mime type', { ...docBody, mimeType: 'text' }],
  ])('rejects %s with 400', async (_name, payload) => {
    const { id } = await createProject(server());
    const response = await post(id, payload);
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('badRequest');
  });

  it('replaces content, bumps sourceVersion and records a source change', async () => {
    const app = server();
    const { id } = await createProject(app);
    const meta = (await post(id, docBody)).json();
    const before = new Date(Date.now() - 1000).toISOString();

    const replaced = await app.inject({
      method: 'PUT',
      url: `/projects/${id}/sources/${meta.id}`,
      payload: { content: 'new text' },
    });
    expect(replaced.statusCode).toBe(200);
    expect(replaced.json().sourceVersion).toBe(2);

    const got = (
      await app.inject({ method: 'GET', url: `/projects/${id}/sources/${meta.id}` })
    ).json();
    expect(got.content).toBe('new text');

    const { changes } = (
      await app.inject({ method: 'GET', url: `/projects/${id}/source-changes?since=${before}` })
    ).json();
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ sourceId: meta.id, sourceVersion: 2, change: 'updated' });
  });

  it('filters source changes by since', async () => {
    const app = server();
    const { id } = await createProject(app);
    const meta = (await post(id, docBody)).json();
    await app.inject({
      method: 'PUT',
      url: `/projects/${id}/sources/${meta.id}`,
      payload: { content: 'v2' },
    });
    const future = new Date(Date.now() + 60_000).toISOString();
    const { changes } = (
      await app.inject({ method: 'GET', url: `/projects/${id}/source-changes?since=${future}` })
    ).json();
    expect(changes).toEqual([]);
    const all = (await app.inject({ method: 'GET', url: `/projects/${id}/source-changes` })).json();
    expect(all.changes).toHaveLength(1);
  });

  it('rejects a malformed since with 400', async () => {
    const { id } = await createProject(server());
    const response = await server().inject({
      method: 'GET',
      url: `/projects/${id}/source-changes?since=yesterday`,
    });
    expect(response.statusCode).toBe(400);
  });

  it('replaces an image blob and serves the new bytes', async () => {
    const app = server();
    const { id } = await createProject(app);
    const meta = (await post(id, imageBody)).json();
    const bytes = Buffer.from('GIF89a-fake');
    await app.inject({
      method: 'PUT',
      url: `/projects/${id}/sources/${meta.id}`,
      payload: { dataBase64: bytes.toString('base64'), mimeType: 'image/gif' },
    });
    const blob = await app.inject({
      method: 'GET',
      url: `/projects/${id}/sources/${meta.id}/blob`,
    });
    expect(blob.headers['content-type']).toBe('image/gif');
    expect(blob.rawPayload.equals(bytes)).toBe(true);
  });

  it('rejects a replacement carrying neither content nor data', async () => {
    const { id } = await createProject(server());
    const meta = (await post(id, docBody)).json();
    const response = await server().inject({
      method: 'PUT',
      url: `/projects/${id}/sources/${meta.id}`,
      payload: { title: 'only title' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('deletes a source, records the deletion and keeps blobs used by other sources', async () => {
    const app = server();
    const { id } = await createProject(app);
    const a = (await post(id, imageBody)).json();
    const b = (await post(id, { ...imageBody, title: 'same bytes' })).json();

    const deleted = await app.inject({ method: 'DELETE', url: `/projects/${id}/sources/${a.id}` });
    expect(deleted.statusCode).toBe(204);
    expect(
      (await app.inject({ method: 'GET', url: `/projects/${id}/sources/${a.id}` })).statusCode,
    ).toBe(404);

    const blob = await app.inject({ method: 'GET', url: `/projects/${id}/sources/${b.id}/blob` });
    expect(blob.statusCode).toBe(200);

    const { changes } = (
      await app.inject({ method: 'GET', url: `/projects/${id}/source-changes` })
    ).json();
    expect(changes).toMatchObject([{ sourceId: a.id, change: 'deleted' }]);
  });

  it('accepts an image just under the default 15 MB limit and rejects one just over it', async () => {
    const app = server();
    const { id } = await createProject(app);
    const limit = 15 * 1024 * 1024;
    const send = (size: number) =>
      post(id, { ...imageBody, dataBase64: Buffer.alloc(size, 7).toString('base64') });

    const ok = await send(limit);
    expect(ok.statusCode).toBe(201);
    expect(ok.json().sizeBytes).toBe(limit);

    const tooBig = await send(limit + 1);
    expect(tooBig.statusCode).toBe(413);
    expect(tooBig.json().error.code).toBe('payloadTooLarge');
  });

  it('answers 404 for a source of another project', async () => {
    const app = server();
    const a = await createProject(app, { name: 'A' });
    const b = await createProject(app, { name: 'B' });
    const meta = (await post(a.id, docBody)).json();
    const response = await app.inject({
      method: 'GET',
      url: `/projects/${b.id}/sources/${meta.id}`,
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('source size limit', () => {
  const server = useServer({ maxSourceBytes: 1024 });

  it('enforces the configurable limit with 413', async () => {
    const { id } = await createProject(server());
    const response = await server().inject({
      method: 'POST',
      url: `/projects/${id}/sources`,
      payload: { ...docBody, content: 'x'.repeat(2048) },
    });
    expect(response.statusCode).toBe(413);
    expect(response.json().error.code).toBe('payloadTooLarge');
  });

  it('accepts content within the limit', async () => {
    const { id } = await createProject(server());
    const response = await server().inject({
      method: 'POST',
      url: `/projects/${id}/sources`,
      payload: { ...docBody, content: 'x'.repeat(512) },
    });
    expect(response.statusCode).toBe(201);
  });
});
