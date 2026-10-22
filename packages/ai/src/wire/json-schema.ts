import { jsonSchema, type Schema } from 'ai';
import { z } from 'zod';
import type { Validation } from '../generate';

/** Output that does not satisfy the strict contract; `issues` are `path: message` lines for the retry prompt. */
export class WireValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Output does not match the schema (${issues.length} issue(s)); first: ${issues[0] ?? ''}`);
    this.name = 'WireValidationError';
  }
}

export const zodIssueLines = (error: z.ZodError, prefix = ''): string[] =>
  error.issues.map((issue) => {
    const path = [...(prefix === '' ? [] : [prefix]), ...issue.path.map(String)].join('.');
    return `${path === '' ? '<root>' : path}: ${issue.message}`;
  });

type Json = Record<string, unknown>;

/**
 * `z.toJSONSchema` always emits `$schema` and, for objects, `additionalProperties: false`.
 * Neither is part of the subset Gemini accepts, so they are the only things removed here; the wire
 * schemas themselves are written without length limits, unions, `const` or recursion.
 */
function stripUnsupported(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripUnsupported);
  if (typeof node !== 'object' || node === null) return node;
  return Object.fromEntries(
    Object.entries(node as Json)
      .filter(([key]) => key !== '$schema' && key !== 'additionalProperties')
      .map(([key, value]) => [key, stripUnsupported(value)]),
  );
}

/**
 * The schema sent to the model ("wire schema") and the strict validation of its answer are
 * deliberately separate. `wire` is a small Zod schema that only uses constructs Gemini accepts; it
 * is converted to JSON Schema once and passed through `jsonSchema()` so the AI SDK sends it
 * untouched (its own Zod path would add `additionalProperties` and `$schema` again). `toDomain`
 * maps the parsed wire answer to the domain output and applies the strict domain validation
 * (limits, exact shapes); its issues feed the validation retry.
 */
export function wireSchema<W extends z.ZodType, R>(
  wire: W,
  toDomain: (value: z.output<W>) => Validation<R>,
): Schema<R> {
  const json = stripUnsupported(
    z.toJSONSchema(wire, { target: 'draft-7', io: 'input', reused: 'inline' }),
  ) as Parameters<typeof jsonSchema>[0];
  return jsonSchema<R>(json, {
    validate: (value) => {
      const parsed = wire.safeParse(value);
      if (!parsed.success) return { success: false, error: new WireValidationError(zodIssueLines(parsed.error)) };
      const mapped = toDomain(parsed.data);
      return mapped.ok
        ? { success: true, value: mapped.value }
        : { success: false, error: new WireValidationError(mapped.issues) };
    },
  });
}
