import { buildServer } from './server';

const HOST = '127.0.0.1';
const DEFAULT_PORT = 4318;

function resolvePort(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid FORMA_PORT: ${raw}`);
  }
  return port;
}

const app = buildServer({ logger: true });

try {
  await app.listen({ host: HOST, port: resolvePort(process.env.FORMA_PORT) });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
