import type { DataSource } from '@forma/design-core';

export const INVENTORY_ITEMS_ID = 'inventory.items';

export const INVENTORY_ITEM_CATEGORIES = ['Armas', 'Armaduras', 'Consumibles', 'Materiales'];

export type InventoryItem = {
  id: string;
  name: string;
  icon: string;
  quantity: number;
  maxStack: number;
  category: string;
  slotType: string;
  rarity: string;
};

const item = (
  id: string,
  name: string,
  category: string,
  slotType: string,
  rarity: string,
  quantity: number,
  maxStack: number,
): InventoryItem => ({
  id,
  name,
  icon: `mock/icons/${id}.png`,
  quantity,
  maxStack,
  category,
  slotType,
  rarity,
});

export const INVENTORY_ITEMS: InventoryItem[] = [
  item('espada-de-hierro', 'Espada de hierro', 'Armas', 'weapon', 'común', 1, 1),
  item('arco-de-fresno', 'Arco de fresno', 'Armas', 'weapon', 'poco común', 1, 1),
  item('baston-de-runas', 'Bastón de runas', 'Armas', 'weapon', 'raro', 1, 1),
  item('daga-del-cazador', 'Daga del cazador', 'Armas', 'weapon', 'épico', 1, 1),
  item('yelmo-de-acero', 'Yelmo de acero', 'Armaduras', 'head', 'poco común', 1, 1),
  item('peto-de-cuero', 'Peto de cuero', 'Armaduras', 'chest', 'común', 1, 1),
  item('grebas-de-malla', 'Grebas de malla', 'Armaduras', 'legs', 'raro', 1, 1),
  item('escudo-de-roble', 'Escudo de roble', 'Armaduras', 'offhand', 'común', 1, 1),
  item('pocion-de-vida', 'Poción de vida', 'Consumibles', 'none', 'común', 5, 20),
  item('pocion-de-mana', 'Poción de maná', 'Consumibles', 'none', 'poco común', 3, 20),
  item('pan-de-viaje', 'Pan de viaje', 'Consumibles', 'none', 'común', 8, 20),
  item('elixir-de-vigor', 'Elixir de vigor', 'Consumibles', 'none', 'raro', 2, 10),
  item('mineral-de-hierro', 'Mineral de hierro', 'Materiales', 'none', 'común', 12, 50),
  item('cuero-curtido', 'Cuero curtido', 'Materiales', 'none', 'común', 7, 50),
  item('hierba-lunar', 'Hierba lunar', 'Materiales', 'none', 'poco común', 15, 50),
  item('esencia-arcana', 'Esencia arcana', 'Materiales', 'none', 'épico', 4, 50),
];

/** A fresh data source on every call, so inserted documents never share mock arrays. */
export function inventoryItemsDataSource(): DataSource {
  return {
    id: INVENTORY_ITEMS_ID,
    name: INVENTORY_ITEMS_ID,
    kind: 'collection',
    fields: [
      { name: 'id', type: 'id' },
      { name: 'name', type: 'string' },
      { name: 'icon', type: 'image' },
      { name: 'quantity', type: 'number' },
      { name: 'maxStack', type: 'number' },
      { name: 'category', type: 'string' },
      { name: 'slotType', type: 'string' },
      { name: 'rarity', type: 'string' },
    ],
    mock: INVENTORY_ITEMS.map((i) => ({ ...i })),
    connection: 'simulated',
  };
}
