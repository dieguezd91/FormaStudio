import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  createSequentialIdGenerator,
  type FormaDocument,
  type OperationBatch,
} from '@forma/design-core';
import { ApiError, serviceUnavailableError } from '@/api/errors';
import type { StoredDocument } from '@/api/types';
import { updateNodeBatch } from './batches';
import { createEditorStore, type EditorApi } from './session';
import { emptyDoc, inventoryDoc, nodesOfType, screenOf, SCREEN_ID } from './testing';

/** In-memory stand-in for the local service with the same revision/validation rules. */
function fakeServer(initial: FormaDocument) {
  const state = { document: initial, revision: 1 };
  const received: { batch: OperationBatch; baseRevision: number }[] = [];
  const failures: Error[] = [];
  const api: EditorApi = {
    getDocument: async () => structuredClone(state) as StoredDocument,
    applyBatch: async (_id, batch, baseRevision) => {
      received.push({ batch, baseRevision });
      const failure = failures.shift();
      if (failure) throw failure;
      if (baseRevision !== state.revision) {
        throw new ApiError({ kind: 'conflict', status: 409, code: 'revisionConflict', message: 'x' });
      }
      const applied = applyBatch(state.document, batch);
      if (!applied.ok) {
        throw new ApiError({ kind: 'rejected', status: 422, code: applied.error.code, message: 'No.' });
      }
      state.document = applied.doc;
      state.revision += 1;
      return structuredClone(state) as StoredDocument;
    },
  };
  return { state, received, failures, api };
}

const rejected = () =>
  new ApiError({
    kind: 'rejected',
    status: 422,
    code: 'locked',
    message: 'Cambio rechazado: el elemento está bloqueado.',
  });

async function openStore(doc: FormaDocument = inventoryDoc()) {
  const server = fakeServer(doc);
  const store = createEditorStore(server.api, { idGen: createSequentialIdGenerator(1000) });
  await store.getState().open('p1', 'Proyecto');
  return { server, store };
}

const firstSlot = (doc: FormaDocument) => nodesOfType(screenOf(doc), 'slot')[0]!;
const rename = (doc: FormaDocument, name: string) =>
  updateNodeBatch(screenOf(doc), firstSlot(doc).id, { name });
const nameOf = (doc: FormaDocument | null) => (doc ? firstSlot(doc).name : undefined);

describe('open', () => {
  it('loads the document, revision and first screen', async () => {
    const { store } = await openStore();
    const state = store.getState();
    expect(state.status).toBe('ready');
    expect(state.revision).toBe(1);
    expect(state.activeScreenId).toBe(SCREEN_ID);
    expect(state.syncStatus).toBe('saved');
    expect(state.pending).toBe(0);
  });

  it('bootstraps a first screen for projects without screens (not undoable)', async () => {
    const empty = { ...emptyDoc(), screens: [] };
    const { store, server } = await openStore(empty);
    const state = store.getState();
    expect(state.doc?.screens).toHaveLength(1);
    expect(state.doc?.screens[0]?.size).toEqual({ width: 1920, height: 1080 });
    expect(state.activeScreenId).toBe(state.doc?.screens[0]?.id);
    expect(state.history.undoStack).toHaveLength(0);
    expect(server.state.document.screens).toHaveLength(1);
  });

  it('survives two overlapping opens of a screenless project (React StrictMode)', async () => {
    const server = fakeServer({ ...emptyDoc(), screens: [] });
    const store = createEditorStore(server.api);
    const first = store.getState().open('p1', 'Proyecto');
    const second = store.getState().open('p1', 'Proyecto');
    await Promise.all([first, second]);
    const state = store.getState();
    expect(state.status).toBe('ready');
    expect(state.doc?.screens).toHaveLength(1);
    expect(server.state.document.screens).toHaveLength(1);
    expect(state.revision).toBe(server.state.revision);
  });

  it('reports a load failure instead of throwing', async () => {
    const store = createEditorStore({
      getDocument: async () => {
        throw serviceUnavailableError();
      },
      applyBatch: async () => {
        throw new Error('unused');
      },
    });
    await store.getState().open('p1', 'P');
    expect(store.getState().status).toBe('failed');
    expect(store.getState().loadError).toContain('servicio local');
  });
});

describe('dispatch', () => {
  it('applies optimistically, then syncs with the base revision', async () => {
    const { store, server } = await openStore();
    const doc = store.getState().doc!;
    const result = store.getState().dispatch(rename(doc, 'Nueva'));
    expect(result.ok).toBe(true);
    // optimistic: visible before the request resolves
    expect(nameOf(store.getState().doc)).toBe('Nueva');
    expect(store.getState().pending).toBe(1);
    expect(store.getState().syncStatus).toBe('saving');

    await store.getState().whenSynced();
    expect(server.received[0]?.baseRevision).toBe(1);
    expect(store.getState().revision).toBe(2);
    expect(store.getState().syncStatus).toBe('saved');
    expect(store.getState().pending).toBe(0);
    expect(nameOf(server.state.document)).toBe('Nueva');
    expect(store.getState().history.undoStack).toHaveLength(1);
  });

  it('chains revisions for back-to-back batches', async () => {
    const { store, server } = await openStore();
    const doc = store.getState().doc!;
    store.getState().dispatch(rename(doc, 'A'));
    store.getState().dispatch(rename(store.getState().doc!, 'B'));
    await store.getState().whenSynced();
    expect(server.received.map((r) => r.baseRevision)).toEqual([1, 2]);
    expect(nameOf(server.state.document)).toBe('B');
  });

  it('refuses locally invalid batches without calling the service', async () => {
    const { store, server } = await openStore();
    const bad: OperationBatch = {
      id: 'bad',
      label: 'bad',
      source: 'manual',
      ops: [{ type: 'removeNode', screenId: SCREEN_ID, nodeId: 'nope' }],
    };
    const result = store.getState().dispatch(bad);
    expect(result.ok).toBe(false);
    expect(store.getState().notice?.kind).toBe('error');
    expect(server.received).toHaveLength(0);
    expect(store.getState().pending).toBe(0);
  });

  it('on 409 reloads the server document, resets history and tells the user', async () => {
    const { store, server } = await openStore();
    server.failures.push(
      new ApiError({ kind: 'conflict', status: 409, code: 'revisionConflict', message: 'x' }),
    );
    // someone else changed the document meanwhile
    const other = applyBatch(server.state.document, rename(server.state.document, 'Ajena'));
    if (!other.ok) throw new Error('setup failed');
    server.state.document = other.doc;
    server.state.revision = 5;

    store.getState().dispatch(rename(store.getState().doc!, 'Mía'));
    await store.getState().whenSynced();

    const state = store.getState();
    expect(nameOf(state.doc)).toBe('Ajena');
    expect(state.revision).toBe(5);
    expect(state.history.undoStack).toHaveLength(0);
    expect(state.notice?.message).toContain('cambió');
    expect(state.syncStatus).toBe('saved');
    expect(state.pending).toBe(0);
  });

  it('on 422 rolls back to the server state, keeps earlier history and shows the reason', async () => {
    const { store, server } = await openStore();
    store.getState().dispatch(rename(store.getState().doc!, 'Primera'));
    await store.getState().whenSynced();
    expect(store.getState().history.undoStack).toHaveLength(1);

    server.failures.push(rejected());
    store.getState().dispatch(rename(store.getState().doc!, 'Segunda'));
    expect(nameOf(store.getState().doc)).toBe('Segunda');
    await store.getState().whenSynced();

    const state = store.getState();
    expect(nameOf(state.doc)).toBe('Primera');
    expect(state.history.undoStack).toHaveLength(1);
    expect(state.notice?.kind).toBe('error');
    expect(state.notice?.message).toContain('bloqueado');
    expect(state.syncStatus).toBe('saved');
    expect(state.revision).toBe(server.state.revision);
  });

  it('drops queued batches that depended on the rejected one', async () => {
    const { store, server } = await openStore();
    server.failures.push(rejected());
    store.getState().dispatch(rename(store.getState().doc!, 'A'));
    store.getState().dispatch(rename(store.getState().doc!, 'B'));
    await store.getState().whenSynced();
    expect(nameOf(store.getState().doc)).toBe(nameOf(server.state.document));
    expect(store.getState().pending).toBe(0);
    expect(store.getState().history.undoStack).toHaveLength(0);
  });

  it('keeps edits pending while the service is down and resends on retry', async () => {
    const { store, server } = await openStore();
    server.failures.push(serviceUnavailableError());
    store.getState().dispatch(rename(store.getState().doc!, 'Offline'));
    await store.getState().whenSynced();
    expect(store.getState().syncStatus).toBe('offline');
    expect(store.getState().pending).toBe(1);
    expect(nameOf(store.getState().doc)).toBe('Offline');

    store.getState().retrySync();
    await store.getState().whenSynced();
    expect(store.getState().syncStatus).toBe('saved');
    expect(nameOf(server.state.document)).toBe('Offline');
  });
});

describe('undo / redo', () => {
  it('undo applies the inverse batch locally and syncs it', async () => {
    const { store, server } = await openStore();
    const before = nameOf(store.getState().doc);
    store.getState().dispatch(rename(store.getState().doc!, 'Cambiada'));
    await store.getState().whenSynced();

    expect(store.getState().undo().ok).toBe(true);
    expect(nameOf(store.getState().doc)).toBe(before);
    await store.getState().whenSynced();
    expect(nameOf(server.state.document)).toBe(before);
    expect(server.received.at(-1)?.batch.source).toBe('manual');
    expect(store.getState().history.redoStack).toHaveLength(1);
  });

  it('redo re-applies the batch and syncs it', async () => {
    const { store, server } = await openStore();
    store.getState().dispatch(rename(store.getState().doc!, 'Cambiada'));
    store.getState().undo();
    expect(store.getState().redo().ok).toBe(true);
    await store.getState().whenSynced();
    expect(nameOf(store.getState().doc)).toBe('Cambiada');
    expect(nameOf(server.state.document)).toBe('Cambiada');
    expect(server.received).toHaveLength(3);
  });

  it('does nothing quietly when there is nothing to undo or redo', async () => {
    const { store, server } = await openStore();
    expect(store.getState().undo().ok).toBe(false);
    expect(store.getState().redo().ok).toBe(false);
    expect(server.received).toHaveLength(0);
  });

  it('a failed undo sync restores the history from before the undo', async () => {
    const { store, server } = await openStore();
    store.getState().dispatch(rename(store.getState().doc!, 'Cambiada'));
    await store.getState().whenSynced();
    server.failures.push(rejected());
    store.getState().undo();
    await store.getState().whenSynced();
    expect(nameOf(store.getState().doc)).toBe('Cambiada');
    expect(store.getState().history.undoStack).toHaveLength(1);
    expect(store.getState().history.redoStack).toHaveLength(0);
  });
});

describe('selection and tabs', () => {
  it('selects, toggles and clears', async () => {
    const { store } = await openStore();
    const slots = nodesOfType(screenOf(store.getState().doc!), 'slot');
    store.getState().select([slots[0]!.id]);
    store.getState().select([slots[1]!.id], { additive: true });
    expect(store.getState().selection).toEqual([slots[0]!.id, slots[1]!.id]);
    store.getState().select([slots[0]!.id], { additive: true });
    expect(store.getState().selection).toEqual([slots[1]!.id]);
    store.getState().clearSelection();
    expect(store.getState().selection).toEqual([]);
  });

  it('reveals the tab that holds a selected node', async () => {
    const { store } = await openStore();
    const screen = screenOf(store.getState().doc!);
    const tabBar = nodesOfType(screen, 'tabBar')[0]!;
    const tabs = tabBar.behaviors.find((b) => b.kind === 'tabs');
    if (tabs?.kind !== 'tabs') throw new Error('tabs expected');
    const thirdContent = screen.nodes[tabs.tabs[2]!.contentNodeId]!.children[0]!;
    store.getState().select([thirdContent]);
    expect(store.getState().tabShown).toEqual({ [tabBar.id]: tabs.tabs[2]!.id });
  });

  it('drops selected ids that no longer exist after undo', async () => {
    const { store } = await openStore();
    const screen = screenOf(store.getState().doc!);
    const grid = nodesOfType(screen, 'inventoryGrid')[0]!;
    const dup = store.getState().duplicateSelection;
    store.getState().select([grid.id]);
    dup();
    const copy = store.getState().selection[0]!;
    expect(copy).not.toBe(grid.id);
    store.getState().undo();
    expect(store.getState().selection).not.toContain(copy);
  });
});

describe('replaceDocument', () => {
  it('swaps in a restored document and resets history', async () => {
    const { store } = await openStore();
    store.getState().dispatch(rename(store.getState().doc!, 'X'));
    store.getState().replaceDocument(inventoryDoc(), 9);
    expect(store.getState().revision).toBe(9);
    expect(store.getState().history.undoStack).toHaveLength(0);
    expect(nameOf(store.getState().doc)).not.toBe('X');
  });
});
