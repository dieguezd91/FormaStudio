import type { Point, UiEvent } from '@forma/runtime';

/** Touch hold that opens the context menu. */
export const LONG_PRESS_MS = 500;
/** Pointer travel (px) before a press becomes a drag. */
export const DRAG_THRESHOLD = 4;

/** What the pointer is doing between press and release. */
export type Gesture =
  | { phase: 'idle' }
  | { phase: 'pressed'; nodeId: string; start: Point; pointerType: string }
  /** The long press already fired: the release must not also click. */
  | { phase: 'consumed' }
  | { phase: 'dragging'; over: string | null };

export const IDLE: Gesture = { phase: 'idle' };

/** `nodeId` is the node under the pointer (null: none). */
export type GestureInput =
  | { type: 'down'; nodeId: string | null; point: Point; pointerType: string; button: number }
  | { type: 'move'; nodeId: string | null; point: Point }
  | { type: 'up'; nodeId: string | null; point: Point }
  | { type: 'cancel' }
  | { type: 'longPress' };

export interface GestureResult {
  gesture: Gesture;
  events: UiEvent[];
  /** Whether the caller must arm or disarm the long-press timer. */
  timer: 'start' | 'cancel' | null;
}

const result = (
  gesture: Gesture,
  events: UiEvent[] = [],
  timer: GestureResult['timer'] = null,
): GestureResult => ({ gesture, events, timer });

const isTouchLike = (pointerType: string) => pointerType !== 'mouse';

const travelled = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Pure pointer state machine of Probar: raw pointer input in, runtime `UiEvent`s out. Works the
 * same for mouse, touch and pen; the caller owns the long-press timer.
 */
export function gestureStep(gesture: Gesture, input: GestureInput): GestureResult {
  switch (input.type) {
    case 'down': {
      if (input.nodeId === null) return result(IDLE);
      if (input.button === 2) {
        return result(IDLE, [{ type: 'secondaryClick', nodeId: input.nodeId, anchor: input.point }]);
      }
      if (input.button !== 0) return result(IDLE);
      return result(
        { phase: 'pressed', nodeId: input.nodeId, start: input.point, pointerType: input.pointerType },
        [],
        isTouchLike(input.pointerType) ? 'start' : null,
      );
    }
    case 'move': {
      if (gesture.phase === 'pressed') {
        if (travelled(gesture.start, input.point) <= DRAG_THRESHOLD) return result(gesture);
        const events: UiEvent[] = [{ type: 'dragStart', nodeId: gesture.nodeId }];
        if (input.nodeId !== null) events.push({ type: 'dragOver', nodeId: input.nodeId });
        return result({ phase: 'dragging', over: input.nodeId }, events, 'cancel');
      }
      if (gesture.phase === 'dragging' && input.nodeId !== gesture.over) {
        return result(
          { phase: 'dragging', over: input.nodeId },
          input.nodeId === null ? [] : [{ type: 'dragOver', nodeId: input.nodeId }],
        );
      }
      return result(gesture);
    }
    case 'up': {
      if (gesture.phase === 'pressed') {
        return result(IDLE, [{ type: 'click', nodeId: gesture.nodeId }], 'cancel');
      }
      if (gesture.phase === 'dragging') {
        return result(IDLE, [
          input.nodeId === null ? { type: 'dragCancel' } : { type: 'drop', nodeId: input.nodeId },
        ]);
      }
      return result(IDLE);
    }
    case 'cancel':
      return result(IDLE, gesture.phase === 'dragging' ? [{ type: 'dragCancel' }] : [], 'cancel');
    case 'longPress':
      if (gesture.phase !== 'pressed') return result(gesture);
      return result({ phase: 'consumed' }, [
        { type: 'longPress', nodeId: gesture.nodeId, anchor: gesture.start },
      ]);
  }
}
