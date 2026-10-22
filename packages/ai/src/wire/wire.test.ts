import { describe, expect, it } from 'vitest';
import type { Schema } from 'ai';
import { operationSchema } from '@forma/design-core';
import { toWireEdit, toWireProposals } from '../testing';
import { editWire, proposalsWire, requirementsWire, WIRE_OPERATION_TYPES } from './index';

type Outcome<T> = { ok: true; value: T } | { ok: false; issues: string[] };

/** Runs the same validation the AI SDK runs on the model's JSON answer. */
async function check<T>(schema: Schema<T>, answer: unknown): Promise<Outcome<T>> {
  const result = await schema.validate!(answer);
  if (result.success) return { ok: true, value: result.value };
  return { ok: false, issues: (result.error as { issues?: string[] }).issues ?? [String(result.error)] };
}

const expectOk = async <T>(schema: Schema<T>, answer: unknown): Promise<T> => {
  const outcome = await check(schema, answer);
  if (!outcome.ok) throw new Error(`expected a valid answer, got: ${outcome.issues.join(' | ')}`);
  return outcome.value;
};

const expectIssues = async <T>(schema: Schema<T>, answer: unknown): Promise<string[]> => {
  const outcome = await check(schema, answer);
  if (outcome.ok) throw new Error('expected validation issues');
  return outcome.issues;
};

const requirement = {
  text: 'Arrastrar objetos entre casillas',
  kind: 'interaction',
  status: 'confirmed',
  sourceRefs: [{ sourceId: 'src_1', excerpt: 'se arrastran' }],
};

describe('requirements wire', () => {
  it('maps the wire answer to the strict domain output', async () => {
    expect(await expectOk(requirementsWire, { requirements: [requirement] })).toEqual({
      requirements: [requirement],
    });
  });

  it('still enforces the strict server-side limits the wire schema does not send', async () => {
    const tooLong = { ...requirement, text: 'x'.repeat(1001) };
    const issues = await expectIssues(requirementsWire, { requirements: [tooLong] });
    expect(issues.join('\n')).toMatch(/requirements\.0\.text/);
    expect(await expectIssues(requirementsWire, { requirements: [{ ...requirement, kind: 'nope' }] })).not.toHaveLength(0);
    expect(await expectIssues(requirementsWire, { requirements: Array(61).fill(requirement) })).not.toHaveLength(0);
  });
});

const placement = {
  entryId: 'inventory.grid',
  params: [
    { key: 'columns', number: 6 },
    { key: 'title', text: 'Mochila' },
    { key: 'showCount', boolean: true },
    { key: 'categories', list: ['todo', 'armas'] },
  ],
  region: { x: 10, y: 20, width: 400, height: 300 },
};
const rationale = { need: 'n', patterns: ['p'], tradeoffs: [], fromReferences: [], requirementIds: ['req_1'] };
const plan = { title: 'A', summary: 's', rationale, layout: [placement] };

describe('proposals wire', () => {
  it('turns key/value param lists and token lists back into records', async () => {
    const output = await expectOk(proposalsWire, {
      proposals: [
        {
          ...plan,
          layout: [placement, { ...placement, entryId: 'button', params: [], parentRef: 0 }],
          tokens: { colors: [{ name: 'accent', value: '#ff0000' }], spacing: [{ name: 'md', value: 20 }] },
        },
      ],
    });
    const [first] = output.proposals;
    expect(first!.layout[0]!.params).toEqual({
      columns: 6,
      title: 'Mochila',
      showCount: true,
      categories: ['todo', 'armas'],
    });
    expect(first!.layout[1]).toMatchObject({ params: {}, parentRef: 0 });
    expect(first!.tokens).toEqual({ colors: { accent: '#ff0000' }, spacing: { md: 20 } });
  });

  it('rejects params that set zero or several value fields, and duplicate keys', async () => {
    const bad = (params: unknown[]) =>
      expectIssues(proposalsWire, { proposals: [{ ...plan, layout: [{ ...placement, params }] }] });
    expect((await bad([{ key: 'a' }])).join('\n')).toMatch(/proposals\.0\.layout\.0\.params\.0.*exactly one/);
    expect((await bad([{ key: 'a', text: 'x', number: 1 }])).join('\n')).toMatch(/exactly one/);
    expect((await bad([{ key: 'a', text: 'x' }, { key: 'a', text: 'y' }])).join('\n')).toMatch(/duplicate/i);
  });

  it('keeps domain rules: positive region, integer parentRef, at least one placement', async () => {
    const withLayout = (layout: unknown[]) => expectIssues(proposalsWire, { proposals: [{ ...plan, layout }] });
    expect(await withLayout([{ ...placement, region: { ...placement.region, width: 0 } }])).not.toHaveLength(0);
    expect(await withLayout([{ ...placement, parentRef: 1.5 }])).not.toHaveLength(0);
    expect(await withLayout([])).not.toHaveLength(0);
  });

  it('does not let a param named __proto__ reach the prototype', async () => {
    const output = await expectOk(proposalsWire, {
      proposals: [{ ...plan, layout: [{ ...placement, params: [{ key: '__proto__', text: 'x' }] }] }],
    });
    const params = output.proposals[0]!.layout[0]!.params;
    expect(Object.getPrototypeOf(params)).toBe(Object.prototype);
    expect(Object.hasOwn(Object.prototype, 'x')).toBe(false);
    expect(Object.keys(params)).not.toContain('x');
  });
});

const edit = (operations: unknown[]) => ({ explanation: 'Listo', warnings: [], operations });
const common = { screenId: 'screen_main', nodeId: 'n1' };

describe('edit wire', () => {
  it('covers every design-core operation except raw node/screen creation, plus insertEntry', () => {
    const domain = operationSchema.options.map((option) => option.shape.type.value);
    const expected = [...domain.filter((type) => type !== 'addNode' && type !== 'addScreen'), 'insertEntry'];
    expect([...WIRE_OPERATION_TYPES].sort()).toEqual(expected.sort());
  });

  it('maps patch entries per section, token references and removals', async () => {
    const output = await expectOk(
      editWire,
      edit([
        {
          type: 'updateNode',
          ...common,
          name: 'Botón',
          patch: [
            { section: 'style', key: 'fill', text: '#ffffff' },
            { section: 'style', key: 'radius', token: 'radii.md' },
            { section: 'style', key: 'stroke', remove: true },
            { section: 'layout', key: 'width', number: 200 },
            { section: 'layout', key: 'cellSize.width', number: 48 },
            { section: 'layout', key: 'cellSize.height', number: 48 },
            { section: 'props', key: 'label', text: 'Cerrar' },
            { section: 'props', key: 'placeholder', boolean: false },
          ],
        },
      ]),
    );
    expect(output.operations).toEqual([
      {
        type: 'updateNode',
        ...common,
        patch: {
          name: 'Botón',
          style: { fill: '#ffffff', radius: { token: 'radii.md' }, stroke: null },
          layout: { width: 200, cellSize: { width: 48, height: 48 } },
          props: { label: 'Cerrar', placeholder: false },
        },
      },
    ]);
  });

  it('reports domain problems of a patch at the operation path', async () => {
    const issues = await expectIssues(
      editWire,
      edit([{ type: 'updateNode', ...common, patch: [{ section: 'style', key: 'bogus', text: 'x' }] }]),
    );
    expect(issues.join('\n')).toMatch(/operations\.0/);
  });

  it('rejects patch entries with no value, several values, or token in props', async () => {
    const bad = (entry: unknown) => expectIssues(editWire, edit([{ type: 'updateNode', ...common, patch: [entry] }]));
    expect((await bad({ section: 'style', key: 'fill' })).join('\n')).toMatch(/exactly one/);
    expect((await bad({ section: 'style', key: 'fill', text: 'a', number: 1 })).join('\n')).toMatch(/exactly one/);
    expect((await bad({ section: 'props', key: 'label', token: 'colors.x' })).join('\n')).toMatch(/token/);
  });

  it('builds each operation from its own fields and ignores the rest', async () => {
    const output = await expectOk(
      editWire,
      edit([
        { type: 'removeNode', ...common, bindingId: 'ignored' },
        { type: 'moveNode', ...common, newParentId: 'p2', index: 0 },
        { type: 'setToken', group: 'colors', name: 'accent', valueText: '#ff0000' },
        { type: 'setToken', group: 'spacing', name: 'md', valueNumber: 20 },
        { type: 'removeToken', group: 'colors', name: 'old' },
        { type: 'renameScreen', screenId: 'screen_main', name: 'Inventario' },
        { type: 'removeBehavior', ...common, kind: 'split' },
        {
          type: 'setBinding',
          ...common,
          binding: { id: 'b1', prop: 'text', dataSourceId: 'ds1', path: 'items[0].name' },
        },
        { type: 'removeBinding', ...common, bindingId: 'b1' },
        { type: 'removeIntent', intentId: 'i1' },
        { type: 'removeDataSource', dataSourceId: 'ds1' },
        { type: 'removeScreen', screenId: 'screen_old' },
      ]),
    );
    expect(output.operations).toEqual([
      { type: 'removeNode', ...common },
      { type: 'moveNode', ...common, newParentId: 'p2', index: 0 },
      { type: 'setToken', group: 'colors', name: 'accent', value: '#ff0000' },
      { type: 'setToken', group: 'spacing', name: 'md', value: 20 },
      { type: 'removeToken', group: 'colors', name: 'old' },
      { type: 'renameScreen', screenId: 'screen_main', name: 'Inventario' },
      { type: 'removeBehavior', ...common, kind: 'split' },
      {
        type: 'setBinding',
        ...common,
        binding: { id: 'b1', prop: 'text', dataSourceId: 'ds1', path: 'items[0].name' },
      },
      { type: 'removeBinding', ...common, bindingId: 'b1' },
      { type: 'removeIntent', intentId: 'i1' },
      { type: 'removeDataSource', dataSourceId: 'ds1' },
      { type: 'removeScreen', screenId: 'screen_old' },
    ]);
  });

  it('keeps only the fields that belong to a behavior kind', async () => {
    const output = await expectOk(
      editWire,
      edit([
        {
          type: 'setBehavior',
          ...common,
          behavior: {
            kind: 'tabs',
            tabs: [{ id: 't1', label: 'Armas', contentNodeId: 'c1' }],
            initialTabId: 't1',
            mode: 'multi',
          },
        },
        { type: 'setBehavior', ...common, behavior: { kind: 'stack', maxStack: 99, showCount: true }, index: 0 },
        {
          type: 'setBehavior',
          ...common,
          behavior: { kind: 'contextMenu', trigger: 'secondaryClick', actions: [{ id: 'a', label: 'Usar', intentId: 'i' }] },
        },
      ]),
    );
    expect(output.operations).toEqual([
      {
        type: 'setBehavior',
        ...common,
        behavior: { kind: 'tabs', tabs: [{ id: 't1', label: 'Armas', contentNodeId: 'c1' }], initialTabId: 't1' },
      },
      { type: 'setBehavior', ...common, behavior: { kind: 'stack', maxStack: 99, showCount: true }, index: 0 },
      {
        type: 'setBehavior',
        ...common,
        behavior: { kind: 'contextMenu', trigger: 'secondaryClick', actions: [{ id: 'a', label: 'Usar', intentId: 'i' }] },
      },
    ]);
  });

  it('decodes data source mock data from JSON text and reports malformed JSON', async () => {
    const dataSource = {
      id: 'ds1',
      name: 'Items',
      kind: 'collection',
      fields: [{ name: 'name', type: 'string' }],
      connection: 'simulated',
    };
    const output = await expectOk(
      editWire,
      edit([{ type: 'upsertDataSource', dataSource: { ...dataSource, mockJson: '[{"name":"Espada"}]' } }]),
    );
    expect(output.operations[0]).toEqual({
      type: 'upsertDataSource',
      dataSource: { ...dataSource, mock: [{ name: 'Espada' }] },
    });
    const issues = await expectIssues(
      editWire,
      edit([{ type: 'upsertDataSource', dataSource: { ...dataSource, mockJson: '[{' } }]),
    );
    expect(issues.join('\n')).toMatch(/operations\.0\.dataSource\.mockJson/);
  });

  it('maps intents', async () => {
    const intent = {
      id: 'i1',
      name: 'useItem',
      description: 'Usar',
      payload: [{ name: 'itemId', type: 'id' }],
      connection: 'unconnected',
    };
    const output = await expectOk(editWire, edit([{ type: 'upsertIntent', intent, index: 0 }]));
    expect(output.operations[0]).toEqual({ type: 'upsertIntent', intent, index: 0 });
  });

  it('maps library insertions to the insertEntry request', async () => {
    const output = await expectOk(
      editWire,
      edit([
        {
          type: 'insertEntry',
          entryId: 'button',
          parentId: 'p1',
          params: [{ key: 'label', text: 'Cerrar' }],
        },
      ]),
    );
    expect(output.operations).toEqual([
      { insertEntry: { entryId: 'button', params: { label: 'Cerrar' }, parentId: 'p1' } },
    ]);
  });

  it('requires the fields of the chosen type, with a path pointing at the operation', async () => {
    const issues = await expectIssues(editWire, edit([{ type: 'removeNode', screenId: 'screen_main' }]));
    expect(issues.join('\n')).toMatch(/operations\.0\.nodeId/);
    const insertIssues = await expectIssues(editWire, edit([{ type: 'insertEntry', entryId: 'button' }]));
    expect(insertIssues.join('\n')).toMatch(/operations\.0/);
  });

  it('does not let the model emit raw nodes or screens', async () => {
    expect(await expectIssues(editWire, edit([{ type: 'addNode', ...common, parentId: 'p', node: {} }]))).not.toHaveLength(0);
    expect(await expectIssues(editWire, edit([{ type: 'addScreen', screen: {} }]))).not.toHaveLength(0);
  });

  it('applies the strict caps of the domain output', async () => {
    const remove = { type: 'removeNode', ...common };
    expect(await expectIssues(editWire, edit(Array(51).fill(remove)))).not.toHaveLength(0);
    expect(await expectOk(editWire, edit(Array(50).fill(remove)))).toBeDefined();
    expect(await expectIssues(editWire, { ...edit([]), explanation: 'x'.repeat(2001) })).not.toHaveLength(0);
  });
});

describe('test encoders (domain -> wire)', () => {
  it('round-trip an edit through the wire schema unchanged', async () => {
    const domain = edit([
      { type: 'updateNode', ...common, patch: { name: 'X', style: { fill: { token: 'colors.accent' }, stroke: null }, layout: { cellSize: { width: 4, height: 5 } }, props: { label: 'L' } } },
      { type: 'setToken', group: 'colors', name: 'a', value: '#fff' },
      { type: 'setToken', group: 'spacing', name: 'b', value: 3 },
      { insertEntry: { entryId: 'button', params: { label: 'Cerrar', n: 2, on: true, xs: ['a'] }, parentId: 'p' } },
      { type: 'removeNode', ...common },
    ]);
    expect(await expectOk(editWire, toWireEdit(domain))).toEqual(domain);
  });

  it('round-trip proposals through the wire schema unchanged', async () => {
    const domain = {
      proposals: [
        { ...plan, layout: [{ ...placement, params: { columns: 6, title: 'T' } }], tokens: { colors: { a: '#fff' } } },
      ],
    };
    expect(await expectOk(proposalsWire, toWireProposals(domain))).toEqual(domain);
  });
});
