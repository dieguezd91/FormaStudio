import { MockLanguageModelV4 } from 'ai/test';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

type CallOptions = MockLanguageModelV4['doGenerateCalls'][number];

/** A JSON-serializable answer, raw text, or a function computing either from the call. */
export type MockResponse = unknown | ((call: CallOptions) => unknown | Promise<unknown>);

/**
 * Scripted model for tests: the n-th call answers with the n-th response (JSON-encoded unless it
 * is already a string). A call beyond the script fails loudly, which keeps call counts honest.
 */
export function mockModel(responses: MockResponse[]): MockLanguageModelV4 {
  let next = 0;
  const model: MockLanguageModelV4 = new MockLanguageModelV4({
    modelId: 'mock-model',
    doGenerate: async () => {
      const response = responses[next++];
      if (next > responses.length) throw new Error('mockModel: no scripted response left');
      const value =
        typeof response === 'function'
          ? await (response as (call: CallOptions) => unknown)(model.doGenerateCalls.at(-1)!)
          : response;
      return {
        content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
        warnings: [],
      };
    },
  });
  return model;
}
