import { describe, expect, it } from 'vitest';
import { EXPORT_TARGETS, type Exporter } from './index';

describe('exporters', () => {
  it('declares the supported export targets', () => {
    expect(EXPORT_TARGETS).toEqual(['unity-ugui', 'unity-uitoolkit', 'web-react']);
  });

  it('allows implementing the Exporter interface', async () => {
    const exporter: Exporter = {
      target: 'unity-ugui',
      export: async () => ({ files: {} }),
    };
    await expect(exporter.export({})).resolves.toEqual({ files: {} });
  });
});
