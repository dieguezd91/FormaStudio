import type { Direction, UiEvent } from '@forma/runtime';

const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

/** Keyboard input of Probar: arrows navigate, Enter/Space submit, Escape cancels. */
export function keyToEvent(key: string): UiEvent | null {
  const direction = KEY_DIRECTIONS[key];
  if (direction) return { type: 'navigate', direction };
  if (key === 'Enter' || key === ' ') return { type: 'submit' };
  if (key === 'Escape') return { type: 'cancel' };
  return null;
}

/** The parts of a `Gamepad` the mapping needs. */
export interface PadSnapshot {
  buttons: boolean[];
  axes: number[];
}

/** Standard mapping: d-pad 12-15, A = 0 (submit), B = 1 (cancel). */
const PAD_DIRECTIONS: [button: number, direction: Direction][] = [
  [12, 'up'],
  [13, 'down'],
  [14, 'left'],
  [15, 'right'],
];
const BUTTON_A = 0;
const BUTTON_B = 1;
const STICK_THRESHOLD = 0.5;

/** Directions held right now: d-pad or left stick. */
function heldDirections(pad: PadSnapshot | null): Set<Direction> {
  const held = new Set<Direction>();
  if (!pad) return held;
  for (const [button, direction] of PAD_DIRECTIONS) if (pad.buttons[button]) held.add(direction);
  const [x = 0, y = 0] = pad.axes;
  if (x > STICK_THRESHOLD) held.add('right');
  if (x < -STICK_THRESHOLD) held.add('left');
  if (y > STICK_THRESHOLD) held.add('down');
  if (y < -STICK_THRESHOLD) held.add('up');
  return held;
}

/** Events for what was newly pressed between two polls (no key repeat). */
export function gamepadEvents(previous: PadSnapshot | null, next: PadSnapshot): UiEvent[] {
  const events: UiEvent[] = [];
  const before = heldDirections(previous);
  for (const direction of heldDirections(next)) {
    if (!before.has(direction)) events.push({ type: 'navigate', direction });
  }
  if (next.buttons[BUTTON_A] && !previous?.buttons[BUTTON_A]) events.push({ type: 'submit' });
  if (next.buttons[BUTTON_B] && !previous?.buttons[BUTTON_B]) events.push({ type: 'cancel' });
  return events;
}
