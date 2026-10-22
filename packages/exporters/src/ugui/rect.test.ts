import { describe, expect, it } from 'vitest';
import { toRect } from './rect';

const parent = { width: 800, height: 600 };
const layout = { x: 10, y: 20, width: 100, height: 50 } as const;

describe('toRect', () => {
  it('maps the default top-left layout to a top-left anchored rect with Y flipped', () => {
    expect(toRect(layout, parent)).toEqual({
      anchorMin: { x: 0, y: 1 },
      anchorMax: { x: 0, y: 1 },
      pivot: { x: 0, y: 1 },
      anchoredPosition: { x: 10, y: -20 },
      sizeDelta: { x: 100, y: 50 },
    });
  });

  it('treats an explicit top-left anchor like the default', () => {
    expect(toRect({ ...layout, anchor: 'top-left' }, parent)).toEqual(toRect(layout, parent));
  });

  it('is relative to the parent, so nested nodes only need their own layout', () => {
    expect(toRect({ x: 4, y: 6, width: 20, height: 30 }, { width: 100, height: 50 })).toMatchObject(
      { anchoredPosition: { x: 4, y: -6 }, sizeDelta: { x: 20, y: 30 } },
    );
  });

  it('stretch anchors to the whole parent and turns the layout into insets', () => {
    const rect = toRect({ ...layout, anchor: 'stretch' }, parent);
    expect(rect.anchorMin).toEqual({ x: 0, y: 0 });
    expect(rect.anchorMax).toEqual({ x: 1, y: 1 });
    expect(rect.pivot).toEqual({ x: 0.5, y: 0.5 });
    // size = parent + sizeDelta, so the node keeps its insets whatever the parent becomes.
    expect(rect.sizeDelta).toEqual({ x: 100 - 800, y: 50 - 600 });
    expect(rect.anchoredPosition).toEqual({ x: 10 + 50 - 400, y: -(20 + 25 - 300) });
  });

  it('a full-size stretched root has zero offsets', () => {
    const rect = toRect({ x: 0, y: 0, width: 800, height: 600, anchor: 'stretch' }, parent);
    expect(rect.sizeDelta).toEqual({ x: 0, y: 0 });
    expect(rect.anchoredPosition).toEqual({ x: 0, y: 0 });
  });

  it('center places the node relative to the middle of the parent', () => {
    const rect = toRect({ x: 350, y: 275, width: 100, height: 50, anchor: 'center' }, parent);
    expect(rect.anchorMin).toEqual({ x: 0.5, y: 0.5 });
    expect(rect.anchorMax).toEqual({ x: 0.5, y: 0.5 });
    expect(rect.pivot).toEqual({ x: 0.5, y: 0.5 });
    expect(rect.anchoredPosition).toEqual({ x: 0, y: 0 });
    expect(rect.sizeDelta).toEqual({ x: 100, y: 50 });
  });

  it('bottom-right anchors to the parent corner and offsets from it', () => {
    const rect = toRect({ x: 690, y: 530, width: 100, height: 50, anchor: 'bottom-right' }, parent);
    expect(rect.anchorMin).toEqual({ x: 1, y: 0 });
    expect(rect.pivot).toEqual({ x: 1, y: 0 });
    expect(rect.anchoredPosition).toEqual({ x: -10, y: 20 });
  });
});
