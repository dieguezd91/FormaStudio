/**
 * Domain -> wire encoders, the inverse of the mapping in `./edit` and `./proposals`. Only tests use
 * them (via `@forma/ai/testing`): scripted model answers are written in domain terms and encoded
 * into what Gemini would actually return.
 */

type Json = Record<string, unknown>;

export function toWireParams(params: Json): Json[] {
  return Object.entries(params).flatMap(([key, value]): Json[] => {
    if (typeof value === 'string') return [{ key, text: value }];
    if (typeof value === 'number') return [{ key, number: value }];
    if (typeof value === 'boolean') return [{ key, boolean: value }];
    if (Array.isArray(value)) return [{ key, list: value.map(String) }];
    return [];
  });
}

const namedList = (record: Json | undefined): Json[] | undefined =>
  record === undefined ? undefined : Object.entries(record).map(([name, value]) => ({ name, value }));

export function toWireProposals(output: { proposals: Json[] }): Json {
  return {
    proposals: output.proposals.map((plan) => {
      const { layout, tokens, ...rest } = plan as { layout: Json[]; tokens?: Record<string, Json> } & Json;
      return {
        ...rest,
        layout: layout.map(({ params, ...placement }) => ({ ...placement, params: toWireParams((params ?? {}) as Json) })),
        ...(tokens === undefined
          ? {}
          : {
              tokens: Object.fromEntries(Object.entries(tokens).map(([group, record]) => [group, namedList(record)])),
            }),
      };
    }),
  };
}

function patchEntries(section: string, record: Json, prefix = ''): Json[] {
  return Object.entries(record).flatMap(([key, value]): Json[] => {
    const name = `${prefix}${key}`;
    if (value === null) return [{ section, key: name, remove: true }];
    if (typeof value === 'string') return [{ section, key: name, text: value }];
    if (typeof value === 'number') return [{ section, key: name, number: value }];
    if (typeof value === 'boolean') return [{ section, key: name, boolean: value }];
    const object = value as Json;
    if (typeof object.token === 'string' && Object.keys(object).length === 1) {
      return [{ section, key: name, token: object.token }];
    }
    return patchEntries(section, object, `${name}.`);
  });
}

function toWireOperation(item: Json): Json {
  if ('insertEntry' in item) {
    const { entryId, params, parentId } = item.insertEntry as Json;
    return { type: 'insertEntry', entryId, parentId, params: toWireParams((params ?? {}) as Json) };
  }
  switch (item.type) {
    case 'updateNode': {
      const { patch, ...rest } = item as { patch: Json } & Json;
      const { name, locked, ...sections } = patch;
      return {
        ...rest,
        ...(name === undefined ? {} : { name }),
        ...(locked === undefined ? {} : { locked }),
        patch: Object.entries(sections).flatMap(([section, record]) => patchEntries(section, record as Json)),
      };
    }
    case 'setToken': {
      const { value, ...rest } = item;
      return { ...rest, ...(typeof value === 'string' ? { valueText: value } : { valueNumber: value }) };
    }
    case 'upsertDataSource': {
      const { mock, ...dataSource } = (item as { dataSource: Json }).dataSource;
      return { ...item, dataSource: { ...dataSource, mockJson: JSON.stringify(mock) } };
    }
    default:
      return item;
  }
}

export function toWireEdit(output: { explanation: string; warnings: string[]; operations: unknown[] }): Json {
  return { ...output, operations: output.operations.map((item) => toWireOperation(item as Json)) };
}
