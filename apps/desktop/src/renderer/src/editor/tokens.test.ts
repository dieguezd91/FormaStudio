import { describe, expect, it } from 'vitest';
import { listTokens, resolveNodeStyle, resolveStyleValue } from './tokens';

const tokens = {
  colors: { accent: '#d9a441', 'text.muted': '#999999' },
  fontSizes: { body: 16 },
  spacing: {},
  radii: { sm: 4 },
};

describe('resolveStyleValue', () => {
  it('returns literals untouched', () => {
    expect(resolveStyleValue('#fff', tokens)).toBe('#fff');
    expect(resolveStyleValue(0, tokens)).toBe(0);
  });

  it('resolves token references against the project tokens', () => {
    expect(resolveStyleValue({ token: 'colors.accent' }, tokens)).toBe('#d9a441');
    expect(resolveStyleValue({ token: 'fontSizes.body' }, tokens)).toBe(16);
  });

  it('supports token names that contain dots', () => {
    expect(resolveStyleValue({ token: 'colors.text.muted' }, tokens)).toBe('#999999');
  });

  it('returns undefined for unknown, malformed or prototype-chain tokens', () => {
    expect(resolveStyleValue({ token: 'colors.missing' }, tokens)).toBeUndefined();
    expect(resolveStyleValue({ token: 'nope' }, tokens)).toBeUndefined();
    expect(resolveStyleValue({ token: 'colors.toString' }, tokens)).toBeUndefined();
    expect(resolveStyleValue({ token: 'toString.x' }, tokens)).toBeUndefined();
    expect(resolveStyleValue(undefined, tokens)).toBeUndefined();
  });
});

describe('resolveNodeStyle', () => {
  it('resolves every style field and drops unresolved ones', () => {
    const style = resolveNodeStyle(
      { fill: { token: 'colors.accent' }, radius: { token: 'radii.sm' }, stroke: { token: 'colors.x' }, opacity: 0.5 },
      tokens,
    );
    expect(style).toEqual({ fill: '#d9a441', radius: 4, opacity: 0.5 });
  });
});

describe('listTokens', () => {
  it('lists the tokens of a group with their full path', () => {
    expect(listTokens(tokens, 'radii')).toEqual([{ path: 'radii.sm', name: 'sm', value: 4 }]);
  });
});
