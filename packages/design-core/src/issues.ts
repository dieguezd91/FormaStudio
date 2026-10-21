import type { z } from 'zod';

/** A path-addressed problem found while validating raw input. */
export interface Issue {
  path: string;
  message: string;
}

export function zodIssues(error: z.ZodError): Issue[] {
  return error.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message }));
}

export function summarizeIssues(subject: string, issues: Issue[]): string {
  const first = issues[0];
  return `${subject} is invalid (${issues.length} issue(s)); first: ${first?.path || '<root>'}: ${first?.message ?? ''}`;
}
