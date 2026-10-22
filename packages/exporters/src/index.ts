import type { Result } from '@forma/design-core';
import { createUguiExporter } from './ugui';
import { type ExportError, type ExportTargetId, type Exporter } from './types';

export * from './report';
export * from './types';
export * from './ugui';

const TARGET_NAMES: Record<ExportTargetId, string> = {
  'unity-ugui': 'Unity uGUI',
  'unity-uitoolkit': 'Unity UI Toolkit',
  'web-react': 'Web (React)',
};

/** UI Toolkit and web are declared targets; only uGUI has an implementation in this slice. */
export function getExporter(target: ExportTargetId): Result<Exporter, ExportError> {
  if (target === 'unity-ugui') return { ok: true, value: createUguiExporter() };
  return {
    ok: false,
    error: {
      code: 'notImplemented',
      reasons: [`El exportador para ${TARGET_NAMES[target]} todavía no está implementado.`],
    },
  };
}
