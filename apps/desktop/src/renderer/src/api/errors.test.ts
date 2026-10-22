import { describe, expect, it } from 'vitest';
import { formatRetryAfter } from './aiMessages';
import { errorFromResponse } from './errors';

const ai = (status: number, code: string, message = 'server text', details?: Record<string, unknown>) =>
  errorFromResponse(status, { error: { code, message, ...(details ? { details } : {}) } }, { ai: true });

describe('formatRetryAfter', () => {
  it.each([
    [30, '30 s'],
    [59, '59 s'],
    [60, '~1 min'],
    [61, '~2 min'],
    [900, '~15 min'],
    [3599, '~1 h'],
    [3600, '~1 h'],
    [64_800, '~18 h'],
    [86_399, '~24 h'],
    [86_400, '~1 día'],
    [3 * 86_400, '~3 días'],
  ])('%d s → %s', (seconds, expected) => {
    expect(formatRetryAfter(seconds)).toBe(expected);
  });

  it('is defensive about nonsense values', () => {
    expect(formatRetryAfter(0)).toBe('unos instantes');
    expect(formatRetryAfter(-5)).toBe('unos instantes');
    expect(formatRetryAfter(Number.NaN)).toBe('unos instantes');
  });
});

describe('AI error mapping', () => {
  it('maps aiDisabled (503) to a kill-switch error naming the variable', () => {
    const error = ai(503, 'aiDisabled');
    expect(error.kind).toBe('aiDisabled');
    expect(error.message).toContain('desactivada en este equipo');
    expect(error.message).toContain('FORMA_AI_ENABLED');
  });

  it('maps aiUnavailable (503) to a missing-key error naming the env var and manual work', () => {
    const error = ai(503, 'aiUnavailable');
    expect(error.kind).toBe('aiUnavailable');
    expect(error.message).toContain('GOOGLE_GENERATIVE_AI_API_KEY');
    expect(error.message).toContain('manual');
  });

  it('maps a free-tier daily quota error with a human retry time and the Google AI Pro note', () => {
    const error = ai(429, 'aiQuotaExceeded', 'Puedes reintentar en 64800 s.', {
      freeTier: true,
      daily: true,
      retryAfterSeconds: 64_800,
    });
    expect(error.kind).toBe('aiQuota');
    expect(error.status).toBe(429);
    expect(error.message).toContain('cuota diaria del nivel gratuito');
    expect(error.message).toContain('podés volver a intentar en ~18 h');
    expect(error.message).toContain('Google AI Pro');
    expect(error.message).toContain('no incluye cuota de API');
    expect(error.message).not.toContain('64800');
    expect(error.details).toEqual({ freeTier: true, daily: true, retryAfterSeconds: 64_800 });
  });

  it('omits the Google AI Pro note and the retry time when the quota is paid and no retry-after is known', () => {
    const error = ai(429, 'aiQuotaExceeded', 'x', { freeTier: false, daily: false });
    expect(error.kind).toBe('aiQuota');
    expect(error.message).not.toContain('Google AI Pro');
    expect(error.message).not.toContain('~');
    expect(error.message).toContain('más tarde');
  });

  it('survives a quota error without details', () => {
    expect(ai(429, 'aiQuotaExceeded').kind).toBe('aiQuota');
  });

  it('maps aiOverloaded (503) with and without retry-after', () => {
    const withRetry = ai(503, 'aiOverloaded', 'x', { retryAfterSeconds: 120 });
    expect(withRetry.kind).toBe('aiOverloaded');
    expect(withRetry.message).toContain('saturado');
    expect(withRetry.message).toContain('~2 min');
    expect(ai(503, 'aiOverloaded').message).toContain('en unos minutos');
  });

  it('maps aiTimeout (504)', () => {
    const error = ai(504, 'aiTimeout');
    expect(error.kind).toBe('aiTimeout');
    expect(error.message).toContain('tardó demasiado');
  });

  it.each([
    ['aiRequestRejected', 'rechazó el formato del pedido'],
    ['aiAuthFailed', 'GOOGLE_GENERATIVE_AI_API_KEY'],
    ['aiProviderError', 'No se pudo completar la llamada'],
  ])('maps %s (502) to an AI failure with its own Spanish message', (code, fragment) => {
    const error = ai(502, code, 'English text from the service');
    expect(error.kind).toBe('aiFailed');
    expect(error.code).toBe(code);
    expect(error.message).toContain(fragment);
    expect(error.serverMessage).toBe('English text from the service');
  });

  it('keeps the service message for invalid model output (502)', () => {
    const error = ai(502, 'aiInvalidOutput', 'La IA devolvió una respuesta que no supera la validación.');
    expect(error.kind).toBe('aiFailed');
    expect(error.message).toBe('La IA devolvió una respuesta que no supera la validación.');
  });

  it('does not treat non-AI routes as AI errors', () => {
    const error = errorFromResponse(429, { error: { code: 'aiQuotaExceeded', message: 'x' } });
    expect(error.kind).toBe('invalid');
  });
});
