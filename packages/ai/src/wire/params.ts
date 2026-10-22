import { z } from 'zod';

/**
 * Library params and token groups are free-form string-keyed maps in the domain, which JSON
 * Schema can only express with `additionalProperties` (not accepted by Gemini). On the wire they
 * are lists of entries instead; these helpers fold them back into records.
 */

export type ParamValue = string | number | boolean | string[];

/** One library param: `key` plus the one value field that matches its type. */
export const wireParamSchema = z.object({
  key: z.string().describe('Param name, exactly as in the catalog entry schema'),
  text: z.string().optional().describe('Value of a string param'),
  number: z.number().optional().describe('Value of a number/integer param'),
  boolean: z.boolean().optional().describe('Value of a boolean param'),
  list: z.array(z.string()).optional().describe('Value of an array-of-strings param'),
});
export type WireParam = z.infer<typeof wireParamSchema>;

/** Own-property map: keys such as `__proto__` stay plain data. */
export function recordOf<V>(entries: [string, V][]): Record<string, V> {
  return Object.fromEntries(entries);
}

const PARAM_VALUE_FIELDS = ['text', 'number', 'boolean', 'list'] as const;

/** Folds param entries into a record, reporting entries without exactly one value and repeated keys. */
export function paramsFromWire(
  entries: readonly WireParam[],
  path: string,
  issues: string[],
): Record<string, ParamValue> {
  const seen = new Set<string>();
  const result: [string, ParamValue][] = [];
  entries.forEach((entry, i) => {
    const where = `${path}.${i}`;
    if (seen.has(entry.key)) {
      issues.push(`${where}.key: duplicate param '${entry.key}'`);
      return;
    }
    seen.add(entry.key);
    const set = PARAM_VALUE_FIELDS.filter((field) => entry[field] !== undefined);
    if (set.length !== 1) {
      issues.push(`${where}: param '${entry.key}' needs exactly one of text, number, boolean or list (got ${set.length})`);
      return;
    }
    result.push([entry.key, entry[set[0]!]!]);
  });
  return recordOf(result);
}

/** One named token (a color, size, spacing or radius). */
const namedSchema = <V extends z.ZodType>(value: V) => z.object({ name: z.string(), value });

export const wireTokenOverridesSchema = z.object({
  colors: z.array(namedSchema(z.string())).optional().describe('CSS hex colors by token name'),
  fontSizes: z.array(namedSchema(z.number())).optional(),
  spacing: z.array(namedSchema(z.number())).optional(),
  radii: z.array(namedSchema(z.number())).optional(),
});
export type WireTokenOverrides = z.infer<typeof wireTokenOverridesSchema>;

export function tokensFromWire(
  tokens: WireTokenOverrides | undefined,
  path: string,
  issues: string[],
): Record<string, Record<string, string | number>> | undefined {
  if (tokens === undefined) return undefined;
  const result: Record<string, Record<string, string | number>> = {};
  for (const group of ['colors', 'fontSizes', 'spacing', 'radii'] as const) {
    const entries = tokens[group] as { name: string; value: string | number }[] | undefined;
    if (entries === undefined) continue;
    const seen = new Set<string>();
    for (const [i, entry] of entries.entries()) {
      if (seen.has(entry.name)) issues.push(`${path}.${group}.${i}.name: duplicate token '${entry.name}'`);
      seen.add(entry.name);
    }
    result[group] = recordOf(entries.map((entry): [string, string | number] => [entry.name, entry.value]));
  }
  return result;
}
