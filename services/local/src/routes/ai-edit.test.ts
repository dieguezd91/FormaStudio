import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { validateDocument, type FormaDocument, type OperationBatch } from '@forma/design-core';
import {
  documentWithPanelAndButton,
  mockProvider,
  nodeOf,
  promptOf,
  putDocument,
  SCREEN_ID,
} from '../ai/testing';
import { createProject, getDocument, sampleDocument, useServer } from '../testing';

interface Warning {
  code: string;
  message: string;
}
interface Preview {
  baseRevision: number;
  batch: OperationBatch;
  changes: string[];
  explanation: string;
  warnings: Warning[];
}
interface Ids {
  panelId: string;
  buttonId: string;
}

const modelAnswer = (operations: unknown[], extra: Record<string, unknown> = {}) => ({
  explanation: 'Cambié el color.',
  warnings: [],
  operations,
  ...extra,
});

const fill = (nodeId: string, color = '#ff00ff', screenId = SCREEN_ID) => ({
  type: 'updateNode',
  screenId,
  nodeId,
  patch: { style: { fill: color } },
});

/** Project with a panel and a button; responses are computed lazily so they can use node ids. */
async function setup(
  respond: ((ids: Ids) => unknown)[],
  mutate?: (doc: FormaDocument, ids: Ids) => void,
) {
  const fixture = documentWithPanelAndButton();
  const ids: Ids = { panelId: fixture.panelId, buttonId: fixture.buttonId };
  const provider = mockProvider(respond.map((r) => () => r(ids)));
  const app = useServer({ ai: provider.ai })();
  const { id } = await createProject(app);
  mutate?.(fixture.document, ids);
  await putDocument(app, id, fixture.document);
  return { app, projectId: id, provider, ...ids };
}

const edit = (app: FastifyInstance, projectId: string, body: Record<string, unknown> = {}) =>
  app.inject({
    method: 'POST',
    url: `/projects/${projectId}/ai/edit`,
    payload: {
      instruction: 'Pintá el botón de magenta',
      screenId: SCREEN_ID,
      selectedNodeIds: [],
      ...body,
    },
  });

describe('POST /projects/:id/ai/edit', () => {
  it('returns a preview and leaves the stored document, revision and log untouched', async () => {
    const t = await setup([(ids) => modelAnswer([fill(ids.buttonId)])]);
    const before = await getDocument(t.app, t.projectId);

    const response = await edit(t.app, t.projectId, { selectedNodeIds: [t.buttonId] });
    expect(response.statusCode).toBe(200);
    const preview = response.json<Preview>();
    expect(preview.batch.source).toBe('ai');
    expect(preview.batch.ops).toEqual([fill(t.buttonId)]);
    expect(preview.changes.join('\n')).toContain('Change style');
    expect(preview.explanation).toBe('Cambié el color.');
    expect(preview.baseRevision).toBe(before.revision);

    expect(await getDocument(t.app, t.projectId)).toEqual(before);
    const log = await t.app.inject({
      method: 'GET',
      url: `/projects/${t.projectId}/document/batches`,
    });
    expect(log.json().operationLog).toEqual([]);
  });

  it('produces a batch the client can apply through /document/batches (undo-able)', async () => {
    const t = await setup([(ids) => modelAnswer([fill(ids.buttonId, '#123456')])]);
    const preview = (await edit(t.app, t.projectId, { selectedNodeIds: [t.buttonId] })).json<Preview>();

    const applied = await t.app.inject({
      method: 'POST',
      url: `/projects/${t.projectId}/document/batches`,
      payload: { batch: preview.batch, baseRevision: preview.baseRevision },
    });
    expect(applied.statusCode).toBe(200);
    expect(applied.json().revision).toBe(preview.baseRevision + 1);
    expect(nodeOf(applied.json().document, t.buttonId)?.style.fill).toBe('#123456');
    expect(validateDocument(applied.json().document)).toEqual([]);
  });

  it('answers 422 locked, with the node, when the AI would change approved work', async () => {
    const t = await setup([(ids) => modelAnswer([fill(ids.buttonId)])], (doc, ids) => {
      doc.screens[0]!.nodes[ids.buttonId]!.locked = true;
    });
    const response = await edit(t.app, t.projectId, { selectedNodeIds: [t.buttonId] });
    expect(response.statusCode).toBe(422);
    const { error } = response.json();
    expect(error.code).toBe('locked');
    expect(error.details).toMatchObject({ opIndex: 0, nodeId: t.buttonId, screenId: SCREEN_ID });
    expect(error.message).toMatch(/bloqueado/);
    const doc = await getDocument(t.app, t.projectId);
    expect(nodeOf(doc.document, t.buttonId)?.style.fill).not.toBe('#ff00ff');
  });

  it('answers 422 nodeNotFound for an operation on a missing node', async () => {
    const t = await setup([() => modelAnswer([fill('node_ghost')])]);
    const response = await edit(t.app, t.projectId);
    expect(response.statusCode).toBe(422);
    expect(response.json().error).toMatchObject({
      code: 'nodeNotFound',
      details: { opIndex: 0, nodeId: 'node_ghost' },
    });
  });

  it('answers 422 when the selection names a node that is not in the screen', async () => {
    const t = await setup([]);
    const response = await edit(t.app, t.projectId, { selectedNodeIds: ['node_ghost'] });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('nodeNotFound');
    expect(t.provider.model.doGenerateCalls).toHaveLength(0);
  });

  it('rejects operations outside the selection subtree and says so (§6.4)', async () => {
    const t = await setup([(ids) => modelAnswer([fill(ids.buttonId), fill(ids.panelId, '#00ff00')])]);
    const response = await edit(t.app, t.projectId, { selectedNodeIds: [t.buttonId] });
    expect(response.statusCode).toBe(200);
    const preview = response.json<Preview>();
    expect(preview.batch.ops).toEqual([fill(t.buttonId)]);
    expect(preview.warnings).toContainEqual(
      expect.objectContaining({ code: 'outOfSelection', message: expect.stringContaining(t.panelId) }),
    );
  });

  it('allows the whole screen when nothing is selected', async () => {
    const t = await setup([(ids) => modelAnswer([fill(ids.buttonId), fill(ids.panelId, '#00ff00')])]);
    const preview = (await edit(t.app, t.projectId)).json<Preview>();
    expect(preview.batch.ops).toHaveLength(2);
    expect(preview.warnings).toEqual([]);
  });

  it('keeps document-level operations out of a scoped edit but allows them for a screen edit', async () => {
    const token = { type: 'setToken', group: 'colors', name: 'accent', value: '#ff0000' };
    const t = await setup([() => modelAnswer([token]), () => modelAnswer([token])]);
    const scoped = (
      await edit(t.app, t.projectId, { selectedNodeIds: [t.buttonId] })
    ).json<Preview>();
    expect(scoped.batch.ops).toEqual([]);
    expect(scoped.warnings.map((w) => w.code)).toContain('outOfSelection');

    const wholeScreen = (await edit(t.app, t.projectId)).json<Preview>();
    expect(wholeScreen.batch.ops).toEqual([token]);
  });

  it('rejects node operations aimed at another screen', async () => {
    const t = await setup([(ids) => modelAnswer([fill(ids.buttonId, '#ff00ff', 'screen_other')])]);
    const preview = (await edit(t.app, t.projectId)).json<Preview>();
    expect(preview.batch.ops).toEqual([]);
    expect(preview.warnings.map((w) => w.code)).toContain('outOfSelection');
  });

  it('expands library insertions into addNode operations that apply cleanly', async () => {
    const t = await setup([
      (ids) =>
        modelAnswer([
          { insertEntry: { entryId: 'button', params: { label: 'Cerrar' }, parentId: ids.panelId } },
        ]),
    ]);
    const response = await edit(t.app, t.projectId, {
      instruction: 'Agregá un botón Cerrar al panel',
      selectedNodeIds: [t.panelId],
    });
    expect(response.statusCode).toBe(200);
    const preview = response.json<Preview>();
    expect(preview.batch.source).toBe('ai');
    const added = preview.batch.ops.filter((op) => op.type === 'addNode');
    expect(added.length).toBeGreaterThan(0);
    expect(added[0]).toMatchObject({ parentId: t.panelId });
    expect(preview.changes.join('\n')).toContain('Add node');

    const applied = await t.app.inject({
      method: 'POST',
      url: `/projects/${t.projectId}/document/batches`,
      payload: { batch: preview.batch, baseRevision: preview.baseRevision },
    });
    expect(applied.statusCode).toBe(200);
    const doc = applied.json().document as FormaDocument;
    expect(validateDocument(doc)).toEqual([]);
    expect(nodeOf(doc, t.panelId)?.children.length).toBe(1);
  });

  it('rejects an insertion whose parent is outside the selection', async () => {
    const t = await setup([
      (ids) =>
        modelAnswer([{ insertEntry: { entryId: 'button', params: {}, parentId: ids.panelId } }]),
    ]);
    const preview = (
      await edit(t.app, t.projectId, { selectedNodeIds: [t.buttonId] })
    ).json<Preview>();
    expect(preview.batch.ops).toEqual([]);
    expect(preview.warnings.map((w) => w.code)).toContain('outOfSelection');
  });

  it('retries once on an unknown library entry, then answers 502', async () => {
    const bad = (ids: Ids) =>
      modelAnswer([{ insertEntry: { entryId: 'nope', params: {}, parentId: ids.panelId } }]);
    const t = await setup([bad, bad]);
    const response = await edit(t.app, t.projectId);
    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe('aiInvalidOutput');
    expect(JSON.stringify(response.json().error.issues)).toContain('nope');
    expect(t.provider.model.doGenerateCalls).toHaveLength(2);
  });

  it('retries once when an operation does not match the design-core schema', async () => {
    const t = await setup([
      () => modelAnswer([{ type: 'updateNode', screenId: SCREEN_ID, nodeId: 'x', patch: { bogus: 1 } }]),
      (ids) => modelAnswer([fill(ids.buttonId)]),
    ]);
    const response = await edit(t.app, t.projectId);
    expect(response.statusCode).toBe(200);
    expect(t.provider.model.doGenerateCalls).toHaveLength(2);
  });

  it('retries when the result would break the document (unknown data source in a binding)', async () => {
    const dangling = (ids: Ids) =>
      modelAnswer([
        {
          type: 'setBinding',
          screenId: SCREEN_ID,
          nodeId: ids.buttonId,
          binding: { id: 'b1', prop: 'label', dataSourceId: 'ds_ghost', path: 'x' },
        },
      ]);
    const t = await setup([dangling, (ids) => modelAnswer([fill(ids.buttonId)])]);
    const response = await edit(t.app, t.projectId);
    expect(response.statusCode).toBe(200);
    expect(t.provider.model.doGenerateCalls).toHaveLength(2);
    expect(promptOf(t.provider.model.doGenerateCalls[1])).toContain('ds_ghost');
  });

  it('passes the selection scope, locked flags and proposals to the model', async () => {
    const t = await setup([(ids) => modelAnswer([fill(ids.buttonId)])]);
    const proposal = await t.app.inject({
      method: 'POST',
      url: `/projects/${t.projectId}/proposals`,
      payload: {
        title: 'Propuesta Alfa',
        summary: 'Resumen alfa',
        rationale: { need: '', patterns: [], tradeoffs: [], fromReferences: [], requirementIds: [] },
        document: sampleDocument('Alfa'),
        origin: 'ai',
      },
    });
    const response = await edit(t.app, t.projectId, {
      instruction: 'Combiná esto con la propuesta Alfa',
      selectedNodeIds: [t.buttonId],
      proposalIds: [proposal.json().id],
    });
    expect(response.statusCode).toBe(200);
    const prompt = promptOf(t.provider.model.doGenerateCalls[0]);
    expect(prompt).toContain('Propuesta Alfa');
    expect(prompt).toContain('Combiná esto con la propuesta Alfa');
    expect(prompt).toContain(t.buttonId);
  });

  it('answers 404 for an unknown proposal and 400 for a malformed request', async () => {
    const t = await setup([]);
    expect((await edit(t.app, t.projectId, { proposalIds: ['prop_ghost'] })).statusCode).toBe(404);
    expect((await edit(t.app, t.projectId, { instruction: '  ' })).statusCode).toBe(400);
    expect((await edit(t.app, t.projectId, { screenId: 'screen_ghost' })).statusCode).toBe(404);
    expect(t.provider.model.doGenerateCalls).toHaveLength(0);
  });

  it('returns an empty preview with the model warning when nothing can be done', async () => {
    const t = await setup([() => modelAnswer([], { warnings: ['No hay operación para eso.'] })]);
    const preview = (await edit(t.app, t.projectId)).json<Preview>();
    expect(preview.batch.ops).toEqual([]);
    expect(preview.changes).toEqual([]);
    expect(preview.warnings).toContainEqual(
      expect.objectContaining({ code: 'model', message: 'No hay operación para eso.' }),
    );
  });
});
