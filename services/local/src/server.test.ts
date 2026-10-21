import { describe, expect, it } from 'vitest';
import { useServer } from './testing';

describe('local service', () => {
  const server = useServer();

  it('GET /health responds ok', async () => {
    const response = await server().inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it('answers unknown routes with the JSON error envelope', async () => {
    const response = await server().inject({ method: 'GET', url: '/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { code: 'notFound', message: expect.any(String) } });
  });

  it('answers malformed JSON with 400 and no stack trace', async () => {
    const response = await server().inject({
      method: 'POST',
      url: '/projects',
      headers: { 'content-type': 'application/json' },
      payload: '{not json',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('badRequest');
    expect(response.body).not.toContain('node_modules');
  });

  it('treats an empty JSON body as an absent body', async () => {
    const response = await server().inject({
      method: 'POST',
      url: '/projects',
      headers: { 'content-type': 'application/json' },
      payload: '',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('badRequest');
  });
});

describe('CORS', () => {
  const server = useServer();

  it.each(['http://localhost:5173', 'http://127.0.0.1:5173', 'null'])(
    'allows the renderer origin %s',
    async (origin) => {
      const response = await server().inject({
        method: 'GET',
        url: '/health',
        headers: { origin },
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe(origin);
      expect(response.headers.vary).toContain('Origin');
    },
  );

  it('answers preflight for an allowed origin', async () => {
    const response = await server().inject({
      method: 'OPTIONS',
      url: '/projects',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'PATCH',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(response.headers['access-control-allow-methods']).toContain('PATCH');
    expect(response.headers['access-control-allow-headers']).toContain('content-type');
  });

  it('rejects any other origin', async () => {
    const response = await server().inject({
      method: 'GET',
      url: '/projects',
      headers: { origin: 'https://evil.example' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('forbiddenOrigin');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('adds no CORS headers for requests without an origin', async () => {
    const response = await server().inject({ method: 'GET', url: '/health' });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
