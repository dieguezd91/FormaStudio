import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

export function buildServer(options: FastifyServerOptions = {}): FastifyInstance {
  const app = Fastify(options);

  app.get('/health', async () => ({ ok: true }));

  return app;
}
