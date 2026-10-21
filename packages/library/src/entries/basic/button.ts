import { z } from 'zod';
import { createBuilder } from '../../builder';
import { defineEntry } from '../../catalog';

export const buttonEntry = defineEntry({
  id: 'button',
  kind: 'component',
  category: 'basic',
  name: 'Botón',
  purpose: 'Acción pulsable con etiqueta, para confirmar, cancelar o navegar.',
  tags: ['botón', 'boton', 'button', 'pulsador', 'acción', 'click'],
  behaviors: [],
  provenance: { kind: 'original' },
  compatibility: {
    'unity-ugui': { level: 'supported', note: 'Button con TextMeshPro nativo.' },
    'unity-uitoolkit': { level: 'supported', note: 'Button de UI Toolkit.' },
    'web-react': { level: 'supported', note: 'Elemento button estándar.' },
  },
  params: z.strictObject({
    label: z.string().min(1).default('Botón').describe('Etiqueta'),
    width: z.number().int().min(24).max(1000).default(160).describe('Ancho'),
    height: z.number().int().min(24).max(400).default(48).describe('Alto'),
  }),
  build(params, ctx) {
    const b = createBuilder(ctx);
    const rootNodeId = b.add('button', {
      name: 'Botón',
      parentId: ctx.parentId,
      layout: { x: 0, y: 0, width: params.width, height: params.height },
      style: {
        fill: ctx.tokens.color('accent'),
        textColor: ctx.tokens.color('accentText'),
        radius: ctx.tokens.radius('md'),
        fontSize: ctx.tokens.fontSize('body'),
      },
      props: { label: params.label },
    });
    return b.finish(rootNodeId);
  },
});
