import { z } from 'zod';
import { createBuilder } from '../../builder';
import { defineEntry } from '../../catalog';
import { addTabs, addText, surfaceStyle } from '../parts';
import { addItemGrid } from './grid-part';
import { inventoryDependencies } from './item-behaviors';
import { categoriesParam, gridParamsShape } from './params';

const TITLE_HEIGHT = 32;

export const inventoryTabsEntry = defineEntry({
  id: 'inventory.tabs',
  kind: 'pattern',
  category: 'game-system',
  family: 'inventory',
  name: 'Inventario con pestañas',
  purpose:
    'Separa los objetos por categoría en pestañas para encontrar rápido lo que buscas en inventarios grandes.',
  tags: [
    'inventario',
    'pestañas',
    'pestanas',
    'solapas',
    'tabs',
    'categorías',
    'categorias',
    'filtrar por categoría',
    'objetos arrastrables',
    'drag and drop',
    'tabbed inventory',
  ],
  behaviors: ['tabs', 'dragDrop', 'stack', 'select', 'split', 'contextMenu', 'tooltip'],
  provenance: { kind: 'original' },
  compatibility: {
    'unity-ugui': {
      level: 'supported',
      note: 'Botones con ToggleGroup que activan una cuadrícula por categoría.',
    },
    'unity-uitoolkit': {
      level: 'adapted',
      note: 'Se adapta a TabView; el filtrado por categoría lo resuelve la fuente de datos.',
    },
    'web-react': {
      level: 'adapted',
      note: 'Pestañas con estado; el filtro por categoría se aplica en el cliente.',
    },
  },
  params: z.strictObject({ ...gridParamsShape, categories: categoriesParam }),
  build(params, ctx) {
    const b = createBuilder(ctx);
    const pad = ctx.tokens.spacingValue('md');
    const root = b.add('panel', {
      name: 'Inventario con pestañas',
      parentId: ctx.parentId,
      style: surfaceStyle(ctx.tokens),
    });
    addText(b, ctx, {
      parentId: root,
      name: 'Título',
      text: 'Inventario',
      x: pad,
      y: pad / 2,
      width: 240,
    });

    const gap = ctx.tokens.spacingValue('xs');
    const contentWidth = params.columns * params.slotSize + (params.columns - 1) * gap;
    const contentHeight = params.rows * params.slotSize + (params.rows - 1) * gap;
    const tabs = addTabs(b, ctx, {
      parentId: root,
      x: pad,
      y: pad / 2 + TITLE_HEIGHT,
      labels: params.categories,
      contentWidth,
      contentHeight,
      fillContent: (contentId, category) =>
        addItemGrid(b, ctx, {
          parentId: contentId,
          x: 0,
          y: 0,
          columns: params.columns,
          rows: params.rows,
          slotSize: params.slotSize,
          maxStack: params.maxStack,
          showCount: params.showCount,
          filter: { field: 'category', value: category },
          name: `Cuadrícula ${category}`,
        }),
    });
    b.resize(root, tabs.width + 2 * pad, tabs.height + pad + pad / 2 + TITLE_HEIGHT);
    return b.finish(root, inventoryDependencies());
  },
});
