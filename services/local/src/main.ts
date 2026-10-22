import { existsSync } from 'node:fs';
import { resolveAiFromEnv } from '@forma/ai';
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

// The only place that reads the environment for AI; tests build servers with an injected provider.
const { provider: ai, status: aiStatus } = resolveAiFromEnv();
const app = buildServer({ dataDir: resolveDataDir(), logger: true, ai, aiStatus });
app.log.info(
  aiStatus.reason === 'disabled'
    ? 'AI features switched off (FORMA_AI_ENABLED=false).'
    : aiStatus.reason === 'missingKey'
      ? 'AI features disabled: set GOOGLE_GENERATIVE_AI_API_KEY to enable them.'
      : `AI features enabled (Gemini, model ${aiStatus.model}).`,
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
