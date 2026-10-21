import { z } from 'zod';
import { createBuilder } from '../../builder';
import { defineEntry } from '../../catalog';
import { addText } from '../parts';

export const textEntry = defineEntry({
  id: 'text',
  kind: 'component',
  category: 'basic',
  name: 'Texto',
  purpose: 'Etiqueta o párrafo de texto con tamaño y alineación configurables.',
  tags: ['texto', 'text', 'etiqueta', 'label', 'título', 'titulo'],
  behaviors: [],
  provenance: { kind: 'original' },
  compatibility: {
    'unity-ugui': { level: 'supported', note: 'TextMeshPro - Text (UI).' },
    'unity-uitoolkit': { level: 'supported', note: 'Label de UI Toolkit.' },
    'web-react': { level: 'supported', note: 'Elemento de texto estándar.' },
  },
  params: z.strictObject({
    text: z.string().default('Texto').describe('Contenido'),
    align: z.enum(['left', 'center', 'right']).default('left').describe('Alineación'),
    size: z.enum(['small', 'body', 'title']).default('body').describe('Tamaño'),
    width: z.number().int().min(24).max(1600).default(200).describe('Ancho'),
  }),
  build(params, ctx) {
    const b = createBuilder(ctx);
    const rootNodeId = addText(b, ctx, {
      parentId: ctx.parentId,
      name: 'Texto',
      text: params.text,
      x: 0,
      y: 0,
      width: params.width,
      size: params.size,
      align: params.align,
    });
    return b.finish(rootNodeId);
  },
});
