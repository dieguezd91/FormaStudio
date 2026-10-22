import { describe, expect, it, vi } from 'vitest';
import { applyBatch, type FormaDocument, type OperationBatch } from '@forma/design-core';
import { ApiError, abortedError } from '@/api/errors';
import type { EditPreview, ImpactReport, ProposalMeta, StoredDocument } from '@/api/types';
import { makeBatch } from '../batches';
import { createEditorStore, type EditorApi } from '../session';
import { emptyDoc, inventoryDoc, ROOT_ID, SCREEN_ID } from '../testing';
import { createAiStore, impactOf, type AiApi } from './aiStore';

function setup(initial: FormaDocument = emptyDoc()) {
  const server = { document: initial, revision: 1 };
  const calls: string[] = [];
  const editorApi: EditorApi = {
    getDocument: async () => structuredClone(server) as StoredDocument,
    applyBatch: async (_id, batch) => {
      const applied = applyBatch(server.document, batch);
      if (!applied.ok) throw new Error(applied.error.message);
      server.document = applied.doc;
      server.revision += 1;
      return structuredClone(server) as StoredDocument;
    },
  };
  const proposal: ProposalMeta = {
    id: 'prop1',
    title: 'Con pestañas',
    summary: '',
    rationale: { need: '', patterns: [], tradeoffs: [], fromReferences: [], requirementIds: [] },
    origin: 'ai',
    status: 'candidate',
    createdAt: '',
    updatedAt: '',
  };
  const api = {
    listSources: vi.fn(async () => []),
    listRequirements: vi.fn(async () => []),
    listProposals: vi.fn(async () => [proposal]),
    getProposal: vi.fn(),
    setProposalStatus: vi.fn(),
    createVersion: vi.fn(async (_id: string, label: string) => {
      calls.push(`version:${label}`);
      return {} as never;
    }),
    adoptProposal: vi.fn(async (_id: string, _pid: string, baseRevision?: number) => {
      calls.push(`adopt:${baseRevision}`);
      server.document = inventoryDoc();
      server.revision += 1;
      return { ...structuredClone(server), proposal } as never;
    }),
    extractRequirements: vi.fn(),
    generateProposals: vi.fn(),
    previewEdit: vi.fn(),
    getImpact: vi.fn(async (): Promise<ImpactReport> => ({ since: null, impacts: [] })),
  } satisfies AiApi;
  const editor = createEditorStore(editorApi);
  const ai = createAiStore(api, editor);
  return { server, calls, api, editor, ai, proposal };
}

const renameBatch = (name: string): OperationBatch => ({
  ...makeBatch('IA: renombrar', [
    { type: 'updateNode', screenId: SCREEN_ID, nodeId: ROOT_ID, patch: { name } },
  ]),
  source: 'ai',
});

const previewOf = (baseRevision: number, name = 'Raíz nueva'): EditPreview => ({
  baseRevision,
  batch: renameBatch(name),
  changes: ["Rename 'Pantalla 1' to 'Raíz nueva'"],
  explanation: 'Renombré la raíz.',
  warnings: [],
});

async function ready() {
  const ctx = setup();
  await ctx.editor.getState().open('p1', 'Proyecto');
  await ctx.ai.getState().open('p1');
  return ctx;
}

describe('analyze', () => {
  it('stores the requirements and warnings of a successful run', async () => {
    const { ai, api } = await ready();
    api.extractRequirements.mockResolvedValue({
      requirements: [{ id: 'r1', text: 'Ver objetos', kind: 'goal', status: 'confirmed', sourceRefs: [] }],
      warnings: [{ code: 'sourceSkipped', message: 'Se omitió x' }],
      usedSources: [],
    });
    await ai.getState().analyze(['s1']);
    expect(api.extractRequirements).toHaveBeenCalledWith('p1', ['s1'], expect.any(AbortSignal));
    expect(ai.getState().requirements.map((r) => r.id)).toEqual(['r1']);
    expect(ai.getState().requirementWarnings).toHaveLength(1);
    expect(ai.getState().requirementsBusy).toBe(false);
    expect(ai.getState().availability).toBe('available');
  });

  it('marks AI unavailable with the env var explanation and leaves manual state untouched', async () => {
    const { ai, api, editor } = await ready();
    api.extractRequirements.mockRejectedValue(
      new ApiError({
        kind: 'aiUnavailable',
        status: 503,
        code: 'aiUnavailable',
        message: 'Falta GOOGLE_GENERATIVE_AI_API_KEY',
      }),
    );
    await ai.getState().analyze(['s1']);
    expect(ai.getState().availability).toBe('unavailable');
    expect(ai.getState().requirementsError).toContain('GOOGLE_GENERATIVE_AI_API_KEY');
    expect(editor.getState().status).toBe('ready');
  });

  it('a cancelled run is not an error and releases the busy flag', async () => {
    const { ai, api } = await ready();
    api.extractRequirements.mockImplementation(
      (_id: string, _ids: unknown, signal?: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(abortedError()));
        }),
    );
    const run = ai.getState().analyze(['s1']);
    await vi.waitFor(() => expect(api.extractRequirements).toHaveBeenCalled());
    expect(ai.getState().requirementsBusy).toBe(true);
    ai.getState().cancelGeneration();
    await run;
    expect(ai.getState().requirementsBusy).toBe(false);
    expect(ai.getState().requirementsError).toBeNull();
  });
});

describe('adopt', () => {
  it('saves a version before replacing the document, using the editor revision', async () => {
    const { ai, editor, calls, proposal } = await ready();
    const before = editor.getState().revision;
    await expect(ai.getState().adopt(proposal)).resolves.toBe(true);
    expect(calls).toEqual(['version:Antes de adoptar Con pestañas', `adopt:${before}`]);
    expect(editor.getState().doc?.screens[0]?.nodes && Object.keys(editor.getState().doc!.screens[0]!.nodes).length).toBeGreaterThan(1);
    expect(editor.getState().history.undoStack).toHaveLength(0);
    expect(editor.getState().notice?.message).toContain('Versiones');
  });

  it('does not adopt when the version could not be saved', async () => {
    const { ai, api, editor, proposal } = await ready();
    api.createVersion.mockRejectedValueOnce(new Error('sin espacio'));
    await expect(ai.getState().adopt(proposal)).resolves.toBe(false);
    expect(api.adoptProposal).not.toHaveBeenCalled();
    expect(editor.getState().notice?.kind).toBe('error');
  });
});

describe('edit preview', () => {
  it('applies a fresh preview through the editor so it is undoable', async () => {
    const { ai, api, editor } = await ready();
    api.previewEdit.mockResolvedValue(previewOf(editor.getState().revision));
    await ai.getState().requestEdit('renombrá', []);
    expect(api.previewEdit).toHaveBeenCalledWith(
      'p1',
      { instruction: 'renombrá', screenId: SCREEN_ID, selectedNodeIds: [] },
      expect.any(AbortSignal),
    );
    expect(ai.getState().edit.phase).toBe('preview');
    await ai.getState().applyEdit();
    expect(ai.getState().edit.phase).toBe('idle');
    expect(editor.getState().doc?.screens[0]?.nodes[ROOT_ID]?.name).toBe('Raíz nueva');
    editor.getState().undo();
    expect(editor.getState().doc?.screens[0]?.nodes[ROOT_ID]?.name).not.toBe('Raíz nueva');
  });

  it('re-requests the preview instead of applying when the document changed since', async () => {
    const { ai, api, editor } = await ready();
    const stale = previewOf(editor.getState().revision, 'Vieja');
    api.previewEdit.mockResolvedValueOnce(stale);
    await ai.getState().requestEdit('renombrá', []);

    // The user keeps editing: the revision moves on.
    editor.getState().dispatch(makeBatch('Manual', [{ type: 'updateNode', screenId: SCREEN_ID, nodeId: ROOT_ID, patch: { name: 'Manual' } }]));
    await editor.getState().whenSynced();
    const fresh = previewOf(editor.getState().revision, 'Nueva');
    api.previewEdit.mockResolvedValueOnce(fresh);

    await ai.getState().applyEdit();
    expect(api.previewEdit).toHaveBeenCalledTimes(2);
    expect(editor.getState().doc?.screens[0]?.nodes[ROOT_ID]?.name).toBe('Manual');
    const edit = ai.getState().edit;
    expect(edit.phase === 'preview' && edit.refreshed && edit.preview.baseRevision).toBe(fresh.baseRevision);
  });

  it('shows the Spanish reason when the preview request is rejected', async () => {
    const { ai, api } = await ready();
    api.previewEdit.mockRejectedValue(
      new ApiError({ kind: 'rejected', status: 422, code: 'locked', message: 'El nodo «Panel» está bloqueado.' }),
    );
    await ai.getState().requestEdit('movelo', []);
    const edit = ai.getState().edit;
    expect(edit.phase === 'error' && edit.message).toBe('El nodo «Panel» está bloqueado.');
  });
});

describe('sourcesChanged', () => {
  it('collects impact reports and only asks for newer changes afterwards', async () => {
    const { ai, api } = await ready();
    const impact = {
      change: { sourceId: 's1', sourceVersion: 2, change: 'updated' as const, changedAt: '2999-01-01T00:00:00.000Z' },
      requirements: [{ id: 'r1', text: 'Ver objetos', status: 'confirmed' as const, referencedVersion: 1 }],
      proposals: [],
      screens: [],
    };
    api.getImpact.mockResolvedValueOnce({ since: null, impacts: [impact] });
    await ai.getState().sourcesChanged();
    expect(impactOf(ai.getState())?.requirements.map((r) => r.id)).toEqual(['r1']);

    await ai.getState().sourcesChanged();
    expect(api.getImpact).toHaveBeenLastCalledWith('p1', '2999-01-01T00:00:00.000Z');
    ai.getState().dismissImpact();
    expect(impactOf(ai.getState())).toBeNull();
  });
});
