import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/errors';
import type { AiStatus } from '@/api/types';
import { availabilityFromError, availabilityFromStatus, gateAi, transientFromError } from './aiGate';

const status = (over: Partial<AiStatus>): AiStatus => ({
  enabled: true,
  configured: true,
  provider: 'gemini',
  model: 'gemini-3.8-flash',
  visionModel: 'gemini-3.8-flash',
  ...over,
});

const aiError = (kind: ApiError['kind'], status: number, code: string, details?: Record<string, unknown>) =>
  new ApiError({ kind, status, code, message: `msg ${code}`, ...(details ? { details } : {}) });

describe('availabilityFromStatus', () => {
  it('is available only when enabled and configured', () => {
    expect(availabilityFromStatus(status({}))).toBe('available');
  });

  it('reports the kill switch even when a key exists', () => {
    expect(availabilityFromStatus(status({ enabled: false, reason: 'disabled' }))).toBe('disabled');
  });

  it('reports a missing key', () => {
    expect(availabilityFromStatus(status({ configured: false, reason: 'missingKey' }))).toBe('missingKey');
  });

  it('lets the kill switch win over a missing key', () => {
    expect(availabilityFromStatus(status({ enabled: false, configured: false, reason: 'disabled' }))).toBe('disabled');
  });
});

describe('availabilityFromError / transientFromError', () => {
  it('maps the permanent AI states', () => {
    expect(availabilityFromError(aiError('aiDisabled', 503, 'aiDisabled'))).toBe('disabled');
    expect(availabilityFromError(aiError('aiUnavailable', 503, 'aiUnavailable'))).toBe('missingKey');
    expect(availabilityFromError(aiError('aiQuota', 429, 'aiQuotaExceeded'))).toBeNull();
    expect(availabilityFromError(new Error('boom'))).toBeNull();
  });

  it('turns quota and overload into transient issues with an expiry from retry-after', () => {
    const quota = transientFromError(aiError('aiQuota', 429, 'aiQuotaExceeded', { retryAfterSeconds: 60 }), 1_000);
    expect(quota).toEqual({ kind: 'quota', message: 'msg aiQuotaExceeded', retryAfterSeconds: 60, until: 61_000 });
    const overloaded = transientFromError(aiError('aiOverloaded', 503, 'aiOverloaded'), 1_000);
    expect(overloaded).toEqual({ kind: 'overloaded', message: 'msg aiOverloaded' });
  });

  it('ignores other failures', () => {
    expect(transientFromError(aiError('aiFailed', 502, 'aiProviderError'), 0)).toBeNull();
    expect(transientFromError(aiError('aiTimeout', 504, 'aiTimeout'), 0)).toBeNull();
    expect(transientFromError('nope', 0)).toBeNull();
  });
});

describe('gateAi', () => {
  const now = 10_000;

  it('does not block while the first status is still being fetched', () => {
    const gate = gateAi({ availability: 'checking', transient: null }, now);
    expect(gate).toMatchObject({ usable: true, reason: null, notice: null, hideGuide: false, offLabel: null });
  });

  it('is fully usable when available', () => {
    const gate = gateAi({ availability: 'available', transient: null }, now);
    expect(gate).toMatchObject({ usable: true, reason: null, notice: null, canRetry: false });
  });

  it('blocks with the kill-switch label, hides the guide and offers no hope of a retry-only fix', () => {
    const gate = gateAi({ availability: 'disabled', transient: null }, now);
    expect(gate.usable).toBe(false);
    expect(gate.reason).toBe('IA desactivada en este equipo');
    expect(gate.offLabel).toBe('IA desactivada en este equipo');
    expect(gate.hideGuide).toBe(true);
  });

  it('blocks a missing key with the env var as the reason and keeps the guide', () => {
    const gate = gateAi({ availability: 'missingKey', transient: null }, now);
    expect(gate.usable).toBe(false);
    expect(gate.reason).toContain('falta la clave de Gemini');
    expect(gate.reason).toContain('GOOGLE_GENERATIVE_AI_API_KEY');
    expect(gate.hideGuide).toBe(false);
    expect(gate.offLabel).toBeNull();
    expect(gate.canRetry).toBe(true);
    expect(gate.summary).toBe('Falta la clave de Gemini en el servicio local.');
    expect(gate.detail).toContain('trabajo manual');
  });

  it('has a one-line summary and a longer detail for every blocked state', () => {
    for (const availability of ['disabled', 'missingKey', 'unknown'] as const) {
      const gate = gateAi({ availability, transient: null }, now);
      expect(gate.summary, availability).toBeTruthy();
      expect(gate.summary?.includes('\n')).toBe(false);
      expect(gate.detail, availability).toBeTruthy();
    }
    expect(gateAi({ availability: 'available', transient: null }, now)).toMatchObject({ summary: null, detail: null });
  });

  it('blocks when the service status is unknown and offers a retry', () => {
    const gate = gateAi({ availability: 'unknown', transient: null }, now);
    expect(gate.usable).toBe(false);
    expect(gate.reason).toContain('servicio local');
    expect(gate.canRetry).toBe(true);
  });

  it('keeps manual-free AI usable under a transient issue and surfaces it as a notice', () => {
    const gate = gateAi(
      {
        availability: 'available',
        transient: { kind: 'quota', message: 'Se agotó la cuota', retryAfterSeconds: 60, until: now + 60_000 },
      },
      now,
    );
    expect(gate).toMatchObject({ usable: true, reason: null, notice: 'Se agotó la cuota', canRetry: true });
  });

  it('drops a transient issue once its retry time has passed', () => {
    const gate = gateAi(
      { availability: 'available', transient: { kind: 'overloaded', message: 'saturado', until: now - 1 } },
      now,
    );
    expect(gate.notice).toBeNull();
    expect(gate.canRetry).toBe(false);
  });

  it('keeps a transient issue without an expiry until it is cleared', () => {
    const gate = gateAi({ availability: 'available', transient: { kind: 'overloaded', message: 'saturado' } }, now);
    expect(gate.notice).toBe('saturado');
  });
});
