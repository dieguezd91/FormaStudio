import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from './client';
import { ApiError, isServiceUnavailable } from './errors';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('api client', () => {
  it('calls the configured base url and unwraps list envelopes', async () => {
    const fetch = vi.fn(async () => json(200, { projects: [{ id: 'p1' }] }));
    const client = createApiClient({ baseUrl: 'http://x:1/', fetch });
    await expect(client.listProjects()).resolves.toEqual([{ id: 'p1' }]);
    expect(fetch).toHaveBeenCalledWith('http://x:1/projects', { method: 'GET' });
  });

  it('sends batches with the base revision', async () => {
    const fetch = vi.fn(async () => json(200, { document: {}, revision: 3 }));
    const client = createApiClient({ fetch });
    const batch = { id: 'b', label: 'l', source: 'manual' as const, ops: [] };
    await client.applyBatch('p 1', batch, 2);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/projects\/p%201\/document\/batches$/);
    expect(JSON.parse(init.body as string)).toEqual({ batch, baseRevision: 2 });
  });

  it('turns a network failure into an unavailable error with a Spanish message', async () => {
    const client = createApiClient({
      fetch: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    const error = await client.listProjects().catch((e: unknown) => e);
    expect(isServiceUnavailable(error)).toBe(true);
    expect((error as ApiError).message).toContain('servicio local');
  });

  it('maps the 409 envelope to a conflict error', async () => {
    const client = createApiClient({
      fetch: async () =>
        json(409, { error: { code: 'revisionConflict', message: 'changed', details: { currentRevision: 7 } } }),
    });
    const error = (await client.getDocument('p').catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.kind).toBe('conflict');
    expect(error.status).toBe(409);
    expect(error.details).toEqual({ currentRevision: 7 });
  });

  it('maps 422 to a rejected error carrying a Spanish reason', async () => {
    const client = createApiClient({
      fetch: async () => json(422, { error: { code: 'locked', message: "Node 'x' is locked" } }),
    });
    const error = (await client.getDocument('p').catch((e: unknown) => e)) as ApiError;
    expect(error.kind).toBe('rejected');
    expect(error.message).toContain('bloqueado');
    expect(error.serverMessage).toBe("Node 'x' is locked");
  });

  it('copes with non-JSON error bodies', async () => {
    const client = createApiClient({ fetch: async () => new Response('boom', { status: 500 }) });
    const error = (await client.getDocument('p').catch((e: unknown) => e)) as ApiError;
    expect(error.kind).toBe('server');
  });

  it('returns undefined for 204 responses', async () => {
    const client = createApiClient({ fetch: async () => new Response(null, { status: 204 }) });
    await expect(client.deleteSource('p', 's')).resolves.toBeUndefined();
  });
});
