import { z } from 'zod';
import { createBuilder } from '../../builder';
import { defineEntry } from '../../catalog';
import { addText, surfaceStyle } from '../parts';
import { addEquipmentPanel } from './equipment-part';
import { addItemGrid } from './grid-part';
import { inventoryDependencies } from './item-behaviors';
import { gridParamsShape, slotTypesParam } from './params';

const TITLE_HEIGHT = 32;

export const inventoryGridEquipmentEntry = defineEntry({
  id: 'inventory.grid+equipment',
  kind: 'pattern',
  category: 'game-system',
  family: 'inventory',
  name: 'Cuadrícula + equipamiento',
  purpose:
    'Inventario y equipamiento en una sola pantalla para equipar objetos arrastrándolos al personaje.',
  tags: [
    'inventario',
    'equipamiento',
    'cuadrícula',
    'cuadricula',
    'inventario y equipo',
    'equipment',
    'grid',
    'objetos arrastrables',
    'drag and drop',
  ],
  behaviors: ['dragDrop', 'stack', 'select', 'split', 'contextMenu', 'tooltip'],
  provenance: { kind: 'original' },
  compatibility: {
    'unity-ugui': {
      level: 'supported',
      note: 'Cuadrícula de casillas y EquipmentSlot que comparten fuente de datos.',
    },
    'unity-uitoolkit': {
      level: 'adapted',
      note: 'Dos contenedores con arrastre propio entre ellos.',
    },
    'web-react': {
      level: 'adapted',
      note: 'Arrastre HTML5 entre la cuadrícula y las zonas de equipo.',
    },
  },
  params: z.strictObject({ ...gridParamsShape, slots: slotTypesParam }),
  build(params, ctx) {
    const b = createBuilder(ctx);
    const pad = ctx.tokens.spacingValue('md');
    const root = b.add('panel', {
      name: 'Inventario y equipamiento',
      parentId: ctx.parentId,
      style: surfaceStyle(ctx.tokens),
    });
    const equipment = addEquipmentPanel(b, ctx, {
      parentId: root,
      x: pad,
      y: pad,
      slots: params.slots,
      slotSize: params.slotSize,
    });
    const gridX = pad + equipment.width + pad;
    addText(b, ctx, {
      parentId: root,
      name: 'Título',
      text: 'Inventario',
      x: gridX,
      y: pad / 2,
      width: 240,
    });
    const gridY = pad / 2 + TITLE_HEIGHT;
    const grid = addItemGrid(b, ctx, {
      parentId: root,
      x: gridX,
      y: gridY,
      columns: params.columns,
      rows: params.rows,
      slotSize: params.slotSize,
      maxStack: params.maxStack,
      showCount: params.showCount,
    });
    b.resize(
      root,
      gridX + grid.width + pad,
      Math.max(pad + equipment.height, gridY + grid.height) + pad,
    );
    return b.finish(root, inventoryDependencies());
  },
});
