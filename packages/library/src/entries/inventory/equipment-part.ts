import { collectionPath, itemBinding, rowPath } from '../../bindings';
import type { Builder } from '../../builder';
import type { BuildContext } from '../../catalog';
import { INTENT_IDS } from '../../intents';
import { addText, slotStyle, surfaceStyle } from '../parts';

export const EQUIPMENT_SLOT_TYPES = ['head', 'chest', 'legs', 'weapon', 'offhand'] as const;
export type EquipmentSlotType = (typeof EQUIPMENT_SLOT_TYPES)[number];

/** Paper-doll arrangement: [column, row] of each slot type in a 3x3 cell grid. */
const SLOT_CELLS: Record<EquipmentSlotType, readonly [number, number]> = {
  head: [1, 0],
  chest: [1, 1],
  legs: [1, 2],
  weapon: [0, 1],
  offhand: [2, 1],
};

const SLOT_LABELS: Record<EquipmentSlotType, string> = {
  head: 'Cabeza',
  chest: 'Torso',
  legs: 'Piernas',
  weapon: 'Arma',
  offhand: 'Mano secundaria',
};

const TITLE_HEIGHT = 32;

export interface EquipmentSpec {
  parentId: string;
  x: number;
  y: number;
  slots: readonly EquipmentSlotType[];
  slotSize: number;
}

/** Adds a panel with one drop-target equipmentSlot per requested slot type. */
export function addEquipmentPanel(
  b: Builder,
  ctx: BuildContext,
  spec: EquipmentSpec,
): { panelId: string; width: number; height: number } {
  const pad = ctx.tokens.spacingValue('md');
  const gap = ctx.tokens.spacingValue('xs');
  const cells = spec.slots.map((slot) => SLOT_CELLS[slot]);
  const columns = Math.max(...cells.map(([column]) => column)) + 1;
  const rows = Math.max(...cells.map(([, row]) => row)) + 1;
  const width = columns * spec.slotSize + (columns - 1) * gap + 2 * pad;
  const height = rows * spec.slotSize + (rows - 1) * gap + 2 * pad + TITLE_HEIGHT;

  const panelId = b.add('panel', {
    name: 'Panel de equipamiento',
    parentId: spec.parentId,
    layout: { x: spec.x, y: spec.y, width, height },
    style: surfaceStyle(ctx.tokens),
  });
  addText(b, ctx, {
    parentId: panelId,
    name: 'Título equipamiento',
    text: 'Equipamiento',
    x: pad,
    y: pad / 2,
    width: width - 2 * pad,
  });

  spec.slots.forEach((slotType, index) => {
    const [column, row] = cells[index] ?? [0, 0];
    const size = { width: spec.slotSize, height: spec.slotSize };
    const equipped = collectionPath({ field: 'slotType', value: slotType });
    const slotId = b.add('equipmentSlot', {
      name: `Equipo ${SLOT_LABELS[slotType]}`,
      parentId: panelId,
      layout: {
        x: pad + column * (spec.slotSize + gap),
        y: pad + TITLE_HEIGHT + row * (spec.slotSize + gap),
        ...size,
      },
      style: slotStyle(ctx.tokens),
      props: { slotType },
      behaviors: [
        { kind: 'dragDrop', role: 'target', accepts: [slotType], intentId: INTENT_IDS.equipItem },
        { kind: 'tooltip', bindingPath: rowPath(equipped, 0) },
      ],
    });
    b.add('itemView', {
      name: 'Ítem equipado',
      parentId: slotId,
      layout: size,
      bindings: [itemBinding('icon', rowPath(equipped, 0, 'icon'))],
    });
  });
  return { panelId, width, height };
}
