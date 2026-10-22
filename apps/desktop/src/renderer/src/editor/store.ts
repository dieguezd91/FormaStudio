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
export type ExploreTab = 'layers' | 'library' | 'references' | 'requirements' | 'proposals';

interface UiState {
  mode: EditorMode;
  exploreTab: ExploreTab;
  snap: boolean;
  /** The "Crear con IA" guided strip (adjuntar → analizar → generar). */
  guide: boolean;
  /** The "Pedir a la IA" command box. */
  askOpen: boolean;
  setMode: (mode: EditorMode) => void;
  setExploreTab: (tab: ExploreTab) => void;
  setSnap: (snap: boolean) => void;
  setGuide: (visible: boolean) => void;
  setAskOpen: (open: boolean) => void;
}

/** View preferences; never part of the document and never synced. */
export const useUi = create<UiState>()((set) => ({
  mode: 'design',
  exploreTab: 'layers',
  snap: true,
  guide: false,
  askOpen: false,
  setMode: (mode) => set({ mode }),
  setExploreTab: (exploreTab) => set({ exploreTab }),
  setSnap: (snap) => set({ snap }),
  setGuide: (guide) => set({ guide }),
  setAskOpen: (askOpen) => set({ askOpen }),
}));
