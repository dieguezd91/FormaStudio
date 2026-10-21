import { describe, expect, it } from 'vitest';
import { clampZoom, fitZoom, nudgeDelta, snap, stepZoom } from './geometry';

describe('fitZoom', () => {
  it('scales the screen to fit the viewport minus padding', () => {
    expect(fitZoom({ width: 1000, height: 800 }, { width: 1920, height: 1080 }, 20)).toBeCloseTo(
      960 / 1920,
    );
  });

  it('is limited by the tighter dimension', () => {
    expect(fitZoom({ width: 2000, height: 300 }, { width: 1000, height: 1000 }, 0)).toBeCloseTo(0.3);
  });

  it('falls back to 1 for an empty viewport', () => {
    expect(fitZoom({ width: 0, height: 0 }, { width: 100, height: 100 })).toBe(1);
  });
});

describe('zoom steps', () => {
  it('steps up and down and clamps', () => {
    expect(stepZoom(1, 1)).toBeGreaterThan(1);
    expect(stepZoom(1, -1)).toBeLessThan(1);
    expect(stepZoom(4, 1)).toBe(4);
    expect(clampZoom(0.001)).toBe(0.1);
    expect(clampZoom(99)).toBe(4);
  });
});

describe('snap', () => {
  it('rounds to the 8px grid only when enabled', () => {
    expect(snap(13, true)).toBe(16);
    expect(snap(11, true)).toBe(8);
    expect(snap(13, false)).toBe(13);
    expect(snap(-5, true)).toBe(-8);
  });

  it('always yields whole pixels when disabled', () => {
    expect(snap(12.6, false)).toBe(13);
  });
});

describe('nudgeDelta', () => {
  it('moves 1px, or 10px with shift', () => {
    expect(nudgeDelta('ArrowLeft', false)).toEqual({ dx: -1, dy: 0 });
    expect(nudgeDelta('ArrowDown', true)).toEqual({ dx: 0, dy: 10 });
    expect(nudgeDelta('a', false)).toBeUndefined();
  });
});
