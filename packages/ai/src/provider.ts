import { createGoogle } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';

/**
 * Current stable Gemini Flash model listed on ai.google.dev/gemini-api/docs/models (2026-10-21).
 * Override with `FORMA_AI_MODEL`; stable ids are preferred over previews for production use.
 */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

export interface AiProviderConfig {
  apiKey: string;
  /** Text/structured-output model id. */
  model?: string;
  /** Model used when the request contains images; defaults to `model`. */
  visionModel?: string;
}

export interface AiProvider {
  id: string;
  model: LanguageModel;
  visionModel: LanguageModel;
}

/** Gemini is the only implementation for now; callers depend only on `AiProvider`. */
export function createAiProvider(config: AiProviderConfig): AiProvider {
  const google = createGoogle({ apiKey: config.apiKey });
  const modelId = config.model ?? DEFAULT_GEMINI_MODEL;
  return {
    id: 'gemini',
    model: google(modelId),
    visionModel: google(config.visionModel ?? modelId),
  };
}

const nonBlank = (value: string | undefined): string | undefined =>
  value === undefined || value.trim() === '' ? undefined : value.trim();

/** Returns `null` when `GOOGLE_GENERATIVE_AI_API_KEY` is not set, so AI features stay disabled. */
export function createAiProviderFromEnv(
  env: Record<string, string | undefined> = process.env,
): AiProvider | null {
  const apiKey = nonBlank(env.GOOGLE_GENERATIVE_AI_API_KEY);
  if (apiKey === undefined) return null;
  const model = nonBlank(env.FORMA_AI_MODEL);
  const visionModel = nonBlank(env.FORMA_AI_VISION_MODEL);
  return createAiProvider({
    apiKey,
    ...(model === undefined ? {} : { model }),
    ...(visionModel === undefined ? {} : { visionModel }),
  });
}
