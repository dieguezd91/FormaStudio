import { generateText, NoObjectGeneratedError, Output, type LanguageModel, type ModelMessage } from 'ai';
import type { z } from 'zod';

export type Validation<R> = { ok: true; value: R } | { ok: false; issues: string[] };

/** The model kept returning output that fails schema or domain validation. */
export class AiOutputError extends Error {
  constructor(readonly issues: string[]) {
    super(`AI output is invalid (${issues.length} issue(s)); first: ${issues[0] ?? ''}`);
    this.name = 'AiOutputError';
  }
}

/** The provider call itself failed (network, quota, auth, timeout). */
export class AiProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiProviderError';
  }
}

export interface GenerateValidatedOptions<S extends z.ZodType, R> {
  model: LanguageModel;
  schema: S;
  schemaName?: string;
  system: string;
  messages: ModelMessage[];
  /** Domain validation of the parsed output (e.g. against design-core); may transform it. */
  validate?: (output: z.output<S>) => Validation<R>;
  /** Extra attempts after an invalid answer, each told what was wrong. Defaults to 1. */
  retries?: number;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_REPORTED_ISSUES = 20;

const retryPrompt = (issues: string[]): string =>
  [
    'Your previous answer was rejected by validation. Issues:',
    ...issues.slice(0, MAX_REPORTED_ISSUES).map((issue) => `- ${issue}`),
    'Return a complete, corrected answer that fixes every issue.',
  ].join('\n');

function schemaIssues(error: NoObjectGeneratedError): string[] {
  const cause: unknown = error.cause;
  const issues = (cause as { issues?: { path?: unknown[]; message?: string }[] } | undefined)?.issues;
  if (Array.isArray(issues) && issues.length > 0) {
    return issues.map((i) => `${(i.path ?? []).map(String).join('.') || '<root>'}: ${i.message ?? 'invalid'}`);
  }
  return [error.message];
}

/**
 * Structured generation with a validation loop: the model answers a Zod schema, the answer is
 * validated again by the caller's domain checks, and an invalid answer is retried with the issues
 * appended. Never parses free text and never returns unvalidated data.
 */
export async function generateValidated<S extends z.ZodType, R = z.output<S>>(
  options: GenerateValidatedOptions<S, R>,
): Promise<R> {
  const { model, schema, system, validate, schemaName, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const attempts = (options.retries ?? 1) + 1;
  let messages = options.messages;
  let issues: string[] = [];

  for (let attempt = 1; attempt <= attempts; attempt++) {
    let text: string;
    let output: z.output<S> | undefined;
    try {
      const result = await generateText({
        model,
        instructions: system,
        messages,
        output: Output.object({ schema, ...(schemaName === undefined ? {} : { name: schemaName }) }),
        timeout: timeoutMs,
      });
      text = result.text;
      output = result.output as z.output<S>;
    } catch (error) {
      if (!NoObjectGeneratedError.isInstance(error)) {
        throw new AiProviderError(error instanceof Error ? error.message : String(error));
      }
      text = error.text ?? '';
      issues = schemaIssues(error);
      output = undefined;
    }

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
