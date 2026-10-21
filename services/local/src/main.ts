import { HOST, parsePort, resolveDataDir } from './config';
import { buildServer } from './server';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

let port: number;
try {
  port = parsePort(process.env.FORMA_PORT);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const app = buildServer({ dataDir: resolveDataDir(), logger: true });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });
}

try {
  await app.listen({ host: HOST, port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
