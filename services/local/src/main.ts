import { existsSync } from 'node:fs';
import { createAiProviderFromEnv } from '@forma/ai';
import { HOST, parsePort, resolveDataDir } from './config';
import { buildServer } from './server';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

// Optional local configuration; variables already set in the environment win.
for (const envFile of ['.env', '../../.env']) {
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}

let port: number;
try {
  port = parsePort(process.env.FORMA_PORT);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const ai = createAiProviderFromEnv();
const app = buildServer({ dataDir: resolveDataDir(), logger: true, ai });
app.log.info(
  ai
    ? 'AI features enabled (Gemini).'
    : 'AI features disabled: set GOOGLE_GENERATIVE_AI_API_KEY to enable them.',
);

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
