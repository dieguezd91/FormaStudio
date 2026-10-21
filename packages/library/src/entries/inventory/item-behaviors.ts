import type { Behavior } from '@forma/design-core';
import { INTENT_IDS, INVENTORY_INTENTS, cloneIntents } from '../../intents';
import { inventoryItemsDataSource } from '../../mock/items';
import type { BuildResult } from '../../catalog';

export interface ItemSlotBehaviorSpec {
  maxStack: number;
  showCount: boolean;
  /** Binding path of the item the slot shows, used by the tooltip. */
  itemPath: string;
}

/** Everything a slot that holds a movable, stackable item can do. */
export function itemSlotBehaviors(spec: ItemSlotBehaviorSpec): Behavior[] {
  return [
    { kind: 'dragDrop', role: 'both', accepts: ['item'], intentId: INTENT_IDS.moveItem },
    { kind: 'stack', maxStack: spec.maxStack, showCount: spec.showCount },
    { kind: 'select', mode: 'single' },
    { kind: 'split', intentId: INTENT_IDS.splitStack },
    {
      kind: 'contextMenu',
      trigger: 'secondaryClick',
      actions: [
        { id: 'use', label: 'Usar', intentId: INTENT_IDS.useItem },
        { id: 'split', label: 'Dividir', intentId: INTENT_IDS.splitStack },
        { id: 'drop', label: 'Soltar', intentId: INTENT_IDS.dropItem },
      ],
    },
    { kind: 'tooltip', bindingPath: spec.itemPath },
  ];
}

/** Mock data and intents every inventory variant ships with (deduped on insert). */
export const inventoryDependencies = (): Pick<BuildResult, 'dataSources' | 'intents'> => ({
  dataSources: [inventoryItemsDataSource()],
  intents: cloneIntents(INVENTORY_INTENTS),
});
