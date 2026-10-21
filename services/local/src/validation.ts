import type { z } from 'zod';
import { summarizeIssues, zodIssues } from '@forma/design-core';
import { badRequest } from './errors';

/** Parses untrusted request data or throws a 400 listing every issue. */
export function parseInput<S extends z.ZodType>(
  schema: S,
  data: unknown,
  subject = 'Request',
): z.output<S> {
  const parsed = schema.safeParse(data);
  if (parsed.success) return parsed.data;
  const issues = zodIssues(parsed.error);
  throw badRequest(summarizeIssues(subject, issues), issues);
}
