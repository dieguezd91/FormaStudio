import { z } from 'zod';
import { collectionPath, itemBinding, rowPath } from '../../bindings';
import { createBuilder } from '../../builder';
import { defineEntry } from '../../catalog';
import { addText, slotStyle, surfaceStyle } from '../parts';
import { inventoryDependencies, itemSlotBehaviors } from './item-behaviors';
import { filterValue } from './params';

const TITLE_HEIGHT = 32;
const SEARCH_HEIGHT = 36;
const ROW_HEIGHT = 48;
const MAX_VISIBLE_ROWS = 6;

export const inventoryListEntry = defineEntry({
  id: 'inventory.list',
  kind: 'pattern',
  category: 'game-system',
  family: 'inventory',
  name: 'Lista filtrable',
  purpose:
    'Lista con desplazamiento y buscador para localizar objetos por nombre cuando hay muchos.',
  tags: [
    'inventario',
    'lista',
    'listado',
    'list',
    'filtrable',
    'filtrar',
    'buscador',
    'búsqueda',
    'busqueda',
    'search',
    'scroll',
    'objetos arrastrables',
  ],
  behaviors: ['dragDrop', 'stack', 'select', 'split', 'contextMenu', 'tooltip'],
  provenance: { kind: 'original' },
  compatibility: {
    'unity-ugui': {
      level: 'supported',
      note: 'ScrollRect con VerticalLayoutGroup; el buscador filtra la fuente de datos.',
    },
    'unity-uitoolkit': {
      level: 'supported',
      note: 'ListView nativo con TextField como buscador.',
    },
    'web-react': { level: 'supported', note: 'Lista con scroll y campo de búsqueda controlado.' },
  },
  params: z.strictObject({
    rows: z.number().int().min(1).max(40).default(8).describe('Filas'),
    category: filterValue.optional().describe('Categoría fija (opcional)'),
    maxStack: z.number().int().positive().default(99).describe('Máximo por pila'),
    showCount: z.boolean().default(true).describe('Mostrar cantidad'),
  }),
  build(params, ctx) {
    const b = createBuilder(ctx);
    const pad = ctx.tokens.spacingValue('md');
    const gap = ctx.tokens.spacingValue('xs');
    const inner = 288;
    const collection = collectionPath(
      params.category ? { field: 'category', value: params.category } : undefined,
    );

    const root = b.add('panel', {
      name: 'Lista de inventario',
      parentId: ctx.parentId,
      layout: { width: inner + 2 * pad },
      style: surfaceStyle(ctx.tokens),
    });
    addText(b, ctx, {
      parentId: root,
      name: 'Título',
      text: 'Inventario',
      x: pad,
      y: pad / 2,
      width: inner,
    });

    const search = b.add('panel', {
      name: 'Buscador',
      parentId: root,
      layout: { x: pad, y: pad / 2 + TITLE_HEIGHT, width: inner, height: SEARCH_HEIGHT },
      style: slotStyle(ctx.tokens),
    });
    addText(b, ctx, {
      parentId: search,
      name: 'Texto de búsqueda',
      text: 'Buscar objetos…',
      x: pad / 2,
      y: 6,
      width: inner - pad,
      muted: true,
    });

    const scrollY = pad / 2 + TITLE_HEIGHT + SEARCH_HEIGHT + gap;
    const visibleRows = Math.min(params.rows, MAX_VISIBLE_ROWS);
    const viewportHeight = visibleRows * ROW_HEIGHT + (visibleRows - 1) * gap;
    const scroll = b.add('scroll', {
      name: 'Lista de objetos',
      parentId: root,
      layout: { x: pad, y: scrollY, width: inner, height: viewportHeight, mode: 'column' },
      props: { direction: 'vertical' },
      bindings: [itemBinding('items', collection)],
    });

    for (let index = 0; index < params.rows; index++) {
      const row = b.add('slot', {
        name: `Fila ${index + 1}`,
        parentId: scroll,
        layout: { x: 0, y: index * (ROW_HEIGHT + gap), width: inner, height: ROW_HEIGHT },
        style: slotStyle(ctx.tokens),
        behaviors: itemSlotBehaviors({
          maxStack: params.maxStack,
          showCount: params.showCount,
          itemPath: rowPath(collection, index),
        }),
      });
      b.add('itemView', {
        name: 'Ítem',
        parentId: row,
        layout: { x: gap, y: gap, width: ROW_HEIGHT - 2 * gap, height: ROW_HEIGHT - 2 * gap },
        bindings: [
          itemBinding('icon', rowPath(collection, index, 'icon')),
          itemBinding('quantity', rowPath(collection, index, 'quantity')),
        ],
      });
      const name = addText(b, ctx, {
        parentId: row,
        name: 'Nombre',
        text: 'Nombre del objeto',
        x: ROW_HEIGHT + gap,
        y: 12,
        width: inner - ROW_HEIGHT - 2 * gap,
      });
      b.setBinding(name, itemBinding('text', rowPath(collection, index, 'name')));
    }

    b.resize(root, inner + 2 * pad, scrollY + viewportHeight + pad);
    return b.finish(root, inventoryDependencies());
  },
});
