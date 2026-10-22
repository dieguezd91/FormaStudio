import { describe, expect, it } from 'vitest';
import { createAiProvider, createAiProviderFromEnv, DEFAULT_GEMINI_MODEL } from './provider';

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
