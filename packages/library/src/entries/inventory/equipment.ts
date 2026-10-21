import { z } from 'zod';
import { createBuilder } from '../../builder';
import { defineEntry } from '../../catalog';
import { addEquipmentPanel } from './equipment-part';
import { inventoryDependencies } from './item-behaviors';
import { slotTypesParam } from './params';

export const inventoryEquipmentEntry = defineEntry({
  id: 'inventory.equipment',
  kind: 'pattern',
  category: 'game-system',
  family: 'inventory',
  name: 'Panel de equipamiento',
  purpose:
    'Muestra lo que lleva puesto el personaje, con casillas por tipo que solo aceptan el objeto adecuado.',
  tags: [
    'equipamiento',
    'equipo del personaje',
    'slots de equipamiento',
    'equipar',
    'paper doll',
    'equipment',
    'objetos arrastrables',
    'drag and drop',
  ],
  behaviors: ['dragDrop', 'tooltip'],
  provenance: { kind: 'original' },
  compatibility: {
    'unity-ugui': {
      level: 'supported',
      note: 'Casillas EquipmentSlot que solo aceptan su tipo de objeto.',
    },
    'unity-uitoolkit': {
      level: 'adapted',
      note: 'VisualElements posicionados; el arrastre usa PointerManipulator propios.',
    },
    'web-react': {
      level: 'adapted',
      note: 'Zonas de destino HTML5 que validan el tipo de casilla.',
    },
  },
  params: z.strictObject({
    slots: slotTypesParam,
    slotSize: z.number().int().min(24).max(160).default(64).describe('Tamaño de casilla'),
  }),
  build(params, ctx) {
    const b = createBuilder(ctx);
    const equipment = addEquipmentPanel(b, ctx, {
      parentId: ctx.parentId,
      x: 0,
      y: 0,
      slots: params.slots,
      slotSize: params.slotSize,
    });
    return b.finish(equipment.panelId, inventoryDependencies());
  },
});
