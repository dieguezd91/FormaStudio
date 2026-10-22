import type { FlexibleSchema } from 'ai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { generateValidated } from './generate';
import { editOutputSchema, proposalsOutputSchema, requirementsOutputSchema } from './schemas';
import { mockModel } from './testing';
import { editWire, proposalsWire, requirementsWire } from './wire';

/**
 * Offline guard for the schemas sent to Gemini (rules documented in docs/ai.md, "What Gemini
 * structured output accepts"). The live API is not called: this walks the JSON Schema that is
 * actually put on the wire and fails on every feature that was rejected, or is not known to be
 * accepted, by `responseJsonSchema`.
 */

type Json = Record<string, unknown>;

/**
 * Largest nesting of schema nodes (objects, array items, union members, leaves included) tolerated.
 * Conservative guard against accidental growth, not Gemini's documented limit: the deepest wire
 * schema (proposals) currently reaches 9.
 */
const MAX_DEPTH = 10;
/** The edit schema is the biggest (~4.5 KB); the cap still catches an accidental embedding of the domain schemas (~160 KB). */
const MAX_SCHEMA_BYTES = 8_000;

const FORBIDDEN_KEYWORDS = [
  '$schema',
  'additionalProperties',
  'const',
  'oneOf',
  'allOf',
  'not',
  'if',
  'then',
  'else',
  'anyOf',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'pattern',
  'format',
  'uniqueItems',
  'minProperties',
  'maxProperties',
  'patternProperties',
  'propertyNames',
  'default',
] as const;

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Direct children in the schema graph; `required` marks edges that can never be empty. */
function children(schema: Json): { path: string; schema: Json; required: boolean }[] {
  const out: { path: string; schema: Json; required: boolean }[] = [];
  const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
  if (isRecord(schema.properties)) {
    for (const [name, child] of Object.entries(schema.properties)) {
      if (isRecord(child)) out.push({ path: `.${name}`, schema: child, required: required.has(name) });
    }
  }
  if (isRecord(schema.items)) out.push({ path: '[]', schema: schema.items, required: false });
  if (isRecord(schema.additionalProperties)) {
    out.push({ path: '.*', schema: schema.additionalProperties, required: false });
  }
  for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
    const members = schema[key];
    if (Array.isArray(members)) {
      members.forEach((member, i) => {
        if (isRecord(member)) out.push({ path: `.${key}[${i}]`, schema: member, required: true });
      });
    }
  }
  return out;
}

function resolveRef(root: Json, ref: string): Json | undefined {
  if (ref === '#') return root;
  if (!ref.startsWith('#/')) return undefined;
  let node: unknown = root;
  for (const part of ref.slice(2).split('/')) node = isRecord(node) ? node[part] : undefined;
  return isRecord(node) ? node : undefined;
}

/** Every rule violation of `root`, as readable strings (empty when the schema is acceptable). */
export function geminiViolations(root: Json): string[] {
  const violations: string[] = [];
  const size = JSON.stringify(root).length;
  if (size > MAX_SCHEMA_BYTES) violations.push(`schema is ${size} bytes (limit ${MAX_SCHEMA_BYTES})`);

  const visit = (schema: Json, path: string, depth: number, stack: Json[]) => {
    if (depth > MAX_DEPTH) {
      violations.push(`${path}: nesting deeper than ${MAX_DEPTH}`);
      return;
    }
    for (const keyword of FORBIDDEN_KEYWORDS) {
      if (keyword in schema) violations.push(`${path || '<root>'}: uses '${keyword}'`);
    }
    if (typeof schema.$ref === 'string') {
      const target = resolveRef(root, schema.$ref);
      if (!target) {
        violations.push(`${path}: unresolvable $ref ${schema.$ref}`);
      } else if (stack.includes(target)) {
        // Gemini tolerates a loop only if it passes through an optional property or a possibly
        // empty array. Every loop is rejected here (stricter, and none is needed).
        violations.push(`${path}: $ref cycle ${schema.$ref}`);
      } else {
        visit(target, path, depth, [...stack, target]);
      }
      return;
    }
    for (const child of children(schema)) {
      visit(child.schema, `${path}${child.path}`, depth + 1, stack);
    }
  };
  visit(root, '', 0, [root]);
  return violations;
}

/** Deepest nesting reached, for documentation and a tight regression bound. */
function depthOf(schema: Json): number {
  return 1 + Math.max(0, ...children(schema).map((child) => depthOf(child.schema)));
}

const wires = [
  ['requirements', requirementsWire],
  ['proposals', proposalsWire],
  ['edit', editWire],
] as const;

describe('Gemini structured-output compatibility (offline)', () => {
  it.each(wires)('the %s wire schema passes every rule', (_name, wire) => {
    const schema = wire.jsonSchema as Json;
    expect(schema.type).toBe('object');
    expect(geminiViolations(schema)).toEqual([]);
    expect(depthOf(schema)).toBeLessThanOrEqual(MAX_DEPTH);
  });

  it('actually sends the wire schema (not the Zod conversion) to the model', async () => {
    const proposal = {
      title: 'A',
      summary: 's',
      rationale: { need: 'n', patterns: [], tradeoffs: [], fromReferences: [], requirementIds: [] },
      layout: [{ entryId: 'panel', params: [], region: { x: 0, y: 0, width: 10, height: 10 } }],
    };
    const cases = [
      { schema: requirementsWire, answer: { requirements: [] } },
      { schema: proposalsWire, answer: { proposals: [proposal] } },
      { schema: editWire, answer: { explanation: 'x', warnings: [], operations: [] } },
    ];
    for (const { schema, answer } of cases) {
      const model = mockModel([answer]);
      await generateValidated({
        model,
        schema: schema as FlexibleSchema<unknown>,
        system: 's',
        messages: [{ role: 'user', content: 'go' }],
      });
      const sent = (model.doGenerateCalls[0] as { responseFormat?: { type: string; schema?: Json } }).responseFormat;
      expect(sent?.type).toBe('json');
      expect(sent?.schema).toEqual(schema.jsonSchema);
      expect(geminiViolations(sent!.schema!)).toEqual([]);
    }
  });

  describe('the walker catches what Gemini rejected on 2026-10-22', () => {
    it('flags the strict domain schemas the first live run sent', () => {
      const requirements = geminiViolations(z.toJSONSchema(requirementsOutputSchema, { target: 'draft-7' }));
      expect(requirements.join('\n')).toMatch(/\$schema/);
      expect(requirements.join('\n')).toMatch(/additionalProperties/);
      expect(requirements.join('\n')).toMatch(/maxLength|minLength/);
      expect(requirements.join('\n')).toMatch(/maxItems/);
      expect(geminiViolations(z.toJSONSchema(proposalsOutputSchema, { target: 'draft-7' }))).not.toHaveLength(0);
    });

    it('flags the recursive z.json() ref loop through required fields', () => {
      const recursive = z.toJSONSchema(z.object({ props: z.record(z.string(), z.json()) }), { target: 'draft-7' });
      expect(geminiViolations(recursive).join('\n')).toMatch(/\$ref cycle/);
      const editViolations = geminiViolations(z.toJSONSchema(editOutputSchema, { target: 'draft-7' }));
      expect(editViolations.join('\n')).toMatch(/\$ref cycle|anyOf/);
    });

    it('flags const, oneOf, not, if and excessive nesting', () => {
      expect(geminiViolations({ type: 'string', const: 'x' })).toHaveLength(1);
      expect(geminiViolations({ oneOf: [{ type: 'string' }] })).toHaveLength(1);
      expect(geminiViolations({ not: { type: 'string' } })).toHaveLength(1);
      expect(geminiViolations({ if: { type: 'string' } })).toHaveLength(1);
      let nested: Json = { type: 'string' };
      for (let i = 0; i < MAX_DEPTH + 2; i++) nested = { type: 'array', items: nested };
      expect(geminiViolations(nested).join('\n')).toMatch(/nesting deeper/);
    });

    it('accepts a plain object with optional properties and an enum', () => {
      expect(
        geminiViolations({
          type: 'object',
          properties: { a: { type: 'string', enum: ['x', 'y'] }, b: { type: 'array', items: { type: 'number' } } },
          required: ['a'],
        }),
      ).toEqual([]);
    });
  });
});
