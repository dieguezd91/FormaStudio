import { createGoogle } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';

/**
 * Current stable Gemini Flash model listed on ai.google.dev/gemini-api/docs/models (2026-10-21).
 * Override with `FORMA_AI_MODEL`; stable ids are preferred over previews for production use.
 */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

/** Only a 503/overloaded answer is retried, and only briefly; every other provider error is final. */
export interface ProviderRetryPolicy {
  /** Extra requests allowed per AI call after an overloaded answer. */
  overloadedRetries: number;
  /** Wait before the retry; 0 retries immediately (tests). */
  backoffMs: number;
}

export const DEFAULT_PROVIDER_RETRY: ProviderRetryPolicy = { overloadedRetries: 1, backoffMs: 1500 };

export interface AiProviderConfig {
  apiKey: string;
  /** Text/structured-output model id. */
  model?: string;
  /** Model used when the request contains images; defaults to `model`. */
  visionModel?: string;
  providerRetry?: ProviderRetryPolicy;
  /** Custom fetch, e.g. to count the requests sent. */
  fetch?: typeof globalThis.fetch;
}

export interface AiProvider {
  id: string;
  model: LanguageModel;
  visionModel: LanguageModel;
  /** Defaults to {@link DEFAULT_PROVIDER_RETRY} when absent. */
  providerRetry?: ProviderRetryPolicy | undefined;
}

/** Gemini is the only implementation for now; callers depend only on `AiProvider`. */
export function createAiProvider(config: AiProviderConfig): AiProvider {
  const google = createGoogle({
    apiKey: config.apiKey,
    ...(config.fetch === undefined ? {} : { fetch: config.fetch }),
  });
  const modelId = config.model ?? DEFAULT_GEMINI_MODEL;
  return {
    id: 'gemini',
    model: google(modelId),
    visionModel: google(config.visionModel ?? modelId),
    providerRetry: config.providerRetry ?? DEFAULT_PROVIDER_RETRY,
  };
}

/** What `GET /ai/status` reports. Never contains the key. */
export interface AiStatus {
  /** The kill switch (`FORMA_AI_ENABLED`) is not off. */
  enabled: boolean;
  /** An API key is available. AI is usable only when both `enabled` and `configured`. */
  configured: boolean;
  provider: string;
  model: string;
  visionModel: string;
  /** Why AI is not usable; `disabled` wins over `missingKey`. */
  reason?: 'disabled' | 'missingKey';
}

const nonBlank = (value: string | undefined): string | undefined =>
  value === undefined || value.trim() === '' ? undefined : value.trim();

const OFF_VALUES = new Set(['false', '0', 'off', 'no']);

/** `FORMA_AI_ENABLED`: on unless explicitly `false`/`0` (also `off`/`no`). */
export function parseAiEnabled(raw: string | undefined): boolean {
  return !OFF_VALUES.has((raw ?? '').trim().toLowerCase());
}

function statusOf(
  enabled: boolean,
  configured: boolean,
  models: { provider?: string; model: string; visionModel: string },
): AiStatus {
  const reason = !enabled ? 'disabled' : !configured ? 'missingKey' : undefined;
  return {
    enabled,
    configured,
    provider: models.provider ?? 'gemini',
    model: models.model,
    visionModel: models.visionModel,
    ...(reason === undefined ? {} : { reason }),
  };
}

const modelIdOf = (model: LanguageModel): string =>
  typeof model === 'string' ? model : model.modelId;

/** Status of an injected provider (or `null` for none); the kill switch is only read from the environment. */
export function aiStatusFor(provider: AiProvider | null): AiStatus {
  return provider === null
    ? statusOf(true, false, { model: DEFAULT_GEMINI_MODEL, visionModel: DEFAULT_GEMINI_MODEL })
    : statusOf(true, true, {
        provider: provider.id,
        model: modelIdOf(provider.model),
        visionModel: modelIdOf(provider.visionModel),
      });
}

/**
 * Reads the AI configuration from the environment. No provider is built when `FORMA_AI_ENABLED`
 * turns AI off (even with a key) or when `GOOGLE_GENERATIVE_AI_API_KEY` is missing.
 */
export function resolveAiFromEnv(
  env: Record<string, string | undefined> = process.env,
  extra: Pick<AiProviderConfig, 'fetch' | 'providerRetry'> = {},
): { provider: AiProvider | null; status: AiStatus } {
  const apiKey = nonBlank(env.GOOGLE_GENERATIVE_AI_API_KEY);
  const enabled = parseAiEnabled(env.FORMA_AI_ENABLED);
  const model = nonBlank(env.FORMA_AI_MODEL);
  const visionModel = nonBlank(env.FORMA_AI_VISION_MODEL);
  const status = statusOf(enabled, apiKey !== undefined, {
    model: model ?? DEFAULT_GEMINI_MODEL,
    visionModel: visionModel ?? model ?? DEFAULT_GEMINI_MODEL,
  });
  if (!enabled || apiKey === undefined) return { provider: null, status };
  return {
    provider: createAiProvider({
      apiKey,
      ...(model === undefined ? {} : { model }),
      ...(visionModel === undefined ? {} : { visionModel }),
      ...extra,
    }),
    status,
  };
}

/** Returns `null` when AI is switched off or `GOOGLE_GENERATIVE_AI_API_KEY` is not set. */
export function createAiProviderFromEnv(
  env: Record<string, string | undefined> = process.env,
  extra: Pick<AiProviderConfig, 'fetch' | 'providerRetry'> = {},
): AiProvider | null {
  return resolveAiFromEnv(env, extra).provider;
}
