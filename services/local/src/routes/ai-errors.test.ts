import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { providerFailure, type MockResponse } from '@forma/ai/testing';
import { addSource, mockProvider, putDocument } from '../ai/testing';
import { createProject, sampleDocument, useServer } from '../testing';

const fail = (status: number, body: unknown, headers?: Record<string, string>) => () => {
  throw providerFailure(status, body, headers);
};

const quota = (quotaId: string, retryDelay = '34s') => ({
  error: {
    code: 429,
    message: 'You exceeded your current quota, please check your plan and billing details.',
    status: 'RESOURCE_EXHAUSTED',
    details: [
      { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId }] },
      { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay },
    ],
  },
});

const overloaded = {
  error: { code: 503, message: 'The model is overloaded. Please try again later.', status: 'UNAVAILABLE' },
};

type Build = (typeof routes)[number][1];

/** Every AI route that calls the model, with the project already prepared for it. */
const routes = [
  ['requirements', (id: string) => ({ method: 'POST', url: `/projects/${id}/ai/requirements` }) as const],
  ['proposals', (id: string) => ({ method: 'POST', url: `/projects/${id}/ai/proposals`, payload: {} }) as const],
  [
    'edit',
    (id: string) =>
      ({
        method: 'POST',
        url: `/projects/${id}/ai/edit`,
        payload: { instruction: 'Pintá el botón', screenId: 'screen_main', selectedNodeIds: [] },
      }) as const,
  ],
] as const;

async function run(script: MockResponse[], build: Build) {
  const provider = mockProvider(script);
  const app: FastifyInstance = useServer({ ai: provider.ai })();
  const { id } = await createProject(app);
  await addSource(app, id, { content: 'El inventario permite arrastrar objetos.' });
  await putDocument(app, id, sampleDocument());
  const response = await app.inject(build(id));
  return { response, error: response.json().error, calls: provider.model.doGenerateCalls.length };
}

describe.each(routes)('provider errors on the %s route', (_name, route) => {

  it('400 -> 502 aiRequestRejected: Gemini rejected the request format, shown with its message, no retries', async () => {
    const { response, error, calls } = await run(
      [fail(400, { error: { code: 400, message: 'Request contains an invalid argument.', status: 'INVALID_ARGUMENT' } })],
      route,
    );
    expect(response.statusCode).toBe(502);
    expect(error.code).toBe('aiRequestRejected');
    expect(error.message).toContain('Gemini rechazó el formato del pedido');
    expect(error.details.providerMessage).toBe('Request contains an invalid argument.');
    expect(calls).toBe(1);
  });

  it('401/403 -> 502 aiAuthFailed', async () => {
    for (const status of [401, 403]) {
      const { response, error, calls } = await run([fail(status, { error: { message: 'denied' } })], route);
      expect(response.statusCode).toBe(502);
      expect(error.code).toBe('aiAuthFailed');
      expect(error.message).toMatch(/clave no es válida o no tiene acceso/);
      expect(calls).toBe(1);
    }
  });

  it('429 on the free tier -> 429 aiQuotaExceeded with retryAfterSeconds, one request only', async () => {
    const { response, error, calls } = await run(
      [fail(429, quota('GenerateRequestsPerDayPerProjectPerModel-FreeTier', '34s'))],
      route,
    );
    expect(response.statusCode).toBe(429);
    expect(error.code).toBe('aiQuotaExceeded');
    expect(error.details).toMatchObject({ retryAfterSeconds: 34, freeTier: true, daily: true });
    expect(error.message).toMatch(/nivel gratuito/);
    expect(error.message).toMatch(/Google AI Pro/);
    expect(error.message).toMatch(/facturación/);
    expect(error.message).toContain('34');
    expect(calls).toBe(1);
  });

  it('429 on a paid quota does not claim the free tier', async () => {
    const { error } = await run([fail(429, quota('GenerateContentRequestsPerMinute'))], route);
    expect(error.code).toBe('aiQuotaExceeded');
    expect(error.message).not.toMatch(/nivel gratuito/);
    expect(error.details.freeTier).toBe(false);
  });

  it('503 -> one retry, then 503 aiOverloaded (2 requests)', async () => {
    const { response, error, calls } = await run([fail(503, overloaded), fail(503, overloaded)], route);
    expect(response.statusCode).toBe(503);
    expect(error.code).toBe('aiOverloaded');
    expect(error.message).toMatch(/saturado, probá en unos minutos/);
    expect(calls).toBe(2);
  });

  it('timeouts -> 504 aiTimeout', async () => {
    const timeout = () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    };
    const { response, error } = await run([timeout], route);
    expect(response.statusCode).toBe(504);
    expect(error.code).toBe('aiTimeout');
  });

  it('other failures -> 502 aiProviderError, with a neutral message and no retries', async () => {
    const { response, error, calls } = await run([fail(500, { error: { message: 'internal' } })], route);
    expect(response.statusCode).toBe(502);
    expect(error.code).toBe('aiProviderError');
    expect(calls).toBe(1);
  });
});

describe('overload retry and request counts', () => {
  it('recovers from a single 503 transparently', async () => {
    const provider = mockProvider([fail(503, overloaded), { requirements: [] }]);
    const app = useServer({ ai: provider.ai })();
    const { id } = await createProject(app);
    await addSource(app, id, { content: 'Texto.' });
    const response = await app.inject({ method: 'POST', url: `/projects/${id}/ai/requirements` });
    expect(response.statusCode).toBe(200);
    expect(provider.model.doGenerateCalls).toHaveLength(2);
  });

  it('puts retryAfterSeconds from RetryInfo on aiOverloaded', async () => {
    const body = {
      error: {
        ...overloaded.error,
        details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '12s' }],
      },
    };
    const { error } = await run([fail(503, body), fail(503, body)], routes[0][1]);
    expect(error.details).toMatchObject({ retryAfterSeconds: 12 });
  });

  it('requirements: an invalid answer, then a 429, stops at 2 requests (no validation retry after a provider error)', async () => {
    const { error, calls } = await run(
      [{ requirements: [{ text: '' }] }, fail(429, quota('x-FreeTier'))],
      routes[0][1],
    );
    expect(error.code).toBe('aiQuotaExceeded');
    expect(calls).toBe(2);
  });

  it('worst case per AI call is 3 requests: invalid answer, validation retry, one overload retry', async () => {
    const { error, calls } = await run(
      [{ requirements: [{ text: '' }] }, fail(503, overloaded), fail(503, overloaded), { requirements: [] }],
      routes[0][1],
    );
    expect(error.code).toBe('aiOverloaded');
    expect(calls).toBe(3);
  });
});
