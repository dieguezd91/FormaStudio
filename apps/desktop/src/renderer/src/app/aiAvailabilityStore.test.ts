import { describe, expect, it, vi } from 'vitest';
import { ApiError, serviceUnavailableError } from '@/api/errors';
import type { AiStatus } from '@/api/types';
import { createAiAvailabilityStore } from './aiAvailabilityStore';

const status = (over: Partial<AiStatus> = {}): AiStatus => ({
  enabled: true,
  configured: true,
  provider: 'gemini',
  model: 'm',
  visionModel: 'm',
  ...over,
});

const setup = (answer: () => Promise<AiStatus>) => {
  const api = { getAiStatus: vi.fn(answer) };
  const store = createAiAvailabilityStore(api, () => 5_000);
  return { api, store };
};

describe('ai availability store', () => {
  it('starts checking, without blocking anything', () => {
    const { store } = setup(async () => status());
    expect(store.getState().availability).toBe('checking');
  });

  it.each([
    [status(), 'available'],
    [status({ enabled: false, reason: 'disabled' }), 'disabled'],
    [status({ configured: false, reason: 'missingKey' }), 'missingKey'],
  ] as const)('load() maps %j to %s', async (answer, expected) => {
    const { store } = setup(async () => answer);
    await store.getState().load();
    expect(store.getState().availability).toBe(expected);
    expect(store.getState().status).toEqual(answer);
  });

  it('becomes unknown when the service cannot be reached and recovers on a later load', async () => {
    const answers: (() => Promise<AiStatus>)[] = [
      async () => {
        throw serviceUnavailableError();
      },
      async () => status(),
    ];
    const { store } = setup(() => answers.shift()!());
    await store.getState().load();
    expect(store.getState().availability).toBe('unknown');
    await store.getState().load();
    expect(store.getState().availability).toBe('available');
  });

  it('reportError flips the permanent states and reportSuccess restores availability', async () => {
    const { store } = setup(async () => status());
    await store.getState().load();
    store
      .getState()
      .reportError(new ApiError({ kind: 'aiDisabled', status: 503, code: 'aiDisabled', message: 'x' }));
    expect(store.getState().availability).toBe('disabled');
    store
      .getState()
      .reportError(new ApiError({ kind: 'aiUnavailable', status: 503, code: 'aiUnavailable', message: 'x' }));
    expect(store.getState().availability).toBe('missingKey');
    store.getState().reportSuccess();
    expect(store.getState().availability).toBe('available');
  });

  it('a quota error is transient: AI stays available, retry-after is recorded, success clears it', async () => {
    const { store } = setup(async () => status());
    await store.getState().load();
    store.getState().reportError(
      new ApiError({
        kind: 'aiQuota',
        status: 429,
        code: 'aiQuotaExceeded',
        message: 'cuota',
        details: { retryAfterSeconds: 120 },
      }),
    );
    expect(store.getState().availability).toBe('available');
    expect(store.getState().transient).toEqual({ kind: 'quota', message: 'cuota', retryAfterSeconds: 120, until: 125_000 });
    store.getState().reportSuccess();
    expect(store.getState().transient).toBeNull();
  });

  it('load() clears a transient issue (the "Reintentar" link)', async () => {
    const { store } = setup(async () => status());
    store.getState().reportError(new ApiError({ kind: 'aiOverloaded', status: 503, code: 'aiOverloaded', message: 'saturado' }));
    expect(store.getState().transient?.kind).toBe('overloaded');
    await store.getState().load();
    expect(store.getState().transient).toBeNull();
  });

  it('ignores errors that say nothing about availability', async () => {
    const { store } = setup(async () => status());
    await store.getState().load();
    store.getState().reportError(new ApiError({ kind: 'aiFailed', status: 502, code: 'aiProviderError', message: 'x' }));
    store.getState().reportError(new Error('boom'));
    expect(store.getState().availability).toBe('available');
    expect(store.getState().transient).toBeNull();
  });
});
