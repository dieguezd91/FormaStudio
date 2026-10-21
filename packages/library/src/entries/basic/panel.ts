import { z } from 'zod';
import { createBuilder } from '../../builder';
import { defineEntry } from '../../catalog';
import { surfaceStyle } from '../parts';

export const panelEntry = defineEntry({
  id: 'panel',
  kind: 'component',
  category: 'basic',
  name: 'Panel',
  purpose: 'Contenedor con fondo y borde para agrupar elementos relacionados.',
  tags: ['panel', 'contenedor', 'container', 'fondo', 'ventana', 'caja'],
  behaviors: [],
  provenance: { kind: 'original' },
  compatibility: {
    'unity-ugui': { level: 'supported', note: 'Image con RectTransform como contenedor.' },
    'unity-uitoolkit': { level: 'supported', note: 'VisualElement con estilo.' },
    'web-react': { level: 'supported', note: 'Elemento div con estilos.' },
  },
  params: z.strictObject({
    width: z.number().int().min(16).max(3840).default(320).describe('Ancho'),
    height: z.number().int().min(16).max(2160).default(240).describe('Alto'),
  }),
  build(params, ctx) {
    const b = createBuilder(ctx);
    const rootNodeId = b.add('panel', {
      name: 'Panel',
      parentId: ctx.parentId,
      layout: { x: 0, y: 0, width: params.width, height: params.height },
      style: surfaceStyle(ctx.tokens),
    });
    return b.finish(rootNodeId);
  },
});
