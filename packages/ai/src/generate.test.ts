import { describe, expect, it } from 'vitest';
import { jsonSchema } from 'ai';
import { z } from 'zod';
import { AiOutputError, generateValidated } from './generate';
import { AiProviderError } from './provider-error';
import { WireValidationError } from './wire/json-schema';
import { mockModel, providerFailure } from './testing';

const schema = z.object({ n: z.number() });
const base = { schema, system: 'sys', messages: [{ role: 'user' as const, content: 'go' }] };

const promptText = (call: unknown): string => JSON.stringify((call as { prompt: unknown }).prompt);

describe('generateValidated', () => {
  it('returns the validated value of a well-formed answer', async () => {
    const model = mockModel([{ n: 2 }]);
    const value = await generateValidated({
      ...base,
      model,
      validate: (out) => ({ ok: true, value: out.n * 10 }),
    });
    expect(value).toBe(20);
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it('retries once with the schema issues appended when the answer does not parse', async () => {
    const model = mockModel([{ n: 'oops' }, { n: 3 }]);
    expect(await generateValidated({ ...base, model })).toEqual({ n: 3 });
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(promptText(model.doGenerateCalls[1])).toContain('rejected');
  });

  it('retries once with the semantic issues appended, then throws AiOutputError', async () => {
    const model = mockModel([{ n: 1 }, { n: 1 }]);
    const failure = generateValidated({
      ...base,
      model,
      validate: () => ({ ok: false, issues: ['n must be even'] }),
    });
    await expect(failure).rejects.toBeInstanceOf(AiOutputError);
    await expect(
      generateValidated({
        ...base,
        model: mockModel([{ n: 1 }, { n: 1 }]),
        validate: () => ({ ok: false, issues: ['n must be even'] }),
      }),
    ).rejects.toMatchObject({ issues: ['n must be even'] });
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(promptText(model.doGenerateCalls[1])).toContain('n must be even');
  });

  it('does not retry when retries is 0', async () => {
    const model = mockModel([{ n: 'x' }]);
    await expect(generateValidated({ ...base, model, retries: 0 })).rejects.toBeInstanceOf(
      AiOutputError,
    );
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it('reports non-JSON text as invalid output', async () => {
    const model = mockModel(['definitely not json', 'still not json']);
    await expect(generateValidated({ ...base, model })).rejects.toBeInstanceOf(AiOutputError);
  });

  it('wraps provider failures without retrying them as invalid output', async () => {
    const model = mockModel([() => Promise.reject(new Error('boom'))]);
    await expect(generateValidated({ ...base, model })).rejects.toBeInstanceOf(AiProviderError);
  });
  it('classifies provider failures and attaches the kind, status and provider message', async () => {
    const model = mockModel([
      () => {
        throw providerFailure(400, { error: { message: 'Request contains an invalid argument.' } });
      },
    ]);
    await expect(generateValidated({ ...base, model })).rejects.toMatchObject({
      name: 'AiProviderError',
      kind: 'rejected',
      statusCode: 400,
      providerMessage: 'Request contains an invalid argument.',
    });
  });

  it('never retries (SDK or ours) on 400, 401, 429 or unknown provider errors', async () => {
    for (const status of [400, 401, 429, 500]) {
      const model = mockModel([
        () => {
          throw providerFailure(status, { error: { message: 'nope' } });
        },
        { n: 1 },
        { n: 1 },
      ]);
      await expect(generateValidated({ ...base, model, providerRetry: { overloadedRetries: 1, backoffMs: 0 } }))
        .rejects.toBeInstanceOf(AiProviderError);
      expect(model.doGenerateCalls, `status ${status}`).toHaveLength(1);
    }
  });

  it('retries a 503 once with backoff, then succeeds', async () => {
    const model = mockModel([
      () => {
        throw providerFailure(503, { error: { message: 'high demand', status: 'UNAVAILABLE' } });
      },
      { n: 5 },
    ]);
    const value = await generateValidated({ ...base, model, providerRetry: { overloadedRetries: 1, backoffMs: 0 } });
    expect(value).toEqual({ n: 5 });
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  it('gives up after the single overload retry and reports overloaded', async () => {
    const overloaded = () => {
      throw providerFailure(503, { error: { message: 'high demand', status: 'UNAVAILABLE' } });
    };
    const model = mockModel([overloaded, overloaded, { n: 1 }]);
    await expect(
      generateValidated({ ...base, model, providerRetry: { overloadedRetries: 1, backoffMs: 0 } }),
    ).rejects.toMatchObject({ kind: 'overloaded' });
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  it('does not retry overload at all when the policy says 0', async () => {
    const model = mockModel([
      () => {
        throw providerFailure(503, { error: { message: 'high demand' } });
      },
      { n: 1 },
    ]);
    await expect(
      generateValidated({ ...base, model, providerRetry: { overloadedRetries: 0, backoffMs: 0 } }),
    ).rejects.toMatchObject({ kind: 'overloaded' });
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it('shares one overload retry across validation attempts: at most 3 requests per call', async () => {
    const overloaded = () => {
      throw providerFailure(503, { error: { message: 'high demand' } });
    };
    // invalid -> (validation retry) 503 -> (overload retry) 503: provider error, nothing else is attempted
    const model = mockModel([{ n: 'x' }, overloaded, overloaded, { n: 1 }]);
    await expect(
      generateValidated({ ...base, model, providerRetry: { overloadedRetries: 1, backoffMs: 0 } }),
    ).rejects.toMatchObject({ kind: 'overloaded' });
    expect(model.doGenerateCalls).toHaveLength(3);
  });

  it('does not run the output-validation retry after a provider error', async () => {
    const model = mockModel([
      () => {
        throw providerFailure(429, { error: { message: 'quota', status: 'RESOURCE_EXHAUSTED' } });
      },
      { n: 1 },
    ]);
    await expect(generateValidated({ ...base, model })).rejects.toMatchObject({ kind: 'quota' });
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it('reports a timeout as a classified provider error', async () => {
    const model = mockModel([
      (call: { abortSignal?: AbortSignal }) =>
        new Promise((_, reject) => {
          const signal = call.abortSignal;
          signal?.addEventListener('abort', () => reject(signal.reason));
        }),
    ]);
    await expect(generateValidated({ ...base, model, timeoutMs: 20 })).rejects.toMatchObject({
      name: 'AiProviderError',
      kind: 'timeout',
    });
  });

  it('turns schema issues of a Schema (not Zod) into retry feedback', async () => {
    const wire = jsonSchema<{ n: number }>(
      { type: 'object', properties: { n: { type: 'number' } }, required: ['n'] },
      {
        validate: (value) =>
          (value as { n?: unknown }).n === 2
            ? { success: true, value: { n: 2 } }
            : { success: false, error: new WireValidationError(['n: must be 2']) },
      },
    );
    const model = mockModel([{ n: 1 }, { n: 2 }]);
    expect(await generateValidated({ model, schema: wire, system: 's', messages: base.messages })).toEqual({ n: 2 });
    expect(promptText(model.doGenerateCalls[1])).toContain('n: must be 2');
  });
});
