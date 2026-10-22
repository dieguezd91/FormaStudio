import { z } from 'zod';
import {
  behaviorKindSchema,
  connectionSchema,
  operationSchema,
  tokenGroupSchema,
} from '@forma/design-core';
import { editOutputSchema, insertEntryRequestSchema } from '../schemas';
import { wireSchema, zodIssueLines } from './json-schema';
import { paramsFromWire, wireParamSchema } from './params';

/**
 * Edit answers on the wire. design-core's operation union is ~160 KB of JSON Schema and embeds
 * a recursive `z.json()` (updateNode props, data source mock data), which Gemini rejects. The wire
 * form is one flat, non-recursive object per operation: `type` picks the operation and only the
 * fields that operation needs are read (the rest are ignored). Free-form maps become entry lists,
 * mock data becomes JSON text. `addNode`/`addScreen` stay excluded: new content goes through
 * `insertEntry`.
 */

/** Every design-core operation except `addNode`/`addScreen`, plus the library insertion. */
export const WIRE_OPERATION_TYPES = [
  'removeNode',
  'updateNode',
  'moveNode',
  'setBehavior',
  'removeBehavior',
  'setBinding',
  'removeBinding',
  'setToken',
  'removeToken',
  'removeScreen',
  'renameScreen',
  'upsertDataSource',
  'removeDataSource',
  'upsertIntent',
  'removeIntent',
  'insertEntry',
] as const;

const text = z.string();
const valueType = z.enum(['string', 'number', 'boolean', 'image', 'id']);

/** One property of a node patch; set exactly one value field. */
const wirePatchEntrySchema = z.object({
  section: z.enum(['layout', 'style', 'props']),
  key: text.describe("Property name; nested as 'cellSize.width'"),
  text: text.optional(),
  number: z.number().optional(),
  boolean: z.boolean().optional(),
  token: text.optional().describe("Token reference such as 'colors.accent' (layout/style only)"),
  remove: z.boolean().optional().describe('true removes the property'),
});
type WirePatchEntry = z.infer<typeof wirePatchEntrySchema>;

/** A behavior with the fields of every kind optional; only those of `kind` are read. */
const wireBehaviorSchema = z.object({
  kind: behaviorKindSchema,
  tabs: z.array(z.object({ id: text, label: text, contentNodeId: text })).optional(),
  initialTabId: text.optional(),
  mode: z.enum(['single', 'multi']).optional(),
  role: z.enum(['source', 'target', 'both']).optional(),
  accepts: z.array(text).optional(),
  intentId: text.optional(),
  maxStack: z.number().optional(),
  showCount: z.boolean().optional(),
  trigger: z.enum(['secondaryClick', 'longPress', 'button']).optional(),
  actions: z.array(z.object({ id: text, label: text, intentId: text })).optional(),
  bindingPath: text.optional(),
});
type WireBehavior = z.infer<typeof wireBehaviorSchema>;

const BEHAVIOR_FIELDS: Record<WireBehavior['kind'], readonly (keyof WireBehavior)[]> = {
  tabs: ['tabs', 'initialTabId'],
  select: ['mode'],
  dragDrop: ['role', 'accepts', 'intentId'],
  stack: ['maxStack', 'showCount'],
  split: ['intentId'],
  contextMenu: ['trigger', 'actions'],
  tooltip: ['bindingPath'],
};

const wireDataSourceSchema = z.object({
  id: text,
  name: text,
  kind: z.enum(['collection', 'object']),
  fields: z.array(z.object({ name: text, type: valueType })),
  mockJson: text.describe('Mock data as JSON text'),
  connection: connectionSchema,
});

const wireIntentSchema = z.object({
  id: text,
  name: text,
  description: text,
  payload: z.array(z.object({ name: text, type: valueType })),
  connection: connectionSchema,
});

const wireOperationSchema = z.object({
  type: z.enum(WIRE_OPERATION_TYPES),
  screenId: text.optional(),
  nodeId: text.optional(),
  parentId: text.optional(),
  newParentId: text.optional(),
  index: z.number().optional(),
  force: z.boolean().optional(),
  // insertEntry
  entryId: text.optional(),
  params: z.array(wireParamSchema).optional(),
  // updateNode
  name: text.optional().describe('updateNode, renameScreen, setToken, removeToken'),
  locked: z.boolean().optional(),
  patch: z.array(wirePatchEntrySchema).optional(),
  // behaviors, bindings
  behavior: wireBehaviorSchema.optional(),
  kind: behaviorKindSchema.optional().describe('removeBehavior'),
  binding: z.object({ id: text, prop: text, dataSourceId: text, path: text }).optional(),
  bindingId: text.optional(),
  // tokens
  group: tokenGroupSchema.optional(),
  valueText: text.optional().describe('setToken: colors'),
  valueNumber: z.number().optional().describe('setToken: sizes, spacing, radii'),
  // data and intents
  dataSource: wireDataSourceSchema.optional(),
  dataSourceId: text.optional(),
  intent: wireIntentSchema.optional(),
  intentId: text.optional(),
});
type WireOperation = z.infer<typeof wireOperationSchema>;

export const wireEditSchema = z.object({
  explanation: text.describe('Spanish, at most 2000 characters'),
  warnings: z.array(text).describe('Spanish; at most 10'),
  operations: z.array(wireOperationSchema).describe('At most 50, in order'),
});

const UNSAFE_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

/** Sets `key` ('a' or 'a.b') on a plain object; nested keys build one level of object. */
function setKey(target: Record<string, unknown>, key: string, value: unknown, path: string, issues: string[]) {
  const segments = key.split('.');
  if (segments.length > 2 || segments.some((s) => s === '' || UNSAFE_SEGMENTS.has(s))) {
    issues.push(`${path}.key: invalid property name '${key}'`);
    return;
  }
  const [first, second] = segments as [string, string?];
  if (second === undefined) {
    if (Object.hasOwn(target, first)) issues.push(`${path}.key: '${key}' is set more than once`);
    else target[first] = value;
    return;
  }
  if (!Object.hasOwn(target, first)) target[first] = {};
  const nested = target[first];
  if (typeof nested !== 'object' || nested === null || Array.isArray(nested)) {
    issues.push(`${path}.key: '${key}' conflicts with '${first}'`);
  } else if (Object.hasOwn(nested, second)) {
    issues.push(`${path}.key: '${key}' is set more than once`);
  } else {
    (nested as Record<string, unknown>)[second] = value;
  }
}

const PATCH_VALUE_FIELDS = ['text', 'number', 'boolean', 'token'] as const;

function patchFromWire(entries: readonly WirePatchEntry[], path: string, issues: string[]) {
  const sections: Record<'layout' | 'style' | 'props', Record<string, unknown>> = {
    layout: {},
    style: {},
    props: {},
  };
  entries.forEach((entry, i) => {
    const where = `${path}.${i}`;
    const set = PATCH_VALUE_FIELDS.filter((field) => entry[field] !== undefined);
    const remove = entry.remove === true;
    if (set.length + (remove ? 1 : 0) !== 1) {
      issues.push(`${where}: '${entry.key}' needs exactly one of text, number, boolean, token or remove`);
      return;
    }
    if (entry.token !== undefined && entry.section === 'props') {
      issues.push(`${where}.token: token references are only valid in layout and style`);
      return;
    }
    const value = remove
      ? null
      : entry.token !== undefined
        ? { token: entry.token }
        : entry[set[0] as 'text' | 'number' | 'boolean'];
    setKey(sections[entry.section], entry.key, value, where, issues);
  });
  return Object.fromEntries(Object.entries(sections).filter(([, section]) => Object.keys(section).length > 0));
}

/** Only the defined fields of `source`, so absent wire fields stay absent in the domain object. */
function pick(source: object, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = (source as Record<string, unknown>)[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function behaviorFromWire(behavior: WireBehavior): Record<string, unknown> {
  return { kind: behavior.kind, ...pick(behavior, BEHAVIOR_FIELDS[behavior.kind]) };
}

/** The domain operation (or library insertion) a wire operation stands for, before validation. */
function toCandidate(op: WireOperation, path: string, issues: string[]): unknown {
  const target = ['screenId', 'nodeId'] as const;
  switch (op.type) {
    case 'insertEntry':
      return {
        insertEntry: {
          ...pick(op, ['entryId', 'parentId']),
          params: paramsFromWire(op.params ?? [], `${path}.params`, issues),
        },
      };
    case 'updateNode': {
      const patch = {
        ...pick(op, ['name', 'locked']),
        ...patchFromWire(op.patch ?? [], `${path}.patch`, issues),
      };
      return { type: op.type, ...pick(op, [...target, 'force']), patch };
    }
    case 'setBehavior':
      return {
        type: op.type,
        ...pick(op, [...target, 'index', 'force']),
        ...(op.behavior === undefined ? {} : { behavior: behaviorFromWire(op.behavior) }),
      };
    case 'setBinding':
      return { type: op.type, ...pick(op, [...target, 'binding', 'index', 'force']) };
    case 'removeBehavior':
      return { type: op.type, ...pick(op, [...target, 'kind', 'force']) };
    case 'removeBinding':
      return { type: op.type, ...pick(op, [...target, 'bindingId', 'force']) };
    case 'removeNode':
      return { type: op.type, ...pick(op, [...target, 'force']) };
    case 'moveNode':
      return { type: op.type, ...pick(op, [...target, 'newParentId', 'index', 'force']) };
    case 'setToken': {
      const value = op.valueText ?? op.valueNumber;
      return { type: op.type, ...pick(op, ['group', 'name']), ...(value === undefined ? {} : { value }) };
    }
    case 'removeToken':
      return { type: op.type, ...pick(op, ['group', 'name']) };
    case 'removeScreen':
      return { type: op.type, ...pick(op, ['screenId', 'force']) };
    case 'renameScreen':
      return { type: op.type, ...pick(op, ['screenId', 'name']) };
    case 'upsertDataSource': {
      if (op.dataSource === undefined) return { type: op.type, ...pick(op, ['index']) };
      const { mockJson, ...dataSource } = op.dataSource;
      let mock: unknown;
      try {
        mock = JSON.parse(mockJson);
      } catch {
        issues.push(`${path}.dataSource.mockJson: not valid JSON`);
      }
      return { type: op.type, dataSource: { ...dataSource, mock }, ...pick(op, ['index']) };
    }
    case 'removeDataSource':
      return { type: op.type, ...pick(op, ['dataSourceId']) };
    case 'upsertIntent':
      return { type: op.type, ...pick(op, ['intent', 'index']) };
    case 'removeIntent':
      return { type: op.type, ...pick(op, ['intentId']) };
  }
}

export const editWire = wireSchema(wireEditSchema, (wire) => {
  const issues: string[] = [];
  const operations = wire.operations.map((op, i) => {
    const path = `operations.${i}`;
    const candidate = toCandidate(op, path, issues);
    // The discriminated union names the exact field at fault; the 16-way `editItemSchema` would not.
    const strict =
      op.type === 'insertEntry' ? insertEntryRequestSchema.safeParse(candidate) : operationSchema.safeParse(candidate);
    if (strict.success) return strict.data;
    issues.push(...zodIssueLines(strict.error, path));
    return undefined;
  });
  if (issues.length > 0) return { ok: false, issues };
  const strict = editOutputSchema.safeParse({
    explanation: wire.explanation,
    warnings: wire.warnings,
    operations,
  });
  return strict.success ? { ok: true, value: strict.data } : { ok: false, issues: zodIssueLines(strict.error) };
});
