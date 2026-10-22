import type { Anchor, Layout, Size } from '@forma/design-core';
import type { UguiRect } from './bundle';

/** Where an anchor sits inside the parent, as fractions from the top-left corner (Y down). */
const ANCHOR_FRACTIONS: Record<Exclude<Anchor, 'stretch'>, readonly [number, number]> = {
  'top-left': [0, 0],
  top: [0.5, 0],
  'top-right': [1, 0],
  left: [0, 0.5],
  center: [0.5, 0.5],
  right: [1, 0.5],
  'bottom-left': [0, 1],
  bottom: [0.5, 1],
  'bottom-right': [1, 1],
};

/** The part of a node's layout that decides its RectTransform. */
export type RectLayout = Pick<Layout, 'x' | 'y' | 'width' | 'height' | 'anchor'>;

/** Avoids `-0` leaking into the bundle. */
const clean = (n: number): number => (n === 0 ? 0 : n);

/**
 * Forma layout (top-left origin inside the parent, Y down) to a uGUI RectTransform (Y up).
 *
 * With fractions (fx, fy) from the parent's top-left corner (default anchor `top-left` = (0, 0)):
 *
 *   anchorMin = anchorMax = pivot = (fx, 1 - fy)
 *   anchoredPosition      = ( x + fx*w - fx*pw ,  -(y + fy*h - fy*ph) )
 *   sizeDelta             = ( w, h )
 *
 * so the default is anchors (0,1), pivot (0,1), anchoredPosition (x, -y), sizeDelta (w, h), and
 * `center` is the same maths with fractions (0.5, 0.5), i.e. the position is relative to the
 * parent's center.
 *
 * `stretch` anchors to the whole parent (anchors (0,0)-(1,1), pivot (0.5, 0.5)) and reads
 * x/y/width/height as insets at the reference size:
 *
 *   sizeDelta        = ( w - pw , h - ph )
 *   anchoredPosition = ( x + w/2 - pw/2 , -(y + h/2 - ph/2) )
 *
 * where (pw, ph) is the parent's size (the screen size for the root).
 */
export function toRect(layout: RectLayout, parent: Size): UguiRect {
  const { x, y, width: w, height: h } = layout;
  const { width: pw, height: ph } = parent;

  if (layout.anchor === 'stretch') {
    return {
      anchorMin: { x: 0, y: 0 },
      anchorMax: { x: 1, y: 1 },
      pivot: { x: 0.5, y: 0.5 },
      anchoredPosition: { x: clean(x + w / 2 - pw / 2), y: clean(-(y + h / 2 - ph / 2)) },
      sizeDelta: { x: clean(w - pw), y: clean(h - ph) },
    };
  }

  const [fx, fy] = ANCHOR_FRACTIONS[layout.anchor ?? 'top-left'];
  const point = () => ({ x: fx, y: 1 - fy });
  return {
    anchorMin: point(),
    anchorMax: point(),
    pivot: point(),
    anchoredPosition: { x: clean(x + fx * w - fx * pw), y: clean(-(y + fy * h - fy * ph)) },
    sizeDelta: { x: w, y: h },
  };
}
