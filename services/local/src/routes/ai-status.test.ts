import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GEMINI_MODEL, type AiStatus } from '@forma/ai';
import { mockProvider } from '../ai/testing';
import { createProject, useServer } from '../testing';

const disabled: AiStatus = {
  enabled: false,
  configured: true,
  provider: 'gemini',
  model: DEFAULT_GEMINI_MODEL,
  visionModel: DEFAULT_GEMINI_MODEL,
  reason: 'disabled',
};

afterEach(() => vi.unstubAllEnvs());

describe('GET /ai/status', () => {
  const server = useServer();
  const mocked = mockProvider([]);
  const withProvider = useServer({ ai: mocked.ai });
  const switchedOff = useServer({ ai: mocked.ai, aiStatus: disabled });

  it('reports a missing key when no provider is configured', async () => {
    const response = await server().inject({ method: 'GET', url: '/ai/status' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      enabled: true,
      configured: false,
      provider: 'gemini',
      model: DEFAULT_GEMINI_MODEL,
      visionModel: DEFAULT_GEMINI_MODEL,
      reason: 'missingKey',
    });
  });

  it('reports enabled and configured, with the model ids, for a working provider', async () => {
    const response = await withProvider().inject({ method: 'GET', url: '/ai/status' });
    expect(response.json()).toEqual({
      enabled: true,
      configured: true,
      provider: 'mock',
      model: 'mock-model',
      visionModel: 'mock-model',
    });
  });

  it('reports the kill switch and never exposes secrets', async () => {
    const response = await switchedOff().inject({ method: 'GET', url: '/ai/status' });
    expect(response.json()).toEqual(disabled);
    expect(response.body.toLowerCase()).not.toContain('key":');
    expect(Object.keys(response.json())).not.toContain('apiKey');
  });

  it('does not read the environment: a key in process.env does not configure a server', async () => {
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'AIza-not-a-real-key');
    vi.stubEnv('FORMA_AI_ENABLED', 'true');
    const response = await server().inject({ method: 'GET', url: '/ai/status' });
    expect(response.json()).toMatchObject({ configured: false, reason: 'missingKey' });
    expect(response.body).not.toContain('AIza');
  });
});

describe('AI routes when the kill switch is off', () => {
  const switchedOff = useServer({ ai: mockProvider([{ requirements: [] }]).ai, aiStatus: disabled });

  it('answer 503 aiDisabled in Spanish without calling the model, keeping impact and the rest available', async () => {
    const app = switchedOff();
    const { id } = await createProject(app);
    const calls = [
      { method: 'POST', url: `/projects/${id}/ai/requirements` },
      { method: 'POST', url: `/projects/${id}/ai/proposals`, payload: {} },
      { method: 'POST', url: `/projects/${id}/ai/edit`, payload: { instruction: 'x', screenId: 's', selectedNodeIds: [] } },
    ] as const;
    for (const call of calls) {
      const response = await app.inject(call);
      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe('aiDisabled');
      expect(response.json().error.message).toContain('FORMA_AI_ENABLED');
      expect(response.json().error.message).toMatch(/desactivad/i);
    }
    expect((await app.inject({ method: 'GET', url: `/projects/${id}/ai/impact` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/projects/${id}/document` })).statusCode).toBe(200);
  });
});
