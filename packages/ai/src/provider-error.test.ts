import { describe, expect, it } from 'vitest';
import { classifyProviderError } from './provider-error';
import { providerFailure } from './testing';

const quotaBody = (quotaId: string, retryDelay?: string) => ({
  error: {
    code: 429,
    message: 'You exceeded your current quota, please check your plan and billing details.',
    status: 'RESOURCE_EXHAUSTED',
    details: [
      {
        '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
        violations: [{ quotaMetric: 'generate_content_free_tier_requests', quotaId, quotaValue: '20' }],
      },
      ...(retryDelay === undefined
        ? []
        : [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay }]),
    ],
  },
});

describe('classifyProviderError', () => {
  it('maps 400 INVALID_ARGUMENT to a non-retryable rejected request, keeping the provider message', () => {
    const error = classifyProviderError(
      providerFailure(400, {
        error: { code: 400, message: 'Request contains an invalid argument.', status: 'INVALID_ARGUMENT' },
      }),
    );
    expect(error).toMatchObject({
      kind: 'rejected',
      statusCode: 400,
      providerMessage: 'Request contains an invalid argument.',
    });
  });

  it('treats the 400 Gemini sends for a bad API key as an auth failure', () => {
    const error = classifyProviderError(
      providerFailure(400, {
        error: {
          code: 400,
          message: 'API key not valid. Please pass a valid API key.',
          status: 'INVALID_ARGUMENT',
          details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID' }],
        },
      }),
    );
    expect(error.kind).toBe('auth');
  });

  it.each([401, 403])('maps %i to auth', (status) => {
    expect(classifyProviderError(providerFailure(status, { error: { message: 'denied' } })).kind).toBe(
      'auth',
    );
  });

  it('maps 429 to quota, detecting the free tier, the daily window and RetryInfo', () => {
    const error = classifyProviderError(
      providerFailure(429, quotaBody('GenerateRequestsPerDayPerProjectPerModel-FreeTier', '34s')),
    );
    expect(error).toMatchObject({
      kind: 'quota',
      statusCode: 429,
      freeTier: true,
      daily: true,
      retryAfterSeconds: 34,
    });
  });

  it('does not claim the free tier when the quota id is a paid one', () => {
    const error = classifyProviderError(providerFailure(429, quotaBody('GenerateContentRequestsPerMinute')));
    expect(error).toMatchObject({ kind: 'quota', freeTier: false, daily: false });
    expect(error.retryAfterSeconds).toBeUndefined();
  });

  it('parses fractional retry delays up and falls back to the message or the Retry-After header', () => {
    expect(
      classifyProviderError(providerFailure(429, quotaBody('x-FreeTier', '34.2s'))).retryAfterSeconds,
    ).toBe(35);
    expect(
      classifyProviderError(
        providerFailure(429, { error: { message: 'Quota hit. Please retry in 12.5s.', status: 'RESOURCE_EXHAUSTED' } }),
      ).retryAfterSeconds,
    ).toBe(13);
    expect(
      classifyProviderError(
        providerFailure(429, { error: { message: 'slow down' } }, { 'retry-after': '7' }),
      ).retryAfterSeconds,
    ).toBe(7);
  });

  it('maps 503 and "overloaded" messages to overloaded', () => {
    expect(
      classifyProviderError(
        providerFailure(503, {
          error: { code: 503, message: 'The model is overloaded. Please try again later.', status: 'UNAVAILABLE' },
        }),
      ).kind,
    ).toBe('overloaded');
    expect(
      classifyProviderError(providerFailure(500, { error: { message: 'We are under high demand.' } })).kind,
    ).toBe('overloaded');
  });

  it('maps 504 and abort timeouts to timeout', () => {
    expect(classifyProviderError(providerFailure(504, { error: { message: 'Deadline expired' } })).kind).toBe(
      'timeout',
    );
    const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    expect(classifyProviderError(timeout).kind).toBe('timeout');
  });

  it('keeps other failures as unknown and never throws on odd inputs', () => {
    expect(classifyProviderError(providerFailure(500, 'not json at all')).kind).toBe('unknown');
    expect(classifyProviderError(new Error('socket hang up')).kind).toBe('unknown');
    expect(classifyProviderError('boom').kind).toBe('unknown');
    expect(classifyProviderError(undefined).kind).toBe('unknown');
  });
});
