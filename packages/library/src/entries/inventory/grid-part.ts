import { collectionPath, itemBinding, rowPath, type ItemFilter } from '../../bindings';
import type { Builder } from '../../builder';
import type { BuildContext } from '../../catalog';
import { slotStyle } from '../parts';
import { itemSlotBehaviors } from './item-behaviors';

export interface GridSpec {
  parentId: string;
  x: number;
  y: number;
  columns: number;
  rows: number;
  slotSize: number;
  maxStack: number;
  showCount: boolean;
  filter?: ItemFilter;
  name?: string;
}

/** Adds an inventoryGrid with columns x rows slots, each holding a bound itemView. */
export function addItemGrid(
  b: Builder,
  ctx: BuildContext,
  spec: GridSpec,
): { gridId: string; width: number; height: number } {
  const gap = ctx.tokens.spacingValue('xs');
  const size = { width: spec.slotSize, height: spec.slotSize };
  const width = spec.columns * spec.slotSize + (spec.columns - 1) * gap;
  const height = spec.rows * spec.slotSize + (spec.rows - 1) * gap;
  const collection = collectionPath(spec.filter);

  const gridId = b.add('inventoryGrid', {
    name: spec.name ?? 'Cuadrícula de inventario',
    parentId: spec.parentId,
    layout: {
      x: spec.x,
      y: spec.y,
      width,
      height,
      mode: 'grid',
      columns: spec.columns,
      cellSize: size,
      gap: ctx.tokens.spacing('xs'),
    },
    props: { columns: spec.columns, rows: spec.rows, slotSize: size },
    bindings: [itemBinding('items', collection)],
  });

  for (let index = 0; index < spec.columns * spec.rows; index++) {
    const slotId = b.add('slot', {
      name: `Casilla ${index + 1}`,
      parentId: gridId,
      layout: {
        x: (index % spec.columns) * (spec.slotSize + gap),
        y: Math.floor(index / spec.columns) * (spec.slotSize + gap),
        ...size,
      },
      style: slotStyle(ctx.tokens),
      behaviors: itemSlotBehaviors({
        maxStack: spec.maxStack,
        showCount: spec.showCount,
        itemPath: rowPath(collection, index),
      }),
    });
    b.add('itemView', {
      name: 'Ítem',
      parentId: slotId,
      layout: size,
      bindings: [
        itemBinding('icon', rowPath(collection, index, 'icon')),
        itemBinding('quantity', rowPath(collection, index, 'quantity')),
      ],
    });
  }
  return { gridId, width, height };
}
