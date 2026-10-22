import { useStore } from 'zustand';
import { api } from '@/api';
import { editorStore } from '../store';
import { createAiStore, type AiState } from './aiStore';

/** AI results and flows of the open project, bound to the real service and editor session. */
export const aiStore = createAiStore(api, editorStore);

export function useAi<T>(selector: (state: AiState) => T): T {
  return useStore(aiStore, selector);
}
