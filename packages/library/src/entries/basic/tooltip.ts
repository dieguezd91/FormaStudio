import { z } from 'zod';
import { COLLECTION_ROOT, itemBinding, rowPath } from '../../bindings';
import { createBuilder } from '../../builder';
import { defineEntry } from '../../catalog';
import { inventoryItemsDataSource } from '../../mock/items';
import { addText, surfaceStyle } from '../parts';

export const tooltipEntry = defineEntry({
  id: 'tooltip',
  kind: 'component',
  category: 'interaction',
  name: 'Tooltip de ítem',
  purpose: 'Muestra nombre, rareza y descripción de un ítem al pasar el cursor por encima.',
  tags: ['tooltip', 'descripción emergente', 'hover', 'ayuda', 'info de ítem', 'item tooltip'],
  behaviors: ['tooltip'],
  provenance: { kind: 'original' },
  compatibility: {
    'unity-ugui': {
      level: 'adapted',
      note: 'Panel que un MonoBehaviour posiciona junto al cursor.',
    },
    'unity-uitoolkit': {
      level: 'approximate',
      note: 'El tooltip nativo solo admite texto; se emula el contenido rico.',
    },
    'web-react': { level: 'supported', note: 'Popover posicionado en hover y foco.' },
  },
  params: z.strictObject({
    width: z.number().int().min(120).max(600).default(260).describe('Ancho'),
    showRarity: z.boolean().default(true).describe('Mostrar rareza'),
  }),
  build(params, ctx) {
    const b = createBuilder(ctx);
    const pad = ctx.tokens.spacingValue('sm');
    const inner = params.width - 2 * pad;
    const itemPath = rowPath(COLLECTION_ROOT, 0);
    const root = b.add('tooltip', {
      name: 'Tooltip de ítem',
      parentId: ctx.parentId,
      layout: { width: params.width, height: params.showRarity ? 112 : 88 },
      style: surfaceStyle(ctx.tokens),
      behaviors: [{ kind: 'tooltip', bindingPath: itemPath }],
    });
    const field = (
      name: string,
      text: string,
      y: number,
      extra: { size: 'title' | 'small'; muted?: boolean },
      path: string,
    ) => {
      const id = addText(b, ctx, { parentId: root, name, text, x: pad, y, width: inner, ...extra });
      b.setBinding(id, itemBinding('text', path));
    };
    field('Nombre', 'Nombre del ítem', pad, { size: 'title' }, rowPath(COLLECTION_ROOT, 0, 'name'));
    let y = pad + 32;
    if (params.showRarity) {
      field(
        'Rareza',
        'Rareza',
        y,
        { size: 'small', muted: true },
        rowPath(COLLECTION_ROOT, 0, 'rarity'),
      );
      y += 24;
    }
    addText(b, ctx, {
      parentId: root,
      name: 'Descripción',
      text: 'Descripción del ítem.',
      x: pad,
      y,
      width: inner,
      size: 'small',
    });
    return b.finish(root, { dataSources: [inventoryItemsDataSource()] });
  },
});
