import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import type { Point, Runtime } from '@forma/runtime';
import { IDLE, LONG_PRESS_MS, gestureStep, type Gesture, type GestureInput } from './gestures';
import { gamepadEvents, keyToEvent, type PadSnapshot } from './input';

/** Node of the prototype under a viewport point (null: none). */
function nodeAt(x: number, y: number): string | null {
  const element = document.elementFromPoint(x, y);
  return element?.closest<HTMLElement>('[data-play-node]')?.dataset['playNode'] ?? null;
}

export interface PointerInput {
  onPointerDown: (event: ReactPointerEvent) => void;
  onPointerMove: (event: ReactPointerEvent) => void;
  onPointerLeave: () => void;
  /** Viewport position of the drag ghost while an item is being dragged. */
  ghost: Point | null;
  /** Viewport position where the last hover started, for the tooltip. */
  hoverAt: Point | null;
}

/**
 * Pointer (mouse, touch, pen) input of Probar: feeds the pure gesture machine and dispatches the
 * resulting events. `frameRef` is the scaled stage box, used to express anchors in screen pixels.
 */
export function usePointerInput(
  runtime: Runtime,
  frameRef: RefObject<HTMLElement | null>,
  zoom: number,
): PointerInput {
  const gesture = useRef<Gesture>(IDLE);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hovered = useRef<string | null>(null);
  const [ghost, setGhost] = useState<Point | null>(null);
  const [hoverAt, setHoverAt] = useState<Point | null>(null);

  const toScreen = (client: Point): Point => {
    const rect = frameRef.current?.getBoundingClientRect();
    return rect ? { x: (client.x - rect.left) / zoom, y: (client.y - rect.top) / zoom } : client;
  };

  const feed = (input: GestureInput) => {
    const step = gestureStep(gesture.current, input);
    gesture.current = step.gesture;
    if (step.timer === 'start') {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => feed({ type: 'longPress' }), LONG_PRESS_MS);
    } else if (step.timer === 'cancel') {
      clearTimeout(timer.current);
    }
    for (const event of step.events) {
      runtime.dispatch('anchor' in event ? { ...event, anchor: toScreen(event.anchor) } : event);
    }
    if (step.gesture.phase !== 'dragging') setGhost(null);
  };

  const onWindowMove = useEffectEvent((event: PointerEvent) => {
    if (gesture.current.phase === 'idle') return;
    const point = { x: event.clientX, y: event.clientY };
    feed({ type: 'move', nodeId: nodeAt(event.clientX, event.clientY), point });
    if (gesture.current.phase === 'dragging') setGhost(point);
  });
  const onWindowUp = useEffectEvent((event: PointerEvent) => {
    if (gesture.current.phase === 'idle') return;
    const point = { x: event.clientX, y: event.clientY };
    feed({ type: 'up', nodeId: nodeAt(event.clientX, event.clientY), point });
  });
  const onWindowCancel = useEffectEvent(() => feed({ type: 'cancel' }));

  useEffect(() => {
    window.addEventListener('pointermove', onWindowMove);
    window.addEventListener('pointerup', onWindowUp);
    window.addEventListener('pointercancel', onWindowCancel);
    return () => {
      window.removeEventListener('pointermove', onWindowMove);
      window.removeEventListener('pointerup', onWindowUp);
      window.removeEventListener('pointercancel', onWindowCancel);
      clearTimeout(timer.current);
    };
  }, []);

  return {
    ghost,
    hoverAt,
    onPointerDown(event) {
      hovered.current = null;
      runtime.dispatch({ type: 'hover', nodeId: null });
      feed({
        type: 'down',
        nodeId: nodeAt(event.clientX, event.clientY),
        point: { x: event.clientX, y: event.clientY },
        pointerType: event.pointerType,
        button: event.button,
      });
    },
    onPointerMove(event) {
      if (gesture.current.phase !== 'idle' || event.pointerType !== 'mouse') return;
      const nodeId = nodeAt(event.clientX, event.clientY);
      if (nodeId === hovered.current) return;
      hovered.current = nodeId;
      setHoverAt({ x: event.clientX, y: event.clientY });
      runtime.dispatch({ type: 'hover', nodeId });
    },
    onPointerLeave() {
      if (hovered.current === null) return;
      hovered.current = null;
      runtime.dispatch({ type: 'hover', nodeId: null });
    },
  };
}

/** Keys that belong to the focused control, not to the prototype. */
const OWN_KEYS_CONTROLS = 'button, input, select, textarea, [role="tab"], [role="menuitem"]';

/** Arrows / Enter / Space / Escape drive the prototype (Escape always, the rest outside controls). */
export function useKeyboardInput(runtime: Runtime): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const mapped = keyToEvent(event.key);
      if (!mapped) return;
      const target = event.target instanceof Element ? event.target : null;
      if (mapped.type !== 'cancel' && target?.closest(OWN_KEYS_CONTROLS)) return;
      event.preventDefault();
      runtime.dispatch(mapped);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [runtime]);
}

const connectedPad = (): Gamepad | undefined =>
  Array.from(navigator.getGamepads?.() ?? []).find((pad): pad is Gamepad => pad?.connected === true);

/** Polls the first connected gamepad (d-pad / left stick, A, B). Returns whether one is connected. */
export function useGamepad(runtime: Runtime): boolean {
  const [connected, setConnected] = useState(() => connectedPad() !== undefined);

  useEffect(() => {
    const sync = () => setConnected(connectedPad() !== undefined);
    window.addEventListener('gamepadconnected', sync);
    window.addEventListener('gamepaddisconnected', sync);
    return () => {
      window.removeEventListener('gamepadconnected', sync);
      window.removeEventListener('gamepaddisconnected', sync);
    };
  }, []);

  useEffect(() => {
    if (!connected) return;
    let frame = 0;
    let previous: PadSnapshot | null = null;
    const poll = () => {
      const pad = connectedPad();
      if (pad) {
        const snapshot = { buttons: pad.buttons.map((b) => b.pressed), axes: [...pad.axes] };
        for (const event of gamepadEvents(previous, snapshot)) runtime.dispatch(event);
        previous = snapshot;
      } else {
        previous = null;
      }
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frame);
  }, [connected, runtime]);

  return connected;
}
