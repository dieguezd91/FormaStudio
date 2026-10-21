export const SNAP_GRID = 8;
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;

const ZOOM_STEPS = [0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4];

export const clampZoom = (zoom: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** Zoom that fits the whole screen inside the viewport, leaving `padding` px on every side. */
export function fitZoom(
  viewport: { width: number; height: number },
  size: { width: number; height: number },
  padding = 32,
): number {
  const width = viewport.width - padding * 2;
  const height = viewport.height - padding * 2;
  if (width <= 0 || height <= 0 || size.width <= 0 || size.height <= 0) return 1;
  return clampZoom(Math.min(width / size.width, height / size.height));
}

export function stepZoom(zoom: number, direction: 1 | -1): number {
  const next =
    direction > 0
      ? ZOOM_STEPS.find((step) => step > zoom + 1e-6)
      : [...ZOOM_STEPS].reverse().find((step) => step < zoom - 1e-6);
  return clampZoom(next ?? zoom);
}

/** Whole pixels, on the 8px grid when snapping is on. */
export function snap(value: number, enabled: boolean, grid = SNAP_GRID): number {
  return enabled ? Math.round(value / grid) * grid : Math.round(value);
}

const ARROWS: Record<string, { dx: number; dy: number }> = {
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
};

/** Keyboard nudge: 1px, or 10px with Shift. */
export function nudgeDelta(key: string, shift: boolean): { dx: number; dy: number } | undefined {
  const arrow = ARROWS[key];
  if (!arrow) return undefined;
  const step = shift ? 10 : 1;
  return { dx: arrow.dx * step, dy: arrow.dy * step };
}
