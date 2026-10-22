import {
  generateText,
  NoObjectGeneratedError,
  Output,
  type FlexibleSchema,
  type LanguageModel,
  type ModelMessage,
} from 'ai';
import { DEFAULT_PROVIDER_RETRY, type ProviderRetryPolicy } from './provider';
import { classifyProviderError } from './provider-error';
import { WireValidationError } from './wire/json-schema';

export type Validation<R> = { ok: true; value: R } | { ok: false; issues: string[] };

/** The model kept returning output that fails schema or domain validation. */
export class AiOutputError extends Error {
  constructor(readonly issues: string[]) {
    super(`AI output is invalid (${issues.length} issue(s)); first: ${issues[0] ?? ''}`);
    this.name = 'AiOutputError';
  }
}

export interface GenerateValidatedOptions<T, R> {
  model: LanguageModel;
  /** A Zod schema, or a `jsonSchema()` whose `validate` maps the answer (see `wireSchema`). */
  schema: FlexibleSchema<T>;
  schemaName?: string;
  system: string;
  messages: ModelMessage[];
  /** Domain validation of the parsed output (e.g. against design-core); may transform it. */
  validate?: (output: T) => Validation<R>;
  /** Extra attempts after an invalid answer, each told what was wrong. Defaults to 1. */
  retries?: number;
  timeoutMs?: number;
  /** Retry of transient provider overload (503). Defaults to {@link DEFAULT_PROVIDER_RETRY}. */
  providerRetry?: ProviderRetryPolicy | undefined;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_REPORTED_ISSUES = 20;

const retryPrompt = (issues: string[]): string =>
  [
    'Your previous answer was rejected by validation. Issues:',
    ...issues.slice(0, MAX_REPORTED_ISSUES).map((issue) => `- ${issue}`),
    'Return a complete, corrected answer that fixes every issue.',
  ].join('\n');

/** Issues behind a "did not match schema" failure, looking through the SDK's wrapper errors. */
function schemaIssues(error: NoObjectGeneratedError): string[] {
  let cause: unknown = error.cause;
  for (let depth = 0; depth < 4 && cause !== undefined && cause !== null; depth++) {
    if (cause instanceof WireValidationError) return cause.issues;
    const issues = (cause as { issues?: { path?: unknown[]; message?: string }[] }).issues;
    if (Array.isArray(issues) && issues.length > 0) {
      return issues.map((i) => `${(i.path ?? []).map(String).join('.') || '<root>'}: ${i.message ?? 'invalid'}`);
    }
    cause = (cause as { cause?: unknown }).cause;
  }
  return [error.message];
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Structured generation with a validation loop: the model answers a schema, the answer is
 * validated again by the caller's domain checks, and an invalid answer is retried with the issues
 * appended. Never parses free text and never returns unvalidated data.
 *
 * Requests to the provider are bounded: the AI SDK's own retries are off (`maxRetries: 0`), a
 * provider error ends the call as a classified `AiProviderError` (no validation retry), and only
 * a 503/overloaded answer is retried, at most `providerRetry.overloadedRetries` times in total
 * for the whole call. Worst case: `retries + 1 + overloadedRetries` requests.
 */
export async function generateValidated<T, R = T>(options: GenerateValidatedOptions<T, R>): Promise<R> {
  const { model, schema, system, validate, schemaName, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const policy = options.providerRetry ?? DEFAULT_PROVIDER_RETRY;
  const attempts = (options.retries ?? 1) + 1;
  let overloadRetriesLeft = policy.overloadedRetries;
  let messages = options.messages;
  let issues: string[] = [];

  const callModel = async (): Promise<{ text: string; output?: T }> => {
    for (;;) {
      try {
        const result = await generateText({
          model,
          instructions: system,
          messages,
          output: Output.object({ schema, ...(schemaName === undefined ? {} : { name: schemaName }) }),
          timeout: timeoutMs,
          maxRetries: 0,
        });
        return { text: result.text, output: result.output as T };
      } catch (error) {
        if (NoObjectGeneratedError.isInstance(error)) {
          issues = schemaIssues(error);
          return { text: error.text ?? '' };
        }
        const classified = classifyProviderError(error);
        if (classified.kind === 'overloaded' && overloadRetriesLeft > 0) {
          overloadRetriesLeft--;
          if (policy.backoffMs > 0) await sleep(policy.backoffMs);
          continue;
        }
        throw classified;
      }
    }
  };

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const { text, output } = await callModel();
    if (output !== undefined) {
      if (validate === undefined) return output as unknown as R;
      const validated = validate(output);
      if (validated.ok) return validated.value;
      issues = validated.issues;
    }
    if (attempt < attempts) {
      messages = [
        ...messages,
        { role: 'assistant', content: text },
        { role: 'user', content: retryPrompt(issues) },
      ];
    }
  }
  throw new AiOutputError(issues);
}
