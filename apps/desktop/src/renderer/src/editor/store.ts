import { create, useStore } from 'zustand';
import { api } from '@/api';
import { activeScreenOf, createEditorStore, type EditorState } from './session';

/** The single editor session of the app, bound to the real local service. */
export const editorStore = createEditorStore(api);

export function useEditor<T>(selector: (state: EditorState) => T): T {
  return useStore(editorStore, selector);
}

/** Active screen of the open document (stable reference while the screen is unchanged). */
export const useActiveScreen = () => useEditor((state) => activeScreenOf(state));

export type EditorMode = 'design' | 'test' | 'export';
export type ExploreTab = 'layers' | 'library' | 'references';

interface UiState {
  mode: EditorMode;
  exploreTab: ExploreTab;
  snap: boolean;
  /** Shown once after "Crear con IA" so the user knows generation is not available yet. */
  aiNotice: boolean;
  setMode: (mode: EditorMode) => void;
  setExploreTab: (tab: ExploreTab) => void;
  setSnap: (snap: boolean) => void;
  setAiNotice: (visible: boolean) => void;
}

/** View preferences; never part of the document and never synced. */
export const useUi = create<UiState>()((set) => ({
  mode: 'design',
  exploreTab: 'layers',
  snap: true,
  aiNotice: false,
  setMode: (mode) => set({ mode }),
  setExploreTab: (exploreTab) => set({ exploreTab }),
  setSnap: (snap) => set({ snap }),
  setAiNotice: (aiNotice) => set({ aiNotice }),
}));
