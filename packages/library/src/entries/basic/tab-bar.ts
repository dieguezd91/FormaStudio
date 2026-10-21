import { z } from 'zod';
import { createBuilder } from '../../builder';
import { defineEntry } from '../../catalog';
import { addTabs, addText, surfaceStyle } from '../parts';

export const tabBarEntry = defineEntry({
  id: 'tabBar',
  kind: 'component',
  category: 'navigation',
  name: 'Barra de pestañas',
  purpose: 'Cambia entre varias vistas del mismo espacio sin salir de la pantalla.',
  tags: ['pestañas', 'pestanas', 'tabs', 'solapas', 'navegación', 'tab bar'],
  behaviors: ['tabs'],
  provenance: { kind: 'original' },
  compatibility: {
    'unity-ugui': {
      level: 'supported',
      note: 'Botones con ToggleGroup y un controlador de pestañas.',
    },
    'unity-uitoolkit': { level: 'adapted', note: 'Se adapta a TabView / Tab de UI Toolkit.' },
    'web-react': { level: 'supported', note: 'Pestañas con estado de pestaña activa.' },
  },
  params: z.strictObject({
    tabs: z
      .array(z.string().min(1))
      .min(1)
      .max(8)
      .default(['Pestaña 1', 'Pestaña 2', 'Pestaña 3'])
      .describe('Pestañas'),
    contentWidth: z.number().int().min(120).max(1600).default(480).describe('Ancho del contenido'),
    contentHeight: z.number().int().min(60).max(1200).default(280).describe('Alto del contenido'),
  }),
  build(params, ctx) {
    const b = createBuilder(ctx);
    const pad = ctx.tokens.spacingValue('md');
    const root = b.add('panel', {
      name: 'Pestañas',
      parentId: ctx.parentId,
      style: surfaceStyle(ctx.tokens),
    });
    const tabs = addTabs(b, ctx, {
      parentId: root,
      x: pad,
      y: pad,
      labels: params.tabs,
      contentWidth: params.contentWidth,
      contentHeight: params.contentHeight,
      fillContent: (contentId, label) =>
        addText(b, ctx, {
          parentId: contentId,
          name: `Texto ${label}`,
          text: `Contenido de ${label}`,
          x: 0,
          y: 0,
          width: params.contentWidth,
          muted: true,
        }),
    });
    b.resize(root, tabs.width + 2 * pad, tabs.height + 2 * pad);
    return b.finish(root);
  },
});
