import { describe, expect, it } from 'vitest';
import { DRAG_THRESHOLD, IDLE, LONG_PRESS_MS, gestureStep, type Gesture, type GestureResult } from './gestures';

const at = (x: number, y: number) => ({ x, y });
const down = (nodeId: string, pointerType = 'mouse', button = 0) =>
  ({ type: 'down', nodeId, point: at(10, 10), pointerType, button }) as const;

function run(start: Gesture, ...inputs: Parameters<typeof gestureStep>[1][]): GestureResult {
  let result: GestureResult = { gesture: start, events: [], timer: null };
  for (const input of inputs) result = gestureStep(result.gesture, input);
  return result;
}

describe('gestureStep', () => {
  it('a primary press and release on the same spot is a click', () => {
    const result = run(IDLE, down('a'), { type: 'up', nodeId: 'a', point: at(10, 10) });
    expect(result.events).toEqual([{ type: 'click', nodeId: 'a' }]);
    expect(result.gesture).toEqual(IDLE);
  });

  it('a secondary press opens the context menu at the pointer without starting a gesture', () => {
    const result = run(IDLE, down('a', 'mouse', 2));
    expect(result.events).toEqual([{ type: 'secondaryClick', nodeId: 'a', anchor: at(10, 10) }]);
    expect(result.gesture).toEqual(IDLE);
  });

  it('ignores other buttons', () => {
    expect(run(IDLE, down('a', 'mouse', 1))).toEqual({ gesture: IDLE, events: [], timer: null });
  });

  it('moving past the threshold starts a drag and reports the node under the pointer', () => {
    const result = run(IDLE, down('a'), { type: 'move', nodeId: 'a', point: at(10 + DRAG_THRESHOLD + 1, 10) });
    expect(result.events).toEqual([{ type: 'dragStart', nodeId: 'a' }, { type: 'dragOver', nodeId: 'a' }]);
    expect(result.gesture.phase).toBe('dragging');
  });

  it('small jitter is not a drag and still clicks', () => {
    const result = run(
      IDLE,
      down('a'),
      { type: 'move', nodeId: 'a', point: at(11, 11) },
      { type: 'up', nodeId: 'a', point: at(11, 11) },
    );
    expect(result.events).toEqual([{ type: 'click', nodeId: 'a' }]);
  });

  it('dragOver is only sent when the node under the pointer changes', () => {
    const start = run(IDLE, down('a'), { type: 'move', nodeId: 'a', point: at(30, 10) });
    const same = gestureStep(start.gesture, { type: 'move', nodeId: 'a', point: at(31, 10) });
    expect(same.events).toEqual([]);
    const other = gestureStep(same.gesture, { type: 'move', nodeId: 'b', point: at(60, 10) });
    expect(other.events).toEqual([{ type: 'dragOver', nodeId: 'b' }]);
  });

  it('releasing a drag over a node drops there; over nothing cancels', () => {
    const dragging = run(IDLE, down('a'), { type: 'move', nodeId: 'b', point: at(60, 10) }).gesture;
    expect(gestureStep(dragging, { type: 'up', nodeId: 'b', point: at(60, 10) }).events).toEqual([
      { type: 'drop', nodeId: 'b' },
    ]);
    expect(gestureStep(dragging, { type: 'up', nodeId: null, point: at(60, 10) }).events).toEqual([
      { type: 'dragCancel' },
    ]);
  });

  it('a cancelled pointer cancels the drag', () => {
    const dragging = run(IDLE, down('a'), { type: 'move', nodeId: 'b', point: at(60, 10) }).gesture;
    const result = gestureStep(dragging, { type: 'cancel' });
    expect(result.events).toEqual([{ type: 'dragCancel' }]);
    expect(result.gesture).toEqual(IDLE);
  });

  it('a pressed touch arms the long-press timer; mouse does not', () => {
    expect(run(IDLE, down('a', 'touch')).timer).toBe('start');
    expect(run(IDLE, down('a', 'mouse')).timer).toBeNull();
    expect(LONG_PRESS_MS).toBe(500);
  });

  it('the long press fires once and the release is not a click', () => {
    const fired = run(IDLE, down('a', 'touch'), { type: 'longPress' });
    expect(fired.events).toEqual([{ type: 'longPress', nodeId: 'a', anchor: at(10, 10) }]);
    const released = gestureStep(fired.gesture, { type: 'up', nodeId: 'a', point: at(10, 10) });
    expect(released.events).toEqual([]);
    expect(released.gesture).toEqual(IDLE);
  });

  it('moving or releasing before the timer disarms it', () => {
    const moved = run(IDLE, down('a', 'touch'), { type: 'move', nodeId: 'a', point: at(40, 10) });
    expect(moved.timer).toBe('cancel');
    const released = run(IDLE, down('a', 'touch'), { type: 'up', nodeId: 'a', point: at(10, 10) });
    expect(released.timer).toBe('cancel');
    expect(released.events).toEqual([{ type: 'click', nodeId: 'a' }]);
  });

  it('a stray long-press tick while idle does nothing', () => {
    expect(run(IDLE, { type: 'longPress' })).toEqual({ gesture: IDLE, events: [], timer: null });
  });

  it('a press without a node under the pointer does nothing', () => {
    expect(run(IDLE, { type: 'down', nodeId: null, point: at(1, 1), pointerType: 'mouse', button: 0 }).gesture).toEqual(
      IDLE,
    );
  });
});
