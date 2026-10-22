import type { FormaDocument } from '@forma/design-core';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ApiClient } from '@/api/client';
import { isAborted } from '@/api/errors';
import type {
  AiWarning,
  EditPreview,
  EditRequest,
  ImpactReport,
  ProposalMeta,
  ProposalsRequest,
  Requirement,
  SourceImpact,
  SourceMeta,
} from '@/api/types';
import type { AiAvailabilityState } from '@/app/aiAvailabilityStore';
import { messageOf, type EditorState } from '../session';
import { isPreviewStale, summarizeImpact, type ImpactSummary } from './logic';

export type AiApi = Pick<
  ApiClient,
  | 'listSources'
  | 'listRequirements'
  | 'listProposals'
  | 'getProposal'
  | 'setProposalStatus'
  | 'adoptProposal'
  | 'createVersion'
  | 'extractRequirements'
  | 'generateProposals'
  | 'previewEdit'
  | 'getImpact'
>;

export type EditState =
  | { phase: 'idle' }
  | { phase: 'loading'; request: EditRequest }
  | { phase: 'preview'; request: EditRequest; preview: EditPreview; refreshed: boolean }
  | { phase: 'error'; request: EditRequest; message: string };

export interface AiState {
  projectId: string | null;

  sources: SourceMeta[];
  sourcesError: string | null;

  requirements: Requirement[];
  requirementWarnings: AiWarning[];
  requirementsBusy: boolean;
  requirementsError: string | null;

  proposals: ProposalMeta[];
  proposalWarnings: AiWarning[];
  proposalsBusy: boolean;
  proposalsError: string | null;
  /** Full documents of proposals, fetched on demand for previews, comparison and Probar. */
  documents: Record<string, FormaDocument>;

  edit: EditState;

  impacts: SourceImpact[];

  open: (projectId: string) => Promise<void>;
  close: () => void;

  reloadSources: () => Promise<void>;
  /** A source was added, replaced or deleted: refresh the list and look for stale results. */
  sourcesChanged: () => Promise<void>;
  dismissImpact: () => void;

  analyze: (sourceIds: string[]) => Promise<void>;
  generate: (request: ProposalsRequest) => Promise<void>;
  cancelGeneration: () => void;
  loadDocument: (proposalId: string) => Promise<FormaDocument | null>;
  setProposalStatus: (proposalId: string, status: 'candidate' | 'discarded') => Promise<void>;
  /** Replaces the open document with the proposal, saving the current one as a version first. */
  adopt: (proposal: ProposalMeta) => Promise<boolean>;

  requestEdit: (instruction: string, proposalIds: string[]) => Promise<void>;
  applyEdit: () => Promise<void>;
  cancelEdit: () => void;
  discardEdit: () => void;
}

const initial = {
  projectId: null,
  sources: [] as SourceMeta[],
  sourcesError: null,
  requirements: [] as Requirement[],
  requirementWarnings: [] as AiWarning[],
  requirementsBusy: false,
  requirementsError: null,
  proposals: [] as ProposalMeta[],
  proposalWarnings: [] as AiWarning[],
  proposalsBusy: false,
  proposalsError: null,
  documents: {} as Record<string, FormaDocument>,
  edit: { phase: 'idle' } as EditState,
  impacts: [] as SourceImpact[],
};

export const impactOf = (state: Pick<AiState, 'impacts'>): ImpactSummary | null =>
  summarizeImpact(state.impacts);

/** Local edits not yet saved would be missing from what the service sees. */
const UNSAVED_MESSAGE = 'Hay cambios sin guardar; esperá a que se sincronicen e intentá de nuevo.';

export function createAiStore(
  api: AiApi,
  editor: StoreApi<EditorState>,
  availability: StoreApi<AiAvailabilityState>,
): StoreApi<AiState> {
  let requirementsController: AbortController | null = null;
  let proposalsController: AbortController | null = null;
  let editController: AbortController | null = null;
  /** Lower bound for "what changed since I last looked"; advances as impact reports arrive. */
  let impactSince = new Date().toISOString();

  return createStore<AiState>()((set, get) => {
    const current = (projectId: string) => get().projectId === projectId;

    /** Records AI availability from a failure; returns the message to show, or null when cancelled. */
    const failure = (error: unknown): string | null => {
      if (isAborted(error)) return null;
      availability.getState().reportError(error);
      return messageOf(error);
    };

    const refreshProposals = async (projectId: string) => {
      const list = await api.listProposals(projectId);
      if (current(projectId)) set({ proposals: list });
    };

    /** Saves pending edits so the service sees the document the user sees. */
    const synced = async (): Promise<boolean> => {
      await editor.getState().whenSynced();
      return editor.getState().pending === 0;
    };

    return {
      ...initial,

      async open(projectId) {
        get().close();
        impactSince = new Date().toISOString();
        set({ ...initial, projectId });
        await Promise.all([
          get().reloadSources(),
          api.listRequirements(projectId).then(
            (requirements) => current(projectId) && set({ requirements }),
            () => undefined,
          ),
          refreshProposals(projectId).catch(() => undefined),
        ]);
      },

      close() {
        requirementsController?.abort();
        proposalsController?.abort();
        editController?.abort();
        requirementsController = proposalsController = editController = null;
        set({ ...initial });
      },

      async reloadSources() {
        const { projectId } = get();
        if (!projectId) return;
        try {
          const sources = await api.listSources(projectId);
          if (current(projectId)) set({ sources, sourcesError: null });
        } catch (error) {
          if (current(projectId)) set({ sourcesError: messageOf(error) });
        }
      },

      async sourcesChanged() {
        const { projectId } = get();
        if (!projectId) return;
        await get().reloadSources();
        try {
          const report: ImpactReport = await api.getImpact(projectId, impactSince);
          if (!current(projectId) || report.impacts.length === 0) return;
          const latest = report.impacts.reduce((max, { change }) => (change.changedAt > max ? change.changedAt : max), impactSince);
          impactSince = latest;
          set({ impacts: [...get().impacts, ...report.impacts] });
        } catch {
          // Impact is advisory; the sources list already refreshed.
        }
      },

      dismissImpact: () => set({ impacts: [] }),

      async analyze(sourceIds) {
        const { projectId } = get();
        if (!projectId || get().requirementsBusy) return;
        const controller = new AbortController();
        requirementsController = controller;
        set({ requirementsBusy: true, requirementsError: null });
        try {
          if (!(await synced())) throw new Error(UNSAVED_MESSAGE);
          const result = await api.extractRequirements(projectId, sourceIds, controller.signal);
          if (!current(projectId)) return;
          set({ requirements: result.requirements, requirementWarnings: result.warnings });
          availability.getState().reportSuccess();
        } catch (error) {
          const message = failure(error);
          if (current(projectId) && message) set({ requirementsError: message });
        } finally {
          if (requirementsController === controller) requirementsController = null;
          if (current(projectId)) set({ requirementsBusy: false });
        }
      },

      async generate(request) {
        const { projectId } = get();
        if (!projectId || get().proposalsBusy) return;
        const controller = new AbortController();
        proposalsController = controller;
        set({ proposalsBusy: true, proposalsError: null });
        try {
          const result = await api.generateProposals(projectId, request, controller.signal);
          if (!current(projectId)) return;
          set({ proposalWarnings: result.warnings });
          availability.getState().reportSuccess();
          await refreshProposals(projectId);
        } catch (error) {
          const message = failure(error);
          if (current(projectId) && message) set({ proposalsError: message });
        } finally {
          if (proposalsController === controller) proposalsController = null;
          if (current(projectId)) set({ proposalsBusy: false });
        }
      },

      cancelGeneration() {
        requirementsController?.abort();
        proposalsController?.abort();
      },

      async loadDocument(proposalId) {
        const { projectId, documents } = get();
        if (!projectId) return null;
        const cached = documents[proposalId];
        if (cached) return cached;
        try {
          const { document } = await api.getProposal(projectId, proposalId);
          if (current(projectId)) set({ documents: { ...get().documents, [proposalId]: document } });
          return document;
        } catch {
          return null;
        }
      },

      async setProposalStatus(proposalId, status) {
        const { projectId } = get();
        if (!projectId) return;
        try {
          const updated = await api.setProposalStatus(projectId, proposalId, status);
          if (current(projectId)) {
            set({ proposals: get().proposals.map((p) => (p.id === proposalId ? updated : p)) });
          }
        } catch (error) {
          editor.getState().notify('error', messageOf(error));
        }
      },

      async adopt(proposal) {
        const { projectId } = get();
        if (!projectId) return false;
        const notify = editor.getState().notify;
        try {
          if (!(await synced())) {
            notify('error', UNSAVED_MESSAGE);
            return false;
          }
          // Adoption replaces the whole document and is not part of undo history, so keep a way back.
          await api.createVersion(projectId, `Antes de adoptar ${proposal.title}`);
          const adopted = await api.adoptProposal(projectId, proposal.id, editor.getState().revision);
          editor.getState().replaceDocument(adopted.document, adopted.revision);
          await refreshProposals(projectId).catch(() => undefined);
          notify(
            'info',
            `Adoptaste «${proposal.title}». El estado anterior quedó guardado en Versiones como «Antes de adoptar ${proposal.title}».`,
          );
          return true;
        } catch (error) {
          notify('error', messageOf(error));
          return false;
        }
      },

      async requestEdit(instruction, proposalIds) {
        const { projectId } = get();
        const { activeScreenId, selection } = editor.getState();
        if (!projectId || !activeScreenId) return;
        const request: EditRequest = {
          instruction,
          screenId: activeScreenId,
          selectedNodeIds: [...selection],
          ...(proposalIds.length > 0 ? { proposalIds } : {}),
        };
        await runEdit(request, false);
      },

      async applyEdit() {
        const { edit } = get();
        if (edit.phase !== 'preview') return;
        const { revision, pending } = editor.getState();
        if (isPreviewStale(edit.preview, { revision, pending })) {
          // The document moved on since the preview was computed: ask again instead of applying blindly.
          await runEdit(edit.request, true);
          return;
        }
        const result = editor.getState().dispatch(edit.preview.batch);
        if (result.ok) set({ edit: { phase: 'idle' } });
        else set({ edit: { phase: 'error', request: edit.request, message: result.message } });
      },

      cancelEdit() {
        editController?.abort();
      },

      discardEdit() {
        editController?.abort();
        set({ edit: { phase: 'idle' } });
      },
    };

    async function runEdit(request: EditRequest, refreshed: boolean): Promise<void> {
      const { projectId } = get();
      if (!projectId) return;
      const controller = new AbortController();
      editController?.abort();
      editController = controller;
      set({ edit: { phase: 'loading', request } });
      try {
        if (!(await synced())) throw new Error(UNSAVED_MESSAGE);
        const preview = await api.previewEdit(projectId, request, controller.signal);
        if (!current(projectId) || controller.signal.aborted) return;
        availability.getState().reportSuccess();
        set({ edit: { phase: 'preview', request, preview, refreshed } });
      } catch (error) {
        const message = failure(error);
        // A newer request owns the edit state now.
        if (!current(projectId) || editController !== controller) return;
        // A cancelled request leaves the box as it was; anything else shows why.
        set({ edit: message ? { phase: 'error', request, message } : { phase: 'idle' } });
      } finally {
        if (editController === controller) editController = null;
      }
    }
  });
}
