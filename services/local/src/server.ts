import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { aiStatusFor, type AiProvider, type AiStatus } from '@forma/ai';
import { DEFAULT_AI_LIMITS } from './ai/limits';
import { DB_FILE_NAME } from './config';
import { registerCors } from './cors';
import { openRepository } from './db';
import { forwardSlashes, resolveUnityPackagePath } from './export/unity-project';
import { registerErrorHandling } from './errors';
import { registerAiRoutes } from './routes/ai';
import { registerDocumentRoutes } from './routes/document';
import { registerExportRoutes } from './routes/exports';
import { registerProjectRoutes } from './routes/projects';
import { registerProposalRoutes } from './routes/proposals';
import { registerRequirementRoutes } from './routes/requirements';
import { registerSourceRoutes } from './routes/sources';
import type { RouteContext } from './routes/support';
import { registerVersionRoutes } from './routes/versions';

export const DEFAULT_MAX_SOURCE_BYTES = 15 * 1024 * 1024;

/** Room for the JSON envelope around a base64 payload (and for document/batch bodies). */
const BODY_OVERHEAD_BYTES = 1024 * 1024;

export interface ServerOptions {
  /** SQLite file, or `:memory:`. Wins over `dataDir`. */
  dbPath?: string;
  /** Directory holding `forma.sqlite`; created if missing. Without it (and `dbPath`) data is in memory. */
  dataDir?: string;
  /** Largest accepted source payload after decoding. */
  maxSourceBytes?: number;
  logger?: boolean;
  /** AI provider (Gemini, or a mock in tests). Without one, AI routes answer 503 and nothing else changes. */
  ai?: AiProvider | null;
  /**
   * Reported by `GET /ai/status`. `enabled: false` switches AI off even if `ai` is given. Derived
   * from `ai` when absent; the environment is only read by `main.ts`, never here.
   */
  aiStatus?: AiStatus;
  /** Largest image/blob sent to the model, in bytes (§15.2). */
  maxAiBlobBytes?: number;
  /** Longest text source sent to the model, in characters. */
  maxAiTextChars?: number;
  /** Unity package folder; defaults to `FORMA_UNITY_PACKAGE_PATH` or the repo's `unity/com.forma.studio`. */
  unityPackagePath?: string;
}

function resolveDbPath({ dbPath, dataDir }: ServerOptions): string {
  if (dbPath !== undefined) return dbPath;
  if (dataDir === undefined) return ':memory:';
  mkdirSync(dataDir, { recursive: true });
  return join(dataDir, DB_FILE_NAME);
}

export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const maxSourceBytes = options.maxSourceBytes ?? DEFAULT_MAX_SOURCE_BYTES;
  const app = Fastify({
    logger: options.logger ?? false,
    // base64 inflates binary payloads by 4/3.
    bodyLimit: Math.ceil((maxSourceBytes * 4) / 3) + BODY_OVERHEAD_BYTES,
  });

  // Same prototype-poisoning protection as Fastify's parser, but an empty body means "no body"
  // so action endpoints (approve, restore, adopt) can be called with a JSON content type.
  const parseJson = app.getDefaultJsonParser('error', 'error');
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    if (body === '') return done(null, undefined);
    parseJson(request, body as string, done);
  });

  registerErrorHandling(app);
  registerCors(app);

  const repo = openRepository(resolveDbPath(options));
  app.addHook('onClose', async () => repo.close());

  const context: RouteContext = {
    repo,
    maxSourceBytes,
    ai: options.ai ?? null,
    aiStatus: options.aiStatus ?? aiStatusFor(options.ai ?? null),
    unityPackagePath: options.unityPackagePath
      ? forwardSlashes(options.unityPackagePath)
      : resolveUnityPackagePath(),
    aiLimits: {
      ...DEFAULT_AI_LIMITS,
      ...(options.maxAiBlobBytes === undefined ? {} : { maxBlobBytes: options.maxAiBlobBytes }),
      ...(options.maxAiTextChars === undefined ? {} : { maxTextChars: options.maxAiTextChars }),
    },
  };
  app.get('/health', async () => ({ ok: true }));
  registerProjectRoutes(app, context);
  registerDocumentRoutes(app, context);
  registerVersionRoutes(app, context);
  registerSourceRoutes(app, context);
  registerRequirementRoutes(app, context);
  registerProposalRoutes(app, context);
  registerAiRoutes(app, context);
  registerExportRoutes(app, context);

  return app;
}
