/**
 * Live smoke test against Gemini: requirements, proposals and an edit preview for the fixture
 * inventory brief. Needs GOOGLE_GENERATIVE_AI_API_KEY (see .env.example). Prints counts and titles
 * only, stops at the first provider error (printing its classified code and retry delay) and always
 * reports how many HTTP requests were sent to the API, so a quota-limited key is not wasted.
 */
import { existsSync } from 'node:fs';
import { resolveAiFromEnv } from '@forma/ai';
import { buildServer } from '../server';
import { INVENTORY_BRIEF } from './fixtures/inventory-brief';

for (const envFile of ['.env', '../../.env']) {
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}

let requests = 0;
const countingFetch: typeof fetch = (input, init) => {
  requests++;
  return fetch(input, init);
};

const { provider: ai, status } = resolveAiFromEnv(process.env, { fetch: countingFetch });
if (!ai) {
  console.error(
    status.reason === 'disabled'
      ? 'AI is switched off (FORMA_AI_ENABLED=false); nothing was sent.'
      : 'Set GOOGLE_GENERATIVE_AI_API_KEY (see .env.example) to run the live AI smoke test.',
  );
  process.exit(1);
}

const app = buildServer({ ai, aiStatus: status });

/** An error envelope returned by the local service. */
class ServiceError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> | undefined,
  ) {
    super(message);
  }
}

async function call<T>(method: 'GET' | 'POST', url: string, payload?: object): Promise<T> {
  const response = await app.inject({ method, url, ...(payload ? { payload } : {}) });
  if (response.statusCode >= 400) {
    const error = (response.json() as { error?: { code?: string; message?: string; details?: Record<string, unknown> } })
      .error;
    throw new ServiceError(
      `${method} ${url}`,
      response.statusCode,
      error?.code ?? 'unknown',
      error?.message ?? response.body.slice(0, 300),
      error?.details,
    );
  }
  return response.json<T>();
}

try {
  console.log(`model: ${status.model} (vision: ${status.visionModel})`);
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
  for (const { status: s } of requirements.requirements) byStatus[s] = (byStatus[s] ?? 0) + 1;
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

  const { document } = await call<{ document: { screens: { id: string }[] } }>(
    'GET',
    `/projects/${project.id}/document`,
  );
  const screen = document.screens[0];
  if (screen) {
    const edit = await call<{ changes: string[]; explanation: string; warnings: { code: string }[] }>(
      'POST',
      `/projects/${project.id}/ai/edit`,
      { instruction: 'Cambiá el nombre de la pantalla a «Inventario»', screenId: screen.id, selectedNodeIds: [] },
    );
    console.log(
      `edit: ${edit.changes.length} change(s)`,
      edit.changes,
      `warnings: ${edit.warnings.map((w) => w.code).join(', ') || 'none'}`,
    );
  } else {
    console.log('edit: skipped (the new project has no screen)');
  }
} catch (error) {
  if (error instanceof ServiceError) {
    const retryAfter = error.details?.retryAfterSeconds;
    console.error(
      `STOPPED at ${error.url}: ${error.code} (HTTP ${error.status})` +
        (typeof retryAfter === 'number' ? `, retryAfterSeconds=${retryAfter}` : ''),
    );
    console.error(error.message);
    if (typeof error.details?.providerMessage === 'string') {
      console.error(`provider said: ${error.details.providerMessage}`);
    }
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
} finally {
  console.log(`API requests sent: ${requests}`);
  await app.close();
}
