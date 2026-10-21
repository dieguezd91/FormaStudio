import { z } from 'zod';
import { createBuilder } from '../../builder';
import { defineEntry } from '../../catalog';
import { addText, surfaceStyle } from '../parts';
import { addItemGrid } from './grid-part';
import { inventoryDependencies } from './item-behaviors';
import { gridParamsShape } from './params';

const TITLE_HEIGHT = 32;

export const inventoryGridEntry = defineEntry({
  id: 'inventory.grid',
  kind: 'pattern',
  category: 'game-system',
  family: 'inventory',
  name: 'Cuadrícula clásica',
  purpose:
    'Inventario de casillas donde se arrastran, apilan y dividen objetos, con menú contextual y tooltip.',
  tags: [
    'inventario',
    'cuadrícula',
    'cuadricula',
    'grid',
    'casillas',
    'slots',
    'objetos arrastrables',
    'arrastrar y soltar',
    'drag and drop',
    'pilas',
    'stack',
    'mochila',
    'menú contextual',
  ],
  behaviors: ['dragDrop', 'stack', 'select', 'split', 'contextMenu', 'tooltip'],
  provenance: { kind: 'original' },
  compatibility: {
    'unity-ugui': {
      level: 'supported',
      note: 'GridLayoutGroup con casillas InventorySlot y una fuente IInventorySource.',
    },
    'unity-uitoolkit': {
      level: 'adapted',
      note: 'Se adapta a un contenedor wrap; el arrastre usa PointerManipulator propios.',
    },
    'web-react': {
      level: 'adapted',
      note: 'CSS grid con eventos de arrastre HTML5; la división de pilas es personalizada.',
    },
  },
  params: z.strictObject(gridParamsShape),
  build(params, ctx) {
    const b = createBuilder(ctx);
    const pad = ctx.tokens.spacingValue('md');
    const root = b.add('panel', {
      name: 'Inventario',
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
    const grid = addItemGrid(b, ctx, {
      parentId: root,
      x: pad,
      y: pad / 2 + TITLE_HEIGHT,
      columns: params.columns,
      rows: params.rows,
      slotSize: params.slotSize,
      maxStack: params.maxStack,
      showCount: params.showCount,
    });
    b.resize(root, grid.width + 2 * pad, grid.height + pad + pad / 2 + TITLE_HEIGHT);
    return b.finish(root, inventoryDependencies());
  },
});
