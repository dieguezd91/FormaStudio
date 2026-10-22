/**
 * Live smoke test against Gemini: requirements + proposals for the fixture inventory brief.
 * Needs GOOGLE_GENERATIVE_AI_API_KEY (see .env.example). Prints counts and titles only.
 */
import { existsSync } from 'node:fs';
import { createAiProviderFromEnv } from '@forma/ai';
import { buildServer } from '../server';
import { INVENTORY_BRIEF } from './fixtures/inventory-brief';

for (const envFile of ['.env', '../../.env']) {
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}

const ai = createAiProviderFromEnv();
if (!ai) {
  console.error('Set GOOGLE_GENERATIVE_AI_API_KEY (see .env.example) to run the live AI smoke test.');
  process.exit(1);
}

const app = buildServer({ ai });

async function call<T>(method: 'GET' | 'POST', url: string, payload?: object): Promise<T> {
  const response = await app.inject({ method, url, ...(payload ? { payload } : {}) });
  if (response.statusCode >= 400) {
    throw new Error(`${method} ${url} -> ${response.statusCode}: ${response.body.slice(0, 500)}`);
  }
  return response.json<T>();
}

try {
  const project = await call<{ id: string }>('POST', '/projects', {
    name: 'AI smoke',
    target: { platform: 'unity', ui: 'ugui' },
  });
  await call('POST', `/projects/${project.id}/sources`, {
    kind: 'document',
    title: 'Brief de inventario',
    mimeType: 'text/markdown',
    content: INVENTORY_BRIEF,
    scope: { level: 'project' },
  });

  const requirements = await call<{
    requirements: { text: string; kind: string; status: string }[];
    warnings: { code: string }[];
  }>('POST', `/projects/${project.id}/ai/requirements`);
  const byStatus: Record<string, number> = {};
  for (const { status } of requirements.requirements) byStatus[status] = (byStatus[status] ?? 0) + 1;
  console.log(
    `requirements: ${requirements.requirements.length}`,
    byStatus,
    `warnings: ${requirements.warnings.map((w) => w.code).join(', ') || 'none'}`,
  );

  const proposals = await call<{
    proposals: { title: string }[];
    warnings: { code: string }[];
  }>('POST', `/projects/${project.id}/ai/proposals`, { count: 3, brief: 'Inventario de un RPG de acción' });
  console.log(
    `proposals: ${proposals.proposals.length} ->`,
    proposals.proposals.map((p) => p.title),
    `warnings: ${proposals.warnings.map((w) => w.code).join(', ') || 'none'}`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await app.close();
}
