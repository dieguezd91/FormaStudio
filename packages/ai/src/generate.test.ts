import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AiOutputError, AiProviderError, generateValidated } from './generate';
import { mockModel } from './testing';

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
});
