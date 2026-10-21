import { describe, expect, it } from 'vitest';
import {
  canRedo,
  canUndo,
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
  type History,
} from './history';
import { applyBatch, type OperationBatch } from './operations';
import { makeDoc, mutate, nodeOf } from './test-fixtures';

const doc0 = makeDoc();

const rename = (id: string, name: string, source: OperationBatch['source'] = 'manual') =>
  ({
    id,
    label: `Rename to ${name}`,
    source,
    ops: [{ type: 'updateNode', screenId: 's1', nodeId: 'slot1', patch: { name } }],
  }) satisfies OperationBatch;

function run(doc: typeof doc0, history: History, batch: OperationBatch) {
  const result = applyBatch(doc, batch);
  if (!result.ok) throw new Error(result.error.message);
  return { doc: result.doc, history: pushHistory(history, result) };
}

describe('history', () => {
  it('starts empty', () => {
    const h = createHistory();
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });

  it('undoes and redoes through several steps', () => {
    let state = run(doc0, createHistory(), rename('b1', 'A'));
    const doc1 = state.doc;
    state = run(state.doc, state.history, rename('b2', 'B'));
    const doc2 = state.doc;
    expect(canUndo(state.history)).toBe(true);

    const u1 = undoHistory(state.history, doc2);
    if (!u1.ok) throw new Error(u1.error.message);
    expect(u1.doc).toEqual(doc1);
    const u2 = undoHistory(u1.history, u1.doc);
    if (!u2.ok) throw new Error(u2.error.message);
    expect(u2.doc).toEqual(doc0);
    expect(canUndo(u2.history)).toBe(false);
    expect(canRedo(u2.history)).toBe(true);

    const r1 = redoHistory(u2.history, u2.doc);
    if (!r1.ok) throw new Error(r1.error.message);
    expect(r1.doc).toEqual(doc1);
    const r2 = redoHistory(r1.history, r1.doc);
    if (!r2.ok) throw new Error(r2.error.message);
    expect(r2.doc).toEqual(doc2);
    expect(canRedo(r2.history)).toBe(false);
  });

  it('clears the redo stack on a new push', () => {
    const state = run(doc0, createHistory(), rename('b1', 'A'));
    const undone = undoHistory(state.history, state.doc);
    if (!undone.ok) throw new Error('unexpected');
    expect(canRedo(undone.history)).toBe(true);
    const next = run(undone.doc, undone.history, rename('b2', 'B'));
    expect(canRedo(next.history)).toBe(false);
  });

  it('drops the oldest entries beyond capacity', () => {
    let state = { doc: doc0, history: createHistory(2) };
    for (const name of ['A', 'B', 'C']) {
      state = run(state.doc, state.history, rename(`b${name}`, name));
    }
    expect(state.history.undoStack).toHaveLength(2);
    let current = state.doc;
    let history = state.history;
    for (let i = 0; i < 2; i++) {
      const u = undoHistory(history, current);
      if (!u.ok) throw new Error('unexpected');
      current = u.doc;
      history = u.history;
    }
    expect(nodeOf(current, 'slot1').name).toBe('A');
    const none = undoHistory(history, current);
    expect(!none.ok && none.error.code).toBe('nothingToUndo');
  });

  it('keeps nothing when capacity is 0', () => {
    const state = run(doc0, createHistory(0), rename('b1', 'A'));
    expect(canUndo(state.history)).toBe(false);
  });

  it('reports nothing to undo/redo without throwing', () => {
    const h = createHistory();
    const u = undoHistory(h, doc0);
    const r = redoHistory(h, doc0);
    expect(!u.ok && u.error.code).toBe('nothingToUndo');
    expect(!r.ok && r.error.code).toBe('nothingToRedo');
  });

  it('is immutable: pushing or undoing returns new histories', () => {
    const empty = createHistory();
    const state = run(doc0, empty, rename('b1', 'A'));
    expect(empty.undoStack).toHaveLength(0);
    const undone = undoHistory(state.history, state.doc);
    expect(state.history.undoStack).toHaveLength(1);
    expect(undone.ok && undone.history).not.toBe(state.history);
  });

  it('leaves the history unchanged when an undo cannot be applied', () => {
    const state = run(doc0, createHistory(), rename('b1', 'A'));
    const unrelated = mutate(state.doc, (d) => {
      d.screens = [];
    });
    const undone = undoHistory(state.history, unrelated);
    expect(undone.ok).toBe(false);
    expect(canUndo(state.history)).toBe(true);
  });

  it('undo and redo of AI batches are not blocked by locks added afterwards', () => {
    const state = run(doc0, createHistory(), rename('b1', 'AI name', 'ai'));
    const locked = mutate(state.doc, (d) => {
      nodeOf(d, 'slot1').locked = true;
    });
    const undone = undoHistory(state.history, locked);
    if (!undone.ok) throw new Error(undone.error.message);
    expect(nodeOf(undone.doc, 'slot1').name).toBe('Slot 1');
    const redone = redoHistory(undone.history, undone.doc);
    expect(redone.ok && nodeOf(redone.doc, 'slot1').name).toBe('AI name');
  });
});
