import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from './client';
import { ApiError, isAborted, isAiUnavailable, isServiceUnavailable } from './errors';

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

describe('api client · AI', () => {
  it('maps the 503 aiUnavailable envelope to a typed error naming the env var', async () => {
    const client = createApiClient({
      fetch: async () => json(503, { error: { code: 'aiUnavailable', message: 'missing key' } }),
    });
    const error = await client.extractRequirements('p').catch((e: unknown) => e);
    expect(isAiUnavailable(error)).toBe(true);
    expect((error as ApiError).message).toContain('GOOGLE_GENERATIVE_AI_API_KEY');
    expect((error as ApiError).message).toContain('manual');
  });

  it('maps provider and validation failures (502) to an AI failure with the Spanish service message', async () => {
    const client = createApiClient({
      fetch: async () => json(502, { error: { code: 'aiInvalidOutput', message: 'La IA devolvió una respuesta inválida.' } }),
    });
    const error = (await client.generateProposals('p', {}).catch((e: unknown) => e)) as ApiError;
    expect(error.kind).toBe('aiFailed');
    expect(error.message).toBe('La IA devolvió una respuesta inválida.');
  });

  it('keeps the Spanish node-specific reason when an AI edit is rejected with 422', async () => {
    const client = createApiClient({
      fetch: async () =>
        json(422, { error: { code: 'locked', message: 'La edición no se puede aplicar: el nodo «Panel» está bloqueado.' } }),
    });
    const error = (await client
      .previewEdit('p', { instruction: 'x', screenId: 's', selectedNodeIds: [] })
      .catch((e: unknown) => e)) as ApiError;
    expect(error.kind).toBe('rejected');
    expect(error.message).toBe('La edición no se puede aplicar: el nodo «Panel» está bloqueado.');
  });

  it('reports an aborted request as aborted, not as a service outage', async () => {
    const controller = new AbortController();
    const client = createApiClient({
      fetch: async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    });
    const pending = client.extractRequirements('p', undefined, controller.signal).catch((e: unknown) => e);
    controller.abort();
    const error = await pending;
    expect(isAborted(error)).toBe(true);
    expect(isServiceUnavailable(error)).toBe(false);
  });

  it('posts AI requests with their bodies and the abort signal', async () => {
    const fetch = vi.fn(async () => json(200, {}));
    const client = createApiClient({ fetch });
    const { signal } = new AbortController();
    await client.extractRequirements('p', ['s1'], signal);
    await client.generateProposals('p', { count: 2, brief: 'b' });
    const [url1, init1] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url1).toMatch(/\/projects\/p\/ai\/requirements$/);
    expect(JSON.parse(init1.body as string)).toEqual({ sourceIds: ['s1'] });
    expect(init1.signal).toBe(signal);
    const [url2, init2] = fetch.mock.calls[1] as unknown as [string, RequestInit];
    expect(url2).toMatch(/\/projects\/p\/ai\/proposals$/);
    expect(JSON.parse(init2.body as string)).toEqual({ count: 2, brief: 'b' });
  });

  it('builds the proposal, adopt, requirements and impact calls', async () => {
    const fetch = vi.fn(async () => json(200, { proposals: [], requirements: [] }));
    const client = createApiClient({ baseUrl: 'http://x', fetch });
    await client.listProposals('p');
    await client.setProposalStatus('p', 'q', 'discarded');
    await client.adoptProposal('p', 'q', 4);
    await client.getImpact('p', '2026-01-01T00:00:00.000Z');
    await client.listRequirements('p');
    const calls = fetch.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0]?.[0]).toBe('http://x/projects/p/proposals');
    expect(calls[1]?.[0]).toBe('http://x/projects/p/proposals/q');
    expect(calls[1]?.[1].method).toBe('PATCH');
    expect(JSON.parse(calls[1]?.[1].body as string)).toEqual({ status: 'discarded' });
    expect(calls[2]?.[0]).toBe('http://x/projects/p/proposals/q/adopt');
    expect(JSON.parse(calls[2]?.[1].body as string)).toEqual({ baseRevision: 4 });
    expect(calls[3]?.[0]).toBe('http://x/projects/p/ai/impact?since=2026-01-01T00%3A00%3A00.000Z');
    expect(calls[4]?.[0]).toBe('http://x/projects/p/requirements');
  });
});

describe('api client · export', () => {
  it('posts the analysis with the Unity folder only when there is one', async () => {
    const fetch = vi.fn(async () => json(200, { report: {}, diff: null, unity: null }));
    const client = createApiClient({ fetch });
    await client.analyzeExport('p 1', 's1');
    await client.analyzeExport('p 1', 's1', 'D:/Proyectos/Juego');
    const bodies = fetch.mock.calls.map(
      (call) => JSON.parse((call as unknown as [string, RequestInit])[1].body as string) as unknown,
    );
    expect(bodies).toEqual([{ screenId: 's1' }, { screenId: 's1', unityProjectPath: 'D:/Proyectos/Juego' }]);
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toMatch(/\/projects\/p%201\/exports\/ugui\/analyze$/);
  });

  it('unwraps the export history', async () => {
    const client = createApiClient({ fetch: async () => json(200, { exports: [{ id: 'e1' }] }) });
    await expect(client.listExports('p')).resolves.toEqual([{ id: 'e1' }]);
  });

  it('shows the Spanish reason of a refused export or an invalid folder as is', async () => {
    const refused = createApiClient({
      fetch: async () =>
        json(422, { error: { code: 'invalidDocument', message: 'El nodo «Panel» referencia algo que no existe.' } }),
    });
    const error422 = (await refused
      .exportUgui('p', { screenId: 's', unityProjectPath: '/juego' })
      .catch((e: unknown) => e)) as ApiError;
    expect(error422.kind).toBe('rejected');
    expect(error422.message).toBe('El nodo «Panel» referencia algo que no existe.');

    const badFolder = createApiClient({
      fetch: async () => json(400, { error: { code: 'invalidExportPath', message: 'La carpeta «x» no existe.' } }),
    });
    const error400 = (await badFolder.installFormaPackage('p', 'x').catch((e: unknown) => e)) as ApiError;
    expect(error400.kind).toBe('invalid');
    expect(error400.message).toBe('La carpeta «x» no existe.');
  });
});
