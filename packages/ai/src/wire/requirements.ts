import { z } from 'zod';
import { REQUIREMENT_KINDS, REQUIREMENT_STATUSES, requirementsOutputSchema } from '../schemas';
import { wireSchema, zodIssueLines } from './json-schema';

/**
 * Same fields as `requirementsOutputSchema` without its limits (text <= 1000 chars, excerpt <= 2000,
 * <= 8 refs, <= 60 requirements): those are validated server-side and stated in the descriptions.
 */
const wireRequirementSchema = z.object({
  text: z.string().describe('Spanish, one requirement, at most 1000 characters'),
  kind: z.enum(REQUIREMENT_KINDS),
  status: z.enum(REQUIREMENT_STATUSES),
  sourceRefs: z
    .array(
      z.object({
        sourceId: z.string().describe('One of the provided source ids'),
        excerpt: z.string().describe('At most 2000 characters'),
      }),
    )
    .describe('At most 8 references'),
});

export const wireRequirementsSchema = z.object({
  requirements: z.array(wireRequirementSchema).describe('At most 60 requirements'),
});

export const requirementsWire = wireSchema(wireRequirementsSchema, (wire) => {
  const strict = requirementsOutputSchema.safeParse(wire);
  return strict.success ? { ok: true, value: strict.data } : { ok: false, issues: zodIssueLines(strict.error) };
});
