import { z } from 'zod';
import { proposalsOutputSchema } from '../schemas';
import { wireSchema, zodIssueLines } from './json-schema';
import { paramsFromWire, tokensFromWire, wireParamSchema, wireTokenOverridesSchema } from './params';

const wirePlacementSchema = z.object({
  entryId: z.string().describe('Id of a catalog entry'),
  params: z.array(wireParamSchema).describe('One entry per param; use [] for defaults'),
  region: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number().describe('Pixels, greater than 0'),
    height: z.number().describe('Pixels, greater than 0'),
  }),
  parentRef: z.number().optional().describe('Index (integer >= 0) of an earlier placement that contains this one'),
});

const wirePlanSchema = z.object({
  title: z.string().describe('At most 300 characters'),
  summary: z.string().describe('At most 2000 characters'),
  rationale: z.object({
    need: z.string(),
    patterns: z.array(z.string()),
    tradeoffs: z.array(z.string()),
    fromReferences: z.array(z.string()),
    requirementIds: z.array(z.string()),
  }),
  layout: z.array(wirePlacementSchema).describe('1 to 12 placements'),
  tokens: wireTokenOverridesSchema.optional(),
});

export const wireProposalsSchema = z.object({
  proposals: z.array(wirePlanSchema).describe('1 to 5 proposals'),
});

export const proposalsWire = wireSchema(wireProposalsSchema, (wire) => {
  const issues: string[] = [];
  const proposals = wire.proposals.map((plan, i) => {
    const base = `proposals.${i}`;
    const { tokens, layout, ...rest } = plan;
    const mappedTokens = tokensFromWire(tokens, `${base}.tokens`, issues);
    return {
      ...rest,
      layout: layout.map(({ params, ...placement }, j) => ({
        ...placement,
        params: paramsFromWire(params, `${base}.layout.${j}.params`, issues),
      })),
      ...(mappedTokens === undefined ? {} : { tokens: mappedTokens }),
    };
  });
  if (issues.length > 0) return { ok: false, issues };
  const strict = proposalsOutputSchema.safeParse({ proposals });
  return strict.success ? { ok: true, value: strict.data } : { ok: false, issues: zodIssueLines(strict.error) };
});
