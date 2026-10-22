import { describe, expect, it } from 'vitest';
import { EXPORT_TARGETS, getExporter } from './index';

describe('getExporter', () => {
  it('declares the supported export targets', () => {
    expect(EXPORT_TARGETS).toEqual(['unity-ugui', 'unity-uitoolkit', 'web-react']);
  });

  it('returns the uGUI exporter', () => {
    const result = getExporter('unity-ugui');
    expect(result.ok && result.value.target).toBe('unity-ugui');
  });

  it.each(['unity-uitoolkit', 'web-react'] as const)(
    'answers honestly that %s is not implemented',
    (target) => {
      const result = getExporter(target);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('notImplemented');
      expect(result.error.reasons.join(' ')).toContain('todavía no');
    },
  );
});
