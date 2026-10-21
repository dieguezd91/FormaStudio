import { useEffect } from 'react';
import { nudgeDelta } from './canvas/geometry';
import { editorStore } from './store';

const TEXT_INPUT_TYPES = new Set(['checkbox', 'radio', 'file', 'button', 'submit', 'range']);

/** Keys typed into a text control belong to that control, not to the editor. */
export function isEditingText(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && !TEXT_INPUT_TYPES.has(target.type);
}

/** Undo/redo, duplicate, delete, nudge and clear-selection shortcuts for Diseñar mode. */
export function useEditorShortcuts(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditingText(event.target)) return;
      const state = editorStore.getState();
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (mod && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) state.redo();
        else state.undo();
      } else if (mod && key === 'y') {
        event.preventDefault();
        state.redo();
      } else if (mod && key === 'd') {
        event.preventDefault();
        state.duplicateSelection();
      } else if (!mod && (event.key === 'Delete' || event.key === 'Backspace')) {
        if (state.selection.length === 0) return;
        event.preventDefault();
        state.deleteSelection();
      } else if (!mod && event.key === 'Escape') {
        state.clearSelection();
      } else if (!mod) {
        const delta = nudgeDelta(event.key, event.shiftKey);
        if (!delta || state.selection.length === 0) return;
        event.preventDefault();
        state.nudgeSelection(delta.dx, delta.dy);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
