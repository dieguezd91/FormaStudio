import { inventoryEquipmentEntry } from './equipment';
import { inventoryGridEntry } from './grid';
import { inventoryGridEquipmentEntry } from './grid-equipment';
import { inventoryListEntry } from './list';
import { inventoryTabsEntry } from './tabs';

export const INVENTORY_ENTRIES = [
  inventoryGridEntry,
  inventoryTabsEntry,
  inventoryEquipmentEntry,
  inventoryListEntry,
  inventoryGridEquipmentEntry,
];
