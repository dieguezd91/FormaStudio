import { applyBatch, type BatchError, type OperationBatch } from './operations';
import type { FormaDocument } from './schema';

export interface HistoryEntry {
  batch: OperationBatch;
  inverseBatch: OperationBatch;
}

/** Immutable undo/redo state; every function returns a new `History`. */
export interface History {
  capacity: number;
  /** Oldest first; the last entry is the next one to undo. */
  undoStack: readonly HistoryEntry[];
  /** The last entry is the next one to redo. */
  redoStack: readonly HistoryEntry[];
}

export type HistoryError =
  { code: 'nothingToUndo' | 'nothingToRedo'; message: string } | BatchError;

export type HistoryResult =
  { ok: true; doc: FormaDocument; history: History } | { ok: false; error: HistoryError };

export const DEFAULT_HISTORY_CAPACITY = 100;

export function createHistory(capacity = DEFAULT_HISTORY_CAPACITY): History {
  return { capacity, undoStack: [], redoStack: [] };
}

export const canUndo = (history: History): boolean => history.undoStack.length > 0;
export const canRedo = (history: History): boolean => history.redoStack.length > 0;

/** Records a successfully applied batch (the result of `applyBatch`) and clears redo. */
export function pushHistory(history: History, applied: HistoryEntry): History {
  const { batch, inverseBatch } = applied;
  const undoStack = [...history.undoStack, { batch, inverseBatch }];
  return {
    ...history,
    undoStack: history.capacity <= 0 ? [] : undoStack.slice(-history.capacity),
    redoStack: [],
  };
}

/**
 * Undo/redo replays are attributed to `manual`: they are user actions that restore a state the
 * user already accepted, so locks set after the original batch must not block them.
 */
const asManual = (batch: OperationBatch): OperationBatch => ({ ...batch, source: 'manual' });

export function undoHistory(history: History, doc: FormaDocument): HistoryResult {
  const entry = history.undoStack.at(-1);
  if (!entry) return { ok: false, error: { code: 'nothingToUndo', message: 'Nothing to undo.' } };
  const result = applyBatch(doc, asManual(entry.inverseBatch));
  if (!result.ok) return result;
  return {
    ok: true,
    doc: result.doc,
    history: {
      ...history,
      undoStack: history.undoStack.slice(0, -1),
      redoStack: [...history.redoStack, entry],
    },
  };
}

export function redoHistory(history: History, doc: FormaDocument): HistoryResult {
  const entry = history.redoStack.at(-1);
  if (!entry) return { ok: false, error: { code: 'nothingToRedo', message: 'Nothing to redo.' } };
  const result = applyBatch(doc, asManual(entry.batch));
  if (!result.ok) return result;
  return {
    ok: true,
    doc: result.doc,
    history: {
      ...history,
      undoStack: [...history.undoStack, entry],
      redoStack: history.redoStack.slice(0, -1),
    },
  };
}
