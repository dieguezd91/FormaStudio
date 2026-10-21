import { describe, expect, it } from 'vitest';
import {
  addScreenBatch,
  createProject,
  getDocument,
  sampleDocument,
  structurallyBrokenDocument,
  useServer,
} from '../testing';

describe('design document', () => {
  const server = useServer();

  const put = (projectId: string, payload: object) =>
    server().inject({ method: 'PUT', url: `/projects/${projectId}/document`, payload });
  const batch = (projectId: string, payload: object) =>
    server().inject({ method: 'POST', url: `/projects/${projectId}/document/batches`, payload });

  it('replaces the document and bumps the revision', async () => {
    const { id } = await createProject(server());
    const response = await put(id, { document: sampleDocument('V2'), baseRevision: 1 });
    expect(response.statusCode).toBe(200);
    expect(response.json().revision).toBe(2);
    const current = await getDocument(server(), id);
    expect(current.revision).toBe(2);
    expect(current.document.name).toBe('V2');
    expect(current.document.screens).toHaveLength(1);
  });

  it('answers 409 on a stale baseRevision and leaves the document untouched', async () => {
    const { id } = await createProject(server());
    await put(id, { document: sampleDocument('V2'), baseRevision: 1 });
    const stale = await put(id, { document: sampleDocument('V3'), baseRevision: 1 });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toMatchObject({
      code: 'revisionConflict',
      details: { currentRevision: 2 },
    });
    expect((await getDocument(server(), id)).document.name).toBe('V2');
  });

  it('answers 422 with issues for a document that fails schema parsing', async () => {
    const { id } = await createProject(server());
    const response = await put(id, {
      document: { schemaVersion: 1, name: 'bad' },
      baseRevision: 1,
    });
    expect(response.statusCode).toBe(422);
    const { error } = response.json();
    expect(error.code).toBe('invalidDocument');
    expect(error.issues.length).toBeGreaterThan(0);
    expect((await getDocument(server(), id)).revision).toBe(1);
  });

  it('answers 422 with issues for a structurally broken document', async () => {
    const { id } = await createProject(server());
    const response = await put(id, { document: structurallyBrokenDocument(), baseRevision: 1 });
    expect(response.statusCode).toBe(422);
    const { error } = response.json();
    expect(error.code).toBe('invalidDocument');
    expect(error.issues[0].message).toContain('rootMissing');
  });

  it('answers 400 when baseRevision is missing', async () => {
    const { id } = await createProject(server());
    const response = await put(id, { document: sampleDocument() });
    expect(response.statusCode).toBe(400);
  });

  it('applies an operation batch server-side and returns the new document and revision', async () => {
    const { id } = await createProject(server());
    const response = await batch(id, { batch: addScreenBatch(), baseRevision: 1 });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.revision).toBe(2);
    expect(body.document.screens.map((s: { id: string }) => s.id)).toEqual(['screen_extra']);
    expect((await getDocument(server(), id)).document.screens).toHaveLength(1);
  });

  it('records applied batches in the operation log', async () => {
    const { id } = await createProject(server());
    await batch(id, { batch: addScreenBatch('batch_a'), baseRevision: 1 });
    const { operationLog } = (
      await server().inject({ method: 'GET', url: `/projects/${id}/document/batches` })
    ).json();
    expect(operationLog).toHaveLength(1);
    expect(operationLog[0]).toMatchObject({
      id: 'batch_a',
      label: 'Add screen',
      source: 'manual',
      revision: 2,
    });
    expect(operationLog[0].ops[0].type).toBe('addScreen');
  });

  it('answers 409 for a batch on a stale revision', async () => {
    const { id } = await createProject(server());
    await batch(id, { batch: addScreenBatch('b1'), baseRevision: 1 });
    const stale = await batch(id, { batch: addScreenBatch('b2', 'screen_two'), baseRevision: 1 });
    expect(stale.statusCode).toBe(409);
  });

  it('answers 422 with the batch parse issues for a malformed batch', async () => {
    const { id } = await createProject(server());
    const response = await batch(id, {
      batch: { id: 'b', label: 'x', source: 'manual', ops: [{ type: 'explode' }] },
      baseRevision: 1,
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error).toMatchObject({ code: 'invalidBatch' });
    expect(response.json().error.issues.length).toBeGreaterThan(0);
  });

  it('answers 422 with the typed operation error and changes nothing when an op fails', async () => {
    const { id } = await createProject(server());
    const response = await batch(id, {
      batch: {
        id: 'b',
        label: 'Rename ghost',
        source: 'manual',
        ops: [{ type: 'renameScreen', screenId: 'ghost', name: 'x' }],
      },
      baseRevision: 1,
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error).toMatchObject({
      code: 'screenNotFound',
      details: { opIndex: 0 },
    });
    expect((await getDocument(server(), id)).revision).toBe(1);
    const log = await server().inject({ method: 'GET', url: `/projects/${id}/document/batches` });
    expect(log.json().operationLog).toEqual([]);
  });
});
