import { parseBindingPath } from '@forma/runtime';
import type { BindingRef } from './bundle';

/**
 * Splits a binding path (`items[category=Armas][3].icon`, convention in @forma/library
 * `bindings.ts`) into the parts C# needs, using the runtime's parser so editor, Test mode and
 * export agree. Accepted shape: root, filters*, at most one index, then fields*.
 * Returns undefined for anything else.
 */
export function normalizeBinding(dataSourceId: string, path: string): BindingRef | undefined {
  const parsed = parseBindingPath(path);
  if (!parsed) return undefined;

  const filters: BindingRef['filters'] = [];
  const fields: string[] = [];
  let index: number | undefined;
  for (const step of parsed.steps) {
    if (step.kind === 'filter' && index === undefined && fields.length === 0) {
      filters.push({ field: step.field, value: step.value });
    } else if (step.kind === 'index' && index === undefined && fields.length === 0) {
      index = step.index;
    } else if (step.kind === 'field') {
      fields.push(step.name);
    } else {
      return undefined;
    }
  }
  return {
    dataSourceId,
    root: parsed.root,
    filters,
    ...(index === undefined ? {} : { index }),
    ...(fields.length === 0 ? {} : { field: fields.join('.') }),
  };
}

/** The same binding addressing the row itself (no field). */
export const withoutField = ({ field: _field, ...rest }: BindingRef): BindingRef => {
  void _field;
  return rest;
};

/** The same row with another field. */
export const withField = (binding: BindingRef, field: string): BindingRef => ({
  ...withoutField(binding),
  field,
});
