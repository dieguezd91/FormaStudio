import { useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import Moveable from 'react-moveable';
import type { FormaScreen } from '@forma/design-core';
import type { LayoutUpdate } from '../batches';
import { snap } from './geometry';

interface Props {
  screen: FormaScreen;
  /** Movable (unlocked, non-root, visible) selected node ids. */
  targets: readonly string[];
  zoom: number;
  snapEnabled: boolean;
  /** Receives ONE call per gesture, with the final layout of every touched node. */
  onCommit: (updates: LayoutUpdate[]) => void;
  /** A click inside the selection area; `elementId` is the node under the pointer. */
  onAreaClick: (elementId: string | undefined, additive: boolean) => void;
}

interface Gesture {
  element: HTMLElement | SVGElement;
  x: number;
  y: number;
  width: number;
  height: number;
  dx: number;
  dy: number;
  w: number;
  h: number;
  resized: boolean;
  moved: boolean;
}

const selectorFor = (id: string) => `[data-node-id="${id.replace(/["\\]/g, '\\$&')}"]`;

/**
 * Move/resize handles for the selection. During a gesture only inline styles of the DOM element
 * change; the document is touched once, on release, so a drag is a single undo step.
 */
export function SelectionControls({
  screen,
  targets,
  zoom,
  snapEnabled,
  onCommit,
  onAreaClick,
}: Props) {
  const moveable = useRef<Moveable>(null);
  const gestures = useRef(new Map<string, Gesture>());

  // Handles must follow the node after the document (or zoom) changed under them.
  useEffect(() => {
    moveable.current?.updateRect();
  }, [screen, zoom, targets]);

  if (targets.length === 0) return null;

  const begin = (element: HTMLElement | SVGElement) => {
    const id = element.getAttribute('data-node-id');
    const node = id ? screen.nodes[id] : undefined;
    if (!id || !node) return undefined;
    const gesture: Gesture = {
      element,
      x: node.layout.x,
      y: node.layout.y,
      width: node.layout.width,
      height: node.layout.height,
      dx: 0,
      dy: 0,
      w: node.layout.width,
      h: node.layout.height,
      resized: false,
      moved: false,
    };
    gestures.current.set(id, gesture);
    return gesture;
  };

  const gestureOf = (element: HTMLElement | SVGElement) => {
    const id = element.getAttribute('data-node-id');
    return id ? gestures.current.get(id) : undefined;
  };

  const drag = (element: HTMLElement | SVGElement, translate: number[]) => {
    const gesture = gestureOf(element);
    if (!gesture) return;
    gesture.dx = snap(gesture.x + (translate[0] ?? 0), snapEnabled) - gesture.x;
    gesture.dy = snap(gesture.y + (translate[1] ?? 0), snapEnabled) - gesture.y;
    gesture.moved = true;
    element.style.transform = `translate(${gesture.dx}px, ${gesture.dy}px)`;
  };

  const resize = (
    element: HTMLElement | SVGElement,
    width: number,
    height: number,
    translate: number[],
  ) => {
    const gesture = gestureOf(element);
    if (!gesture) return;
    gesture.w = Math.max(1, snap(width, snapEnabled));
    gesture.h = Math.max(1, snap(height, snapEnabled));
    gesture.dx = snap(gesture.x + (translate[0] ?? 0), snapEnabled) - gesture.x;
    gesture.dy = snap(gesture.y + (translate[1] ?? 0), snapEnabled) - gesture.y;
    gesture.resized = true;
    gesture.moved = true;
    element.style.width = `${gesture.w}px`;
    element.style.height = `${gesture.h}px`;
    element.style.transform = `translate(${gesture.dx}px, ${gesture.dy}px)`;
  };

  const finish = () => {
    const updates: LayoutUpdate[] = [];
    const used = [...gestures.current.entries()];
    gestures.current.clear();
    for (const [nodeId, g] of used) {
      if (!g.moved) continue;
      const layout: LayoutUpdate['layout'] = { x: g.x + g.dx, y: g.y + g.dy };
      if (g.resized) {
        layout.width = g.w;
        layout.height = g.h;
      }
      const changed =
        layout.x !== g.x || layout.y !== g.y || (g.resized && (g.w !== g.width || g.h !== g.height));
      if (changed) updates.push({ nodeId, layout });
    }
    // Commit first so React already holds the final layout when the temporary styles go away.
    if (updates.length > 0) flushSync(() => onCommit(updates));
    for (const [, g] of used) {
      g.element.style.removeProperty('transform');
      g.element.style.removeProperty('width');
      g.element.style.removeProperty('height');
    }
  };

  const idUnder = (inputTarget: EventTarget) =>
    (inputTarget as Element).closest?.('[data-node-id]')?.getAttribute('data-node-id') ?? undefined;

  return (
    <Moveable
      ref={moveable}
      target={targets.map(selectorFor)}
      draggable
      resizable
      dragArea
      origin={false}
      throttleDrag={0}
      throttleResize={0}
      keepRatio={false}
      renderDirections={['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se']}
      onDragStart={({ target }) => {
        begin(target);
      }}
      onDrag={({ target, beforeTranslate }) => drag(target, beforeTranslate)}
      onDragEnd={finish}
      onDragGroupStart={({ events }) => {
        for (const event of events) begin(event.target);
      }}
      onDragGroup={({ events }) => {
        for (const event of events) drag(event.target, event.beforeTranslate);
      }}
      onDragGroupEnd={finish}
      onResizeStart={({ target, setOrigin, dragStart }) => {
        begin(target);
        setOrigin(['%', '%']);
        if (dragStart) dragStart.set([0, 0]);
      }}
      onResize={({ target, width, height, drag: d }) => resize(target, width, height, d.beforeTranslate)}
      onResizeEnd={finish}
      onResizeGroupStart={({ events }) => {
        for (const event of events) {
          begin(event.target);
          event.setOrigin(['%', '%']);
          if (event.dragStart) event.dragStart.set([0, 0]);
        }
      }}
      onResizeGroup={({ events }) => {
        for (const event of events) {
          resize(event.target, event.width, event.height, event.drag.beforeTranslate);
        }
      }}
      onResizeGroupEnd={finish}
      onClick={({ inputTarget, inputEvent }) =>
        onAreaClick(idUnder(inputTarget), (inputEvent as MouseEvent).shiftKey)
      }
      onClickGroup={({ inputTarget, inputEvent }) =>
        onAreaClick(idUnder(inputTarget), (inputEvent as MouseEvent).shiftKey)
      }
    />
  );
}
