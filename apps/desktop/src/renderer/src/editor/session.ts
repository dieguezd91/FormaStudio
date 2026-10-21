import {
  applyBatch,
  createHistory,
  createScreen,
  pushHistory,
  redoHistory,
  undoHistory,
  type FormaDocument,
  type FormaScreen,
  type History,
  type IdGenerator,
  type OperationBatch,
} from '@forma/design-core';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ApiClient } from '@/api/client';
import { isApiError, isServiceUnavailable, operationReason } from '@/api/errors';
import { layoutBatch, makeBatch, removeNodesBatch } from './batches';
import { duplicateBatch } from './clone';
import { tabsToReveal, type TabShown } from './tabs';

/** What the store needs from the service; tests provide an in-memory stand-in. */
export type EditorApi = Pick<ApiClient, 'getDocument' | 'applyBatch'>;

export type SyncStatus = 'saved' | 'saving' | 'offline';
export type LoadStatus = 'idle' | 'loading' | 'ready' | 'failed';

export interface Notice {
  id: number;
  kind: 'info' | 'error';
  message: string;
}

export type DispatchResult = { ok: true } | { ok: false; message: string };

export const FIRST_SCREEN_NAME = 'Pantalla 1';

export interface EditorState {
  projectId: string | null;
  projectName: string;
  status: LoadStatus;
  loadError: string | null;
  doc: FormaDocument | null;
  /** Revision last confirmed by the service. */
  revision: number;
  history: History;
  activeScreenId: string | null;
  selection: string[];
  /** Tab picked per tab bar in the canvas; design-time only. */
  tabShown: TabShown;
  /** Batches applied locally that the service has not confirmed yet. */
  pending: number;
  syncStatus: SyncStatus;
  notice: Notice | null;

  open: (projectId: string, projectName?: string) => Promise<void>;
  close: () => void;
  dispatch: (batch: OperationBatch) => DispatchResult;
  undo: () => DispatchResult;
  redo: () => DispatchResult;
  /** Replaces the document with one that came from the service (e.g. a restored version). */
  replaceDocument: (doc: FormaDocument, revision: number) => void;
  retrySync: () => void;
  whenSynced: () => Promise<void>;

  select: (ids: readonly string[], options?: { additive?: boolean }) => void;
  clearSelection: () => void;
  setActiveScreen: (screenId: string) => void;
  showTab: (tabBarId: string, tabId: string) => void;
  dismissNotice: () => void;
  notify: (kind: Notice['kind'], message: string) => void;

  deleteSelection: () => DispatchResult;
  duplicateSelection: () => DispatchResult;
  nudgeSelection: (dx: number, dy: number) => DispatchResult;
}

interface QueueItem {
  batch: OperationBatch;
  /** History as it was before this action; restored if the service refuses it. */
  historyBefore: History;
}

const initialState = {
  projectId: null,
  projectName: '',
  status: 'idle' as LoadStatus,
  loadError: null,
  doc: null,
  revision: 0,
  history: createHistory(),
  activeScreenId: null,
  selection: [] as string[],
  tabShown: {} as TabShown,
  pending: 0,
  syncStatus: 'saved' as SyncStatus,
  notice: null,
};

export const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : 'Ocurrió un error inesperado.';

export const activeScreenOf = (state: Pick<EditorState, 'doc' | 'activeScreenId'>) =>
  state.doc?.screens.find((s) => s.id === state.activeScreenId);

const CONFLICT_MESSAGE =
  'El documento cambió en otro lugar. Cargamos la última versión guardada; los cambios que no se habían guardado se descartaron.';

export function createEditorStore(
  api: EditorApi,
  options: { idGen?: IdGenerator } = {},
): StoreApi<EditorState> {
  let queue: QueueItem[] = [];
  let running = false;
  let paused = false;
  let current: Promise<void> = Promise.resolve();
  /** Bumped whenever the document is replaced, so in-flight requests become irrelevant. */
  let epoch = 0;
  let noticeSeq = 0;

  const store = createStore<EditorState>()((set, get) => {
    const notify = (kind: Notice['kind'], message: string) =>
      set({ notice: { id: ++noticeSeq, kind, message } });

    /** Keeps the active screen and selection pointing at things that still exist. */
    const reconcile = (doc: FormaDocument): Partial<EditorState> => {
      const state = get();
      const screen =
        doc.screens.find((s) => s.id === state.activeScreenId) ?? doc.screens[0] ?? undefined;
      const selection = screen
        ? state.selection.filter((id) => screen.nodes[id] !== undefined)
        : [];
      return {
        doc,
        activeScreenId: screen?.id ?? null,
        selection,
        ...(screen?.id === state.activeScreenId ? {} : { tabShown: {} }),
      };
    };

    const sendNext = async (): Promise<void> => {
      const myEpoch = epoch;
      const projectId = get().projectId;
      if (!projectId) return;
      while (queue.length > 0 && !paused) {
        const item = queue[0]!;
        try {
          const stored = await api.applyBatch(projectId, item.batch, get().revision);
          if (myEpoch !== epoch) return;
          queue.shift();
          set({ revision: stored.revision, pending: queue.length });
        } catch (error) {
          if (myEpoch !== epoch) return;
          if (isServiceUnavailable(error)) {
            paused = true;
            set({ syncStatus: 'offline' });
            return;
          }
          await recover(projectId, item, error, myEpoch);
          return;
        }
      }
      if (myEpoch === epoch && queue.length === 0) set({ syncStatus: 'saved', pending: 0 });
    };

    /** The service refused or lost a batch: drop the optimistic queue and adopt its document. */
    const recover = async (
      projectId: string,
      failed: QueueItem,
      error: unknown,
      myEpoch: number,
    ): Promise<void> => {
      const conflict = isApiError(error) && error.kind === 'conflict';
      try {
        const fresh = await api.getDocument(projectId);
        if (myEpoch !== epoch) return;
        queue = [];
        set({
          ...reconcile(fresh.document),
          revision: fresh.revision,
          history: conflict ? createHistory() : failed.historyBefore,
          pending: 0,
          syncStatus: 'saved',
        });
        notify('error', conflict ? CONFLICT_MESSAGE : messageOf(error));
      } catch (refetchError) {
        if (myEpoch !== epoch) return;
        paused = true;
        set({ syncStatus: 'offline' });
        notify('error', `No se pudo sincronizar con el servicio local. ${messageOf(refetchError)}`);
      }
    };

    const kick = () => {
      if (running) return;
      running = true;
      current = sendNext().finally(() => {
        running = false;
        if (queue.length > 0 && !paused) kick();
      });
    };

    const enqueue = (batch: OperationBatch, historyBefore: History) => {
      queue.push({ batch, historyBefore });
      set({ pending: queue.length, syncStatus: paused ? 'offline' : 'saving' });
      kick();
    };

    const failure = (message: string): DispatchResult => {
      notify('error', message);
      return { ok: false, message };
    };

    const resetSession = () => {
      epoch += 1;
      queue = [];
      paused = false;
    };

    return {
      ...initialState,

      async open(projectId, projectName = '') {
        resetSession();
        const myEpoch = epoch;
        set({ ...initialState, projectId, projectName, status: 'loading' });
        try {
          let stored = await api.getDocument(projectId);
          if (stored.document.screens.length === 0) {
            const screen = createScreen({ name: FIRST_SCREEN_NAME });
            try {
              stored = await api.applyBatch(
                projectId,
                makeBatch('Crear pantalla inicial', [{ type: 'addScreen', screen }]),
                stored.revision,
              );
            } catch (error) {
              // Another open of the same project (e.g. React StrictMode) created it first.
              if (!isApiError(error) || error.kind !== 'conflict') throw error;
              stored = await api.getDocument(projectId);
            }
          }
          if (myEpoch !== epoch) return;
          set({
            ...reconcile(stored.document),
            revision: stored.revision,
            history: createHistory(),
            status: 'ready',
          });
        } catch (error) {
          if (myEpoch !== epoch) return;
          set({ status: 'failed', loadError: messageOf(error) });
        }
      },

      close() {
        resetSession();
        set({ ...initialState });
      },

      dispatch(batch) {
        const { doc, history } = get();
        if (!doc) return failure('No hay un documento abierto.');
        const applied = applyBatch(doc, batch);
        if (!applied.ok) {
          return failure(
            `No se pudo aplicar el cambio: ${operationReason(applied.error.code, applied.error.message)}.`,
          );
        }
        set({ ...reconcile(applied.doc), history: pushHistory(history, applied) });
        enqueue(batch, history);
        return { ok: true };
      },

      undo() {
        const { doc, history } = get();
        const entry = history.undoStack.at(-1);
        if (!doc || !entry) return { ok: false, message: 'No hay nada para deshacer.' };
        const result = undoHistory(history, doc);
        if (!result.ok) return failure(`No se pudo deshacer: ${result.error.message}`);
        set({ ...reconcile(result.doc), history: result.history });
        enqueue({ ...entry.inverseBatch, source: 'manual' }, history);
        return { ok: true };
      },

      redo() {
        const { doc, history } = get();
        const entry = history.redoStack.at(-1);
        if (!doc || !entry) return { ok: false, message: 'No hay nada para rehacer.' };
        const result = redoHistory(history, doc);
        if (!result.ok) return failure(`No se pudo rehacer: ${result.error.message}`);
        set({ ...reconcile(result.doc), history: result.history });
        enqueue({ ...entry.batch, source: 'manual' }, history);
        return { ok: true };
      },

      replaceDocument(doc, revision) {
        resetSession();
        set({
          ...reconcile(doc),
          revision,
          history: createHistory(),
          pending: 0,
          syncStatus: 'saved',
        });
      },

      retrySync() {
        if (queue.length === 0) {
          paused = false;
          set({ syncStatus: 'saved' });
          return;
        }
        paused = false;
        set({ syncStatus: 'saving' });
        kick();
      },

      async whenSynced() {
        for (;;) {
          const waiting = current;
          await waiting;
          if (waiting === current && !running) return;
        }
      },

      select(ids, { additive = false } = {}) {
        const screen = activeScreenOf(get());
        if (!screen) return;
        const valid = ids.filter((id) => screen.nodes[id] !== undefined);
        let selection: string[];
        if (additive) {
          selection = [...get().selection];
          for (const id of valid) {
            const at = selection.indexOf(id);
            if (at >= 0) selection.splice(at, 1);
            else selection.push(id);
          }
        } else {
          selection = [...valid];
        }
        const reveal: TabShown = {};
        for (const id of valid) Object.assign(reveal, tabsToReveal(screen, id));
        set({ selection, tabShown: { ...get().tabShown, ...reveal } });
      },

      clearSelection() {
        if (get().selection.length > 0) set({ selection: [] });
      },

      setActiveScreen(screenId) {
        if (get().doc?.screens.some((s) => s.id === screenId)) {
          set({ activeScreenId: screenId, selection: [], tabShown: {} });
        }
      },

      showTab(tabBarId, tabId) {
        set({ tabShown: { ...get().tabShown, [tabBarId]: tabId } });
      },

      dismissNotice: () => set({ notice: null }),
      notify,

      deleteSelection() {
        const screen = activeScreenOf(get());
        const batch = screen && removeNodesBatch(screen, get().selection);
        return batch ? get().dispatch(batch) : { ok: false, message: 'No hay nada para eliminar.' };
      },

      duplicateSelection() {
        const screen = activeScreenOf(get());
        const duplicate = screen && duplicateBatch(screen, get().selection, options.idGen ?? randomIds);
        if (!duplicate) return { ok: false, message: 'No hay nada para duplicar.' };
        const result = get().dispatch(duplicate.batch);
        if (result.ok) get().select(duplicate.newRootIds);
        return result;
      },

      nudgeSelection(dx, dy) {
        const screen = activeScreenOf(get());
        const nodes = screen && selectedMovable(screen, get().selection);
        if (!screen || !nodes || nodes.length === 0) return { ok: false, message: 'Nada para mover.' };
        return get().dispatch(
          layoutBatch(
            screen,
            nodes.map((n) => ({ nodeId: n.id, layout: { x: n.layout.x + dx, y: n.layout.y + dy } })),
            'Mover',
          ),
        );
      },
    };
  });

  return store;
}

export const randomIds: IdGenerator = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/** Selected nodes that may be dragged: not locked and not the screen root. */
export function selectedMovable(screen: FormaScreen, selection: readonly string[]) {
  return selection
    .map((id) => screen.nodes[id])
    .filter((node): node is NonNullable<typeof node> => !!node && !node.locked && node.id !== screen.rootId);
}
