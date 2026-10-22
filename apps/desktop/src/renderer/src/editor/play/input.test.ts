import { describe, expect, it } from 'vitest';
import { gamepadEvents, keyToEvent, type PadSnapshot } from './input';

const pad = (pressed: number[] = [], axes: number[] = [0, 0]): PadSnapshot => ({
  buttons: Array.from({ length: 16 }, (_, i) => pressed.includes(i)),
  axes,
});

describe('keyToEvent', () => {
  it('maps arrows to navigation', () => {
    expect(keyToEvent('ArrowUp')).toEqual({ type: 'navigate', direction: 'up' });
    expect(keyToEvent('ArrowDown')).toEqual({ type: 'navigate', direction: 'down' });
    expect(keyToEvent('ArrowLeft')).toEqual({ type: 'navigate', direction: 'left' });
    expect(keyToEvent('ArrowRight')).toEqual({ type: 'navigate', direction: 'right' });
  });

  it('maps Enter and Space to submit and Escape to cancel', () => {
    expect(keyToEvent('Enter')).toEqual({ type: 'submit' });
    expect(keyToEvent(' ')).toEqual({ type: 'submit' });
    expect(keyToEvent('Escape')).toEqual({ type: 'cancel' });
  });

  it('ignores every other key', () => {
    expect(keyToEvent('a')).toBeNull();
    expect(keyToEvent('Tab')).toBeNull();
  });
});

describe('gamepadEvents', () => {
  it('turns a fresh d-pad press into navigation', () => {
    expect(gamepadEvents(pad(), pad([12]))).toEqual([{ type: 'navigate', direction: 'up' }]);
    expect(gamepadEvents(pad(), pad([13]))).toEqual([{ type: 'navigate', direction: 'down' }]);
    expect(gamepadEvents(pad(), pad([14]))).toEqual([{ type: 'navigate', direction: 'left' }]);
    expect(gamepadEvents(pad(), pad([15]))).toEqual([{ type: 'navigate', direction: 'right' }]);
  });

  it('maps A to submit and B to cancel', () => {
    expect(gamepadEvents(pad(), pad([0]))).toEqual([{ type: 'submit' }]);
    expect(gamepadEvents(pad(), pad([1]))).toEqual([{ type: 'cancel' }]);
  });

  it('only fires on the rising edge', () => {
    expect(gamepadEvents(pad([0]), pad([0]))).toEqual([]);
    expect(gamepadEvents(pad([0]), pad())).toEqual([]);
  });

  it('treats the left stick as a d-pad once past the dead zone', () => {
    expect(gamepadEvents(pad([], [0, 0]), pad([], [0.9, 0]))).toEqual([{ type: 'navigate', direction: 'right' }]);
    expect(gamepadEvents(pad([], [0, 0]), pad([], [-0.9, 0]))).toEqual([{ type: 'navigate', direction: 'left' }]);
    expect(gamepadEvents(pad([], [0, 0]), pad([], [0, -0.9]))).toEqual([{ type: 'navigate', direction: 'up' }]);
    expect(gamepadEvents(pad([], [0, 0]), pad([], [0, 0.9]))).toEqual([{ type: 'navigate', direction: 'down' }]);
    expect(gamepadEvents(pad([], [0, 0]), pad([], [0.3, 0.2]))).toEqual([]);
  });

  it('does not repeat while the stick is held, nor double up with the d-pad', () => {
    expect(gamepadEvents(pad([], [0.9, 0]), pad([], [0.95, 0]))).toEqual([]);
    expect(gamepadEvents(pad([15], [0, 0]), pad([15], [0.9, 0]))).toEqual([]);
  });

  it('treats a missing previous snapshot as everything released', () => {
    expect(gamepadEvents(null, pad([0]))).toEqual([{ type: 'submit' }]);
  });
});
