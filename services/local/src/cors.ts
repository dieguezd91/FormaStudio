import type { FastifyInstance } from 'fastify';
import { forbiddenOrigin } from './errors';

/** Vite dev server, plus the opaque `null` origin Electron sends when loading from file://. */
export const ALLOWED_ORIGINS: readonly string[] = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'null',
];

const ALLOWED_METHODS = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
const PREFLIGHT_MAX_AGE_SECONDS = '600';

/**
 * Browser requests must come from a renderer origin; anything else is rejected outright rather
 * than merely left without CORS headers, so a web page cannot trigger side effects blindly.
 * Requests without an `Origin` header (Node clients, tests) are unaffected.
 */
export function registerCors(
  app: FastifyInstance,
  allowedOrigins: readonly string[] = ALLOWED_ORIGINS,
): void {
  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (origin === undefined) return;
    if (!allowedOrigins.includes(origin)) throw forbiddenOrigin();

    reply.header('access-control-allow-origin', origin).header('vary', 'Origin');
    if (request.method === 'OPTIONS' && request.headers['access-control-request-method']) {
      return reply
        .code(204)
        .header('access-control-allow-methods', ALLOWED_METHODS)
        .header(
          'access-control-allow-headers',
          request.headers['access-control-request-headers'] ?? 'content-type',
        )
        .header('access-control-max-age', PREFLIGHT_MAX_AGE_SECONDS)
        .send();
    }
  });
}
