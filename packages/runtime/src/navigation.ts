import type { ScreenIndex } from './screen';
import type { Direction } from './types';

/** Distance along the movement axis; the cross axis counts double so focus prefers straight lines. */
const CROSS_AXIS_WEIGHT = 2;
const EPSILON = 0.5;

const center = (index: ScreenIndex, id: string) => {
  const rect = index.rect(id);
  return rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : undefined;
};

/** Reading order: top to bottom, then left to right. */
const readingOrder = (index: ScreenIndex, ids: readonly string[]) =>
  [...ids].sort((a, b) => {
    const pa = center(index, a);
    const pb = center(index, b);
    return pa && pb ? pa.y - pb.y || pa.x - pb.x : 0;
  });

/**
 * Next focus target in `direction` among `candidates` (visible focusable nodes), using their
 * absolute rects. With no (valid) current focus the first node in reading order is returned;
 * when nothing lies in that direction, the current focus stays.
 */
export function nextFocus(
  index: ScreenIndex,
  candidates: readonly string[],
  current: string | null,
  direction: Direction,
): string | null {
  const ordered = readingOrder(index, candidates);
  const from = current !== null && ordered.includes(current) ? center(index, current) : undefined;
  if (current === null || !from) return ordered[0] ?? null;

  let best: string | null = null;
  let bestScore = Infinity;
  for (const id of ordered) {
    const to = center(index, id);
    if (id === current || !to) continue;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const [along, across] =
      direction === 'right'
        ? [dx, dy]
        : direction === 'left'
          ? [-dx, dy]
          : direction === 'down'
            ? [dy, dx]
            : [-dy, dx];
    if (along <= EPSILON) continue;
    const score = along + CROSS_AXIS_WEIGHT * Math.abs(across);
    if (score < bestScore) {
      best = id;
      bestScore = score;
    }
  }
  return best ?? current;
}
