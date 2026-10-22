import { describe, expect, it } from 'vitest';
import {
  aiStatusFor,
  createAiProvider,
  createAiProviderFromEnv,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_PROVIDER_RETRY,
  parseAiEnabled,
  resolveAiFromEnv,
} from './provider';

const modelId = (model: unknown) => (model as { modelId: string }).modelId;

describe('createAiProvider', () => {
  it('uses Gemini with the documented stable default for text and vision', () => {
    const provider = createAiProvider({ apiKey: 'test-key' });
    expect(provider.id).toBe('gemini');
    expect(DEFAULT_GEMINI_MODEL).toBe('gemini-3.8-flash');
    expect(modelId(provider.model)).toBe(DEFAULT_GEMINI_MODEL);
    expect(modelId(provider.visionModel)).toBe(DEFAULT_GEMINI_MODEL);
  });

  it('honors explicit model ids', () => {
    const provider = createAiProvider({ apiKey: 'k', model: 'gemini-x', visionModel: 'gemini-y' });
    expect(modelId(provider.model)).toBe('gemini-x');
    expect(modelId(provider.visionModel)).toBe('gemini-y');
  });
});

describe('createAiProviderFromEnv', () => {
  it('returns null without an API key (blank counts as missing)', () => {
    expect(createAiProviderFromEnv({})).toBeNull();
    expect(createAiProviderFromEnv({ GOOGLE_GENERATIVE_AI_API_KEY: '  ' })).toBeNull();
  });

  it('reads the key and model overrides from the environment', () => {
    const provider = createAiProviderFromEnv({
      GOOGLE_GENERATIVE_AI_API_KEY: 'k',
      FORMA_AI_MODEL: 'gemini-a',
      FORMA_AI_VISION_MODEL: 'gemini-b',
    });
    expect(modelId(provider?.model)).toBe('gemini-a');
    expect(modelId(provider?.visionModel)).toBe('gemini-b');
  });

  it('lets the vision model follow FORMA_AI_MODEL when not set separately', () => {
    const provider = createAiProviderFromEnv({
      GOOGLE_GENERATIVE_AI_API_KEY: 'k',
      FORMA_AI_MODEL: 'gemini-a',
    });
    expect(modelId(provider?.visionModel)).toBe('gemini-a');
  });
});

describe('FORMA_AI_ENABLED kill switch', () => {
  const key = { GOOGLE_GENERATIVE_AI_API_KEY: 'k' };

  it('is on by default and for any value other than false/0', () => {
    for (const value of [undefined, '', 'true', '1', 'yes', 'TRUE']) {
      expect(parseAiEnabled(value), String(value)).toBe(true);
    }
  });

  it.each(['false', 'FALSE', ' false ', '0', 'off', 'no'])('%j disables AI', (value) => {
    expect(parseAiEnabled(value)).toBe(false);
  });

  it('builds no provider when disabled, even with a key, and reports why', () => {
    const { provider, status } = resolveAiFromEnv({ ...key, FORMA_AI_ENABLED: 'false' });
    expect(provider).toBeNull();
    expect(status).toEqual({
      enabled: false,
      configured: true,
      provider: 'gemini',
      model: DEFAULT_GEMINI_MODEL,
      visionModel: DEFAULT_GEMINI_MODEL,
      reason: 'disabled',
    });
    expect(createAiProviderFromEnv({ ...key, FORMA_AI_ENABLED: '0' })).toBeNull();
  });

  it('reports a missing key without a provider', () => {
    const { provider, status } = resolveAiFromEnv({ FORMA_AI_MODEL: 'gemini-a' });
    expect(provider).toBeNull();
    expect(status).toMatchObject({ enabled: true, configured: false, model: 'gemini-a', reason: 'missingKey' });
  });

  it('prefers "disabled" over "missingKey" when both apply', () => {
    expect(resolveAiFromEnv({ FORMA_AI_ENABLED: 'false' }).status.reason).toBe('disabled');
  });

  it('is usable when enabled and configured, with model ids and no secrets', () => {
    const { provider, status } = resolveAiFromEnv({ ...key, FORMA_AI_MODEL: 'gemini-a', FORMA_AI_VISION_MODEL: 'gemini-b' });
    expect(provider).not.toBeNull();
    expect(status).toEqual({
      enabled: true,
      configured: true,
      provider: 'gemini',
      model: 'gemini-a',
      visionModel: 'gemini-b',
    });
    expect(JSON.stringify(status)).not.toContain('"k"');
  });

  it('derives a status from an injected provider', () => {
    const provider = createAiProvider({ apiKey: 'k', model: 'gemini-a' });
    expect(aiStatusFor(provider)).toMatchObject({ enabled: true, configured: true, model: 'gemini-a' });
    expect(aiStatusFor(null)).toMatchObject({ enabled: true, configured: false, reason: 'missingKey' });
  });
});

describe('provider retry policy', () => {
  it('defaults to a single short overload retry and can be configured', () => {
    expect(createAiProvider({ apiKey: 'k' }).providerRetry).toEqual(DEFAULT_PROVIDER_RETRY);
    expect(DEFAULT_PROVIDER_RETRY.overloadedRetries).toBe(1);
    const custom = createAiProvider({ apiKey: 'k', providerRetry: { overloadedRetries: 0, backoffMs: 0 } });
    expect(custom.providerRetry).toEqual({ overloadedRetries: 0, backoffMs: 0 });
  });
});
